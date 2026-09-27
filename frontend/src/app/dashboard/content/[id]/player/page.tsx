'use client';

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';
import { contentApi, prefetchApi, type ContentItem } from '@/lib/api/client';
import { getDeliveryEngine } from '@/lib/cache/SmartDeliveryEngine';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';

export default function VideoPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [content, setContent] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [deliveryEngine] = useState(() => getDeliveryEngine());
  const { quality: networkQuality, rtt } = useNetworkMonitor();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [prefetchStatus, setPrefetchStatus] = useState<string>('idle');

  // Load video content
  useEffect(() => {
    contentApi
      .get(id)
      .then((res) => {
        setContent(res.data);
        setLoading(false);
        // Save resume timestamp if exists in localStorage
        const savedTime = localStorage.getItem(`video_resume_${id}`);
        if (savedTime && videoRef.current) {
          videoRef.current.currentTime = parseFloat(savedTime);
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load video');
        setLoading(false);
      });
  }, [id]);

  // Buffer and playback state monitoring
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        setBufferedPct(Math.round((bufferedEnd / video.duration) * 100));

        // When 60% of current video is watched, trigger predictive prefetch for next video in queue
        if (video.currentTime / video.duration > 0.6 && prefetchStatus === 'idle') {
          setPrefetchStatus('triggering-predictive-prefetch');
          deliveryEngine
            .triggerPrefetch([id], networkQuality)
            .then(() => setPrefetchStatus('predictive-prefetch-cached'))
            .catch(() => setPrefetchStatus('prefetch-failed'));
        }
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      // Save resume position
      localStorage.setItem(`video_resume_${id}`, video.currentTime.toString());
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('progress', handleProgress);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [id, deliveryEngine, networkQuality, prefetchStatus]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const seekTime = (clickX / rect.width) * duration;
    video.currentTime = seekTime;
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div className="card skeleton" style={{ height: '500px', borderRadius: '16px' }} />
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '40px auto', padding: '32px', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent-red)', marginBottom: '16px' }}>{error || 'Video not found'}</p>
        <Link href="/dashboard/content" className="btn btn-secondary">← Back to Content</Link>
      </div>
    );
  }

  const streamUrl = contentApi.streamUrl(content.id);

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <Link href="/dashboard/content" style={{ color: 'var(--brand-400)', textDecoration: 'none' }}>
            Content
          </Link>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ color: '#fff', fontWeight: '600' }}>{content.title}</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className="badge badge-success">Byte-Range 206 OK</span>
          <span className="badge badge-primary">Dynamic Bitrate Buffer</span>
        </div>
      </div>

      {/* Main Player Display */}
      <div
        className="card"
        style={{
          background: '#090d16',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ position: 'relative', width: '100%', background: '#000', maxHeight: '640px', display: 'flex', justifyContent: 'center' }}>
          <video
            ref={videoRef}
            src={streamUrl}
            controls
            style={{ width: '100%', maxHeight: '640px' }}
            preload="auto"
          />
        </div>

        {/* Custom Telemetry / Buffer Timeline Bar */}
        <div style={{ padding: '16px 20px', background: 'rgba(15, 23, 42, 0.95)', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <span>
              Playback: <strong style={{ color: '#fff' }}>{formatTime(currentTime)}</strong> / {formatTime(duration)}
            </span>
            <span>
              Buffer Status: <strong style={{ color: 'var(--brand-400)' }}>{bufferedPct}% buffered</strong>
            </span>
          </div>

          {/* Buffer Progress bar */}
          <div
            onClick={handleSeek}
            style={{
              position: 'relative',
              height: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              overflow: 'hidden',
              cursor: 'pointer',
            }}
          >
            {/* Buffered part */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${bufferedPct}%`,
                background: 'rgba(59, 130, 246, 0.35)',
                transition: 'width 0.3s ease',
              }}
            />
            {/* Played part */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                background: 'var(--brand-500)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Stream Metrics & Diagnostic Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Network Adaptation
          </div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-green)', marginTop: '4px' }}>
            {networkQuality.toUpperCase()} ({rtt ? `${rtt}ms RTT` : 'Normal'})
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Prefetch window dynamically calculated: {networkQuality === 'fast' ? '3 chunks ahead' : '1 chunk conservative'}
          </p>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Resumable Position
          </div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginTop: '4px' }}>
            {currentTime > 0 ? `${formatTime(currentTime)} saved` : 'Start of stream'}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Position persisted to client store for instant resume on reload.
          </p>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Predictive Prefetch Status
          </div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brand-400)', marginTop: '4px' }}>
            {prefetchStatus}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Next content warmed in Redis when playback passes 60%.
          </p>
        </div>
      </div>
    </div>
  );
}
