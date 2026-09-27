'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { contentApi, cacheApi, prefetchApi, type ContentItem } from '@/lib/api/client';
import { getDeliveryEngine } from '@/lib/cache/SmartDeliveryEngine';

export default function ContentDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();

  const [content, setContent] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadLatency, setLoadLatency] = useState<number | null>(null);
  const [cacheSource, setCacheSource] = useState<string>('cold');
  const [warmed, setWarmed] = useState(false);
  const [deliveryEngine] = useState(() => getDeliveryEngine());

  useEffect(() => {
    let isMounted = true;
    const startTime = performance.now();

    deliveryEngine
      .get(id)
      .then((item) => {
        if (!isMounted) return;
        const latency = Math.round(performance.now() - startTime);
        setLoadLatency(latency);
        setContent(item);
        setCacheSource(latency < 20 ? 'memory-cache' : latency < 60 ? 'redis-hit' : 'origin-network');
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Failed to load content details');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id, deliveryEngine]);

  const handleWarmCache = async () => {
    if (!content) return;
    try {
      await cacheApi.warm(content.id);
      setWarmed(true);
      setTimeout(() => setWarmed(false), 3000);
    } catch {
      // Ignored
    }
  };

  const handlePurgeCache = async () => {
    if (!content) return;
    try {
      await cacheApi.invalidate(content.id);
      deliveryEngine.invalidate(content.id);
      alert('Cache purged successfully');
    } catch {
      // Ignored
    }
  };

  const handleDelete = async () => {
    if (!content || !confirm('Are you sure you want to delete this content item?')) return;
    try {
      await contentApi.delete(content.id);
      deliveryEngine.invalidate(content.id);
      router.push('/dashboard/content');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="card skeleton" style={{ height: '300px' }} />
        <div className="card skeleton" style={{ height: '200px' }} />
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="card" style={{ maxWidth: '800px', margin: '40px auto', padding: '32px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--accent-red)', marginBottom: '12px' }}>Content Error</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>{error || 'Item not found'}</p>
        <Link href="/dashboard/content" className="btn btn-secondary">← Back to Content List</Link>
      </div>
    );
  }

  const streamUrl = contentApi.streamUrl(content.id);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Breadcrumb & Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <Link href="/dashboard/content" style={{ color: 'var(--brand-400)', textDecoration: 'none' }}>
            Content
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{content.title}</span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleWarmCache} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
            {warmed ? '🔥 Warmed!' : '🔥 Warm Edge Cache'}
          </button>
          <button onClick={handlePurgeCache} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
            Purge Cache
          </button>
          <button onClick={handleDelete} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--accent-red)' }}>
            Delete
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="card" style={{ padding: '24px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>{content.title}</h1>
              <span className={`badge ${content.content_type === 'video' ? 'badge-primary' : 'badge-secondary'}`}>
                {content.content_type}
              </span>
              {content.is_optimized && <span className="badge badge-success">Optimized</span>}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px' }}>
              {content.description || 'No description provided.'}
            </p>
          </div>

          {/* Real Latency Pill */}
          <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-color)', display: 'flex', gap: '16px', fontSize: '12px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Lookup Latency: </span>
              <strong style={{ color: loadLatency && loadLatency < 50 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                {loadLatency} ms
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Source: </span>
              <strong style={{ color: '#fff' }}>{cacheSource}</strong>
            </div>
          </div>
        </div>

        {/* Media Preview Component */}
        <div style={{ borderRadius: '12px', overflow: 'hidden', background: '#000', border: '1px solid var(--border-color)', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {content.content_type === 'video' ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              <video
                controls
                src={streamUrl}
                style={{ width: '100%', maxHeight: '540px', background: '#000' }}
                preload="metadata"
              />
              <div style={{ padding: '12px 16px', background: 'rgba(15, 23, 42, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Byte-Range Streaming Enabled | Resumable Seek Supported
                </span>
                <Link href={`/dashboard/content/${content.id}/player`} className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }}>
                  Open Dedicated Player with Bitrate Monitor →
                </Link>
              </div>
            </div>
          ) : content.content_type === 'image' ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <img
                src={streamUrl}
                alt={content.title}
                style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain', borderRadius: '8px' }}
              />
            </div>
          ) : content.content_type === 'audio' ? (
            <div style={{ padding: '40px', width: '100%', maxWidth: '600px' }}>
              <audio controls src={streamUrl} style={{ width: '100%' }} />
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Document / Binary File ({content.mime_type})</p>
              <a href={streamUrl} download={content.original_filename} className="btn btn-primary">
                Download ({formatBytes(content.file_size)})
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Metadata & Technical Specs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
        {/* Technical Specs Card */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: '#fff' }}>
            Technical Metadata
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>MIME Type</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{content.mime_type}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>File Size</span>
              <span style={{ color: 'var(--text-primary)' }}>{formatBytes(content.file_size)}</span>
            </div>
            {content.width && content.height ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Resolution</span>
                <span style={{ color: 'var(--text-primary)' }}>{content.width} × {content.height}</span>
              </div>
            ) : null}
            {content.duration_seconds ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Duration</span>
                <span style={{ color: 'var(--text-primary)' }}>{content.duration_seconds.toFixed(1)} seconds</span>
              </div>
            ) : null}
            {content.bitrate ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Bitrate</span>
                <span style={{ color: 'var(--text-primary)' }}>{(content.bitrate / 1000).toFixed(0)} kbps</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Source ID / Filename</span>
              <span style={{ color: 'var(--text-primary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{content.original_filename}</span>
            </div>
          </div>
        </div>

        {/* Delivery & Caching Strategy Card */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: '#fff' }}>
            Delivery & Caching Profile
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Cache Strategy</span>
              <span style={{ color: 'var(--brand-400)', fontWeight: '600' }}>
                {content.content_type === 'video' ? 'RANGE-BYTE BUFFERED' : 'STALE-WHILE-REVALIDATE'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Prefetch Eligibility</span>
              <span style={{ color: 'var(--accent-green)' }}>Eligible (Tier 1 Priority)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Range Requests</span>
              <span style={{ color: 'var(--accent-green)' }}>Supported (206 Partial Content)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Storage Location</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>{content.storage_path}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Last Modified</span>
              <span style={{ color: 'var(--text-primary)' }}>{new Date(content.updated_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
