"""
SmartFlow Media Processing Tasks
Async video/audio processing using FFmpeg.
Handles transcoding, HLS generation, thumbnail extraction.
"""
import os
import shutil
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import structlog

from app.workers.celery_app import celery_app

logger = structlog.get_logger(__name__)

UPLOAD_DIR = Path(os.environ.get("LOCAL_STORAGE_PATH", "uploads"))
PROCESSED_DIR = UPLOAD_DIR / "processed"
THUMBS_DIR = UPLOAD_DIR / "thumbnails"
HLS_DIR = UPLOAD_DIR / "hls"


def _ensure_dirs():
    for d in [UPLOAD_DIR, PROCESSED_DIR, THUMBS_DIR, HLS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def _run_ffmpeg(*args, timeout: int = 300) -> subprocess.CompletedProcess:
    """Run FFmpeg with timeout and proper error handling."""
    ffmpeg = os.environ.get("FFMPEG_PATH", "ffmpeg")
    cmd = [ffmpeg] + list(args)
    logger.info("ffmpeg_command", cmd=" ".join(str(a) for a in cmd[:6]))
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
        if result.returncode != 0:
            logger.warning("ffmpeg_error", stderr=result.stderr.decode()[-500:])
        return result
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg_timeout", timeout=timeout)
        raise
    except FileNotFoundError:
        logger.error("ffmpeg_not_found")
        raise


def _run_ffprobe(input_path: str) -> Optional[dict]:
    """Extract media metadata using ffprobe."""
    import json
    ffprobe = os.environ.get("FFPROBE_PATH", "ffprobe")
    try:
        result = subprocess.run(
            [
                ffprobe, "-v", "quiet",
                "-print_format", "json",
                "-show_streams", "-show_format",
                str(input_path),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
            check=False,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        return None
    except Exception as e:
        logger.warning("ffprobe_failed", error=str(e))
        return None


@celery_app.task(
    name="app.workers.media_tasks.process_video",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def process_video(self, job_id: str, content_id: str, source_path: str):
    """
    Full video processing pipeline:
    1. FFprobe metadata extraction
    2. Thumbnail generation
    3. HLS transcoding
    4. Update DB with results
    """
    _ensure_dirs()
    logger.info("video_processing_started", job_id=job_id, content_id=content_id)

    from app.extensions import db
    from app.models import ProcessingJob, ProcessingEvent, Content, ContentVersion, StorageObject

    def update_job(status: str, progress: float, message: str = "", output: dict = None):
        job = ProcessingJob.query.get(job_id)
        if job:
            job.status = status
            job.progress = progress
            if status in ("completed", "failed"):
                job.completed_at = datetime.now(timezone.utc)
            if status == "processing" and not job.started_at:
                job.started_at = datetime.now(timezone.utc)
            if output:
                job.output_data = output
            event = ProcessingEvent(
                job_id=job_id,
                event_type=status,
                message=message,
                data={"progress": progress},
            )
            db.session.add(event)
            db.session.commit()

    try:
        update_job("processing", 5.0, "Starting video processing")

        source = Path(source_path)
        if not source.exists():
            raise FileNotFoundError(f"Source file not found: {source_path}")

        # Step 1: Metadata extraction
        update_job("processing", 10.0, "Extracting metadata")
        probe_data = _run_ffprobe(str(source))

        metadata = {}
        duration = None
        width = height = None

        if probe_data:
            fmt = probe_data.get("format", {})
            duration = float(fmt.get("duration", 0)) or None
            for stream in probe_data.get("streams", []):
                if stream.get("codec_type") == "video":
                    width = stream.get("width")
                    height = stream.get("height")
                    metadata["codec"] = stream.get("codec_name")
                    metadata["fps"] = stream.get("r_frame_rate")
                    break
            metadata["duration"] = duration
            metadata["size_bytes"] = int(fmt.get("size", 0))

        # Update content metadata
        content = Content.query.get(content_id)
        if content:
            content.duration_seconds = duration
            content.width = width
            content.height = height
            content.metadata_ = {**content.metadata_, **metadata}
            db.session.commit()

        # Step 2: Thumbnail
        update_job("processing", 25.0, "Generating thumbnail")
        thumb_key = f"thumbnails/{content_id}.jpg"
        thumb_path = THUMBS_DIR / f"{content_id}.jpg"
        seek_time = min(duration * 0.1, 5.0) if duration else 2.0

        result = _run_ffmpeg(
            "-ss", str(seek_time),
            "-i", str(source),
            "-vframes", "1",
            "-vf", "scale=640:-1",
            "-q:v", "2",
            str(thumb_path),
            "-y",
            timeout=60,
        )

        if result.returncode == 0 and thumb_path.exists():
            if content:
                content.thumbnail_url = f"/api/v1/storage/file/{thumb_key}"
                db.session.commit()

        # Step 3: HLS transcoding
        update_job("processing", 40.0, "Transcoding to HLS")
        hls_dir = HLS_DIR / content_id
        hls_dir.mkdir(parents=True, exist_ok=True)

        qualities = [
            (1280, 720, "720p", "2000k"),
            (854, 480, "480p", "1000k"),
            (640, 360, "360p", "600k"),
        ]

        manifest_lines = ["#EXTM3U", "#EXT-X-VERSION:3", ""]
        progress_per_quality = 40.0 / len(qualities)
        current_progress = 40.0

        for (w, h, label, bitrate) in qualities:
            if width and width < w:
                continue  # Skip qualities higher than source

            quality_dir = hls_dir / label
            quality_dir.mkdir(exist_ok=True)
            playlist = quality_dir / "playlist.m3u8"

            result = _run_ffmpeg(
                "-i", str(source),
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-maxrate", bitrate,
                "-bufsize", str(int(bitrate[:-1]) * 2) + "k",
                "-vf", f"scale={w}:{h}",
                "-c:a", "aac",
                "-b:a", "128k",
                "-hls_time", "6",
                "-hls_list_size", "0",
                "-hls_segment_filename", str(quality_dir / "seg_%03d.ts"),
                "-f", "hls",
                str(playlist),
                "-y",
                timeout=600,
            )

            if result.returncode == 0 and playlist.exists():
                manifest_lines.append(f"#EXT-X-STREAM-INF:BANDWIDTH={int(bitrate[:-1])*1000},RESOLUTION={w}x{h}")
                manifest_lines.append(f"{label}/playlist.m3u8")

                # Record ContentVersion
                existing = ContentVersion.query.filter_by(
                    content_id=content_id, quality_label=label
                ).first()
                if not existing:
                    version = ContentVersion(
                        content_id=content_id,
                        quality_label=label,
                        storage_key=f"hls/{content_id}/{label}/playlist.m3u8",
                        is_hls=True,
                        is_original=False,
                    )
                    db.session.add(version)

            current_progress += progress_per_quality
            update_job("processing", current_progress, f"Transcoded {label}")

        # Write master manifest
        master_manifest = hls_dir / "master.m3u8"
        master_manifest.write_text("\n".join(manifest_lines))

        db.session.commit()

        update_job(
            "completed",
            100.0,
            "Video processing complete",
            output={
                "hls_manifest": f"hls/{content_id}/master.m3u8",
                "thumbnail": thumb_key,
                "metadata": metadata,
            }
        )
        logger.info("video_processing_complete", job_id=job_id, content_id=content_id)

    except Exception as exc:
        logger.exception("video_processing_failed", job_id=job_id, error=str(exc))
        update_job("failed", 0.0, f"Processing failed: {str(exc)[:200]}")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(
    name="app.workers.media_tasks.extract_image_metadata",
    bind=True,
    max_retries=2,
)
def extract_image_metadata(self, job_id: str, content_id: str, source_path: str):
    """Extract image dimensions and generate thumbnail."""
    from app.extensions import db
    from app.models import ProcessingJob, Content

    _ensure_dirs()
    try:
        from PIL import Image
        with Image.open(source_path) as img:
            width, height = img.size
            fmt = img.format

        content = Content.query.get(content_id)
        if content:
            content.width = width
            content.height = height
            content.metadata_ = {**content.metadata_, "format": fmt, "width": width, "height": height}

        # Generate thumbnail
        thumb_path = THUMBS_DIR / f"{content_id}.jpg"
        result = _run_ffmpeg(
            "-i", str(source_path),
            "-vframes", "1",
            "-vf", "scale=320:-1",
            str(thumb_path), "-y",
            timeout=30,
        )
        if result.returncode == 0 and content:
            content.thumbnail_url = f"/api/v1/storage/file/thumbnails/{content_id}.jpg"

        job = ProcessingJob.query.get(job_id)
        if job:
            job.status = "completed"
            job.progress = 100.0
            job.completed_at = datetime.now(timezone.utc)

        db.session.commit()
        logger.info("image_metadata_extracted", content_id=content_id)

    except Exception as exc:
        logger.exception("image_processing_failed", job_id=job_id, error=str(exc))
        raise self.retry(exc=exc, countdown=30)
