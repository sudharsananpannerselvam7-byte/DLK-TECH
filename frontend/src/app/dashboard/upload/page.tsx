'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { contentApi, type ApiResponse, type ContentItem } from '@/lib/api/client';
import { ApiError } from '@/lib/api/client';

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ContentItem | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
  const ALLOWED_TYPES = ['video/', 'image/', 'audio/', 'application/pdf', 'text/'];

  const validateFile = (f: File): string | null => {
    if (f.size > MAX_SIZE) return 'File exceeds 10GB limit.';
    if (!ALLOWED_TYPES.some(t => f.type.startsWith(t))) return `File type "${f.type}" is not supported.`;
    return null;
  };

  const handleFile = useCallback((f: File) => {
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setFile(f);
    setError('');
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''));
  }, [title]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    setProgress(0);
    setError('');

    // Simulate upload progress (real XHR would use onprogress)
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 5, 90));
    }, 200);

    try {
      const resp = await contentApi.upload(file, { title: title || file.name, description, is_public: isPublic });
      clearInterval(progressInterval);
      setProgress(100);
      setStatus('processing');
      setResult((resp as ApiResponse<ContentItem>).data);
      setTimeout(() => setStatus('done'), 1000);
    } catch (err) {
      clearInterval(progressInterval);
      setStatus('error');
      setProgress(0);
      if (err instanceof ApiError) setError(err.message);
      else setError('Upload failed. Please try again.');
    }
  };

  const reset = () => {
    setFile(null); setTitle(''); setDescription(''); setStatus('idle');
    setProgress(0); setError(''); setResult(null);
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Upload Content</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Supports video, images, audio, and documents up to 10GB. Streamed to disk — never loaded into memory.
        </p>
      </div>

      {status === 'done' && result ? (
        <div className="sf-card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Upload Successful!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            {result.title} is now being processed. Videos will be available after transcoding.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={`/dashboard/content/${result.id}`} className="sf-btn sf-btn-primary">
              View Content →
            </Link>
            <button onClick={reset} className="sf-btn sf-btn-secondary">Upload Another</button>
          </div>
        </div>
      ) : (
        <>
          {/* Drop zone */}
          <div
            style={{
              border: `2px dashed ${dragging ? 'var(--brand-400)' : file ? 'var(--green-400)' : 'var(--border-normal)'}`,
              borderRadius: 'var(--radius-xl)', padding: '40px 24px',
              background: dragging ? 'var(--bg-hover)' : file ? 'rgba(34,197,94,0.04)' : 'var(--bg-elevated)',
              cursor: 'pointer', textAlign: 'center',
              transition: 'all var(--transition-base)',
            }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              id="file-input"
              accept="video/*,image/*,audio/*,.pdf,.txt"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
            {file ? (
              <div>
                <div style={{ fontSize: 36, marginBottom: 12 }}>
                  {file.type.startsWith('video/') ? '🎬' : file.type.startsWith('image/') ? '🖼' : '📄'}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{file.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {(file.size / (1024 * 1024)).toFixed(2)} MB · {file.type}
                </div>
                <div className="sf-badge sf-badge-success" style={{ marginTop: 12, display: 'inline-flex' }}>
                  ✓ Ready to upload
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>⬆</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  {dragging ? 'Drop to upload' : 'Drag & drop or click to browse'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  Video, Image, Audio, PDF · Max 10GB · Streamed safely
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="sf-badge sf-badge-error" style={{ justifyContent: 'flex-start', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}

          {/* Metadata */}
          <div className="sf-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Content Metadata</h3>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>Title</label>
              <input
                id="upload-title"
                type="text"
                className="sf-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Content title"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>Description (optional)</label>
              <textarea
                id="upload-description"
                className="sf-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this content..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                id="upload-public"
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}
              />
              <label htmlFor="upload-public" style={{ fontSize: 14, cursor: 'pointer' }}>
                Make publicly accessible (no login required)
              </label>
            </div>
          </div>

          {/* Progress */}
          {status === 'uploading' && (
            <div className="sf-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
                <span>Uploading...</span>
                <span style={{ fontWeight: 700 }}>{progress}%</span>
              </div>
              <div className="sf-progress">
                <div className="sf-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {status === 'processing' && (
            <div className="sf-badge sf-badge-info" style={{ justifyContent: 'center', padding: '12px 20px', borderRadius: 'var(--radius-md)', fontSize: 14 }}>
              ⚙ File uploaded. Queuing for processing...
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={handleUpload}
            className="sf-btn sf-btn-primary sf-btn-lg"
            disabled={!file || status === 'uploading' || status === 'processing'}
            style={{ width: '100%' }}
          >
            {status === 'uploading' ? `Uploading ${progress}%...` : status === 'processing' ? 'Processing...' : 'Upload →'}
          </button>
        </>
      )}
    </div>
  );
}
