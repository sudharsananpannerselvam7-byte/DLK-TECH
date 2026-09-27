'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { feedApi, type ContentItem } from '@/lib/api/client';
import { getDeliveryEngine } from '@/lib/cache/SmartDeliveryEngine';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';

const ICONS: Record<string, string> = {
  video: '🎬', image: '🖼', document: '📄', audio: '🎵', other: '📦',
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function FeedPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [cacheHits, setCacheHits] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const network = useNetworkMonitor();
  const engine = getDeliveryEngine();

  const loadFeed = useCallback(async (cursor?: string, filter?: string) => {
    const isFirst = !cursor;
    if (isFirst) setLoading(true);
    else setLoadingMore(true);

    try {
      const resp = await feedApi.get({ cursor, limit: 20, type: filter || undefined });
      const newItems = resp.data as ContentItem[];
      const meta = resp.meta as { has_next: boolean; next_cursor: string | null };

      if (isFirst) {
        setItems(newItems);
      } else {
        setItems(prev => [...prev, ...newItems]);
      }
      setNextCursor(meta.next_cursor);
      setHasNext(meta.has_next);

      // Prefetch next batch intelligently
      const nextIds = newItems.slice(0, 5).map(i => i.id);
      if (nextIds.length > 0 && network.isOnline) {
        engine.setNetworkQuality(network.quality as 'fast' | 'medium' | 'slow' | 'offline');
        engine.schedulePrefetch(nextIds);
      }
    } finally {
      if (isFirst) setLoading(false);
      else setLoadingMore(false);
    }
  }, [network.isOnline, network.quality, engine]);

  useEffect(() => {
    loadFeed(undefined, typeFilter);
  }, [typeFilter]);

  // Infinite scroll via Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNext && !loadingMore && !loading && nextCursor) {
          loadFeed(nextCursor, typeFilter);
        }
      },
      { threshold: 0.5 }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNext, loadingMore, loading, nextCursor, typeFilter, loadFeed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Content Feed</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Intelligent prefetching active — content loads before you click.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['', 'video', 'image', 'document', 'audio'].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`sf-btn sf-btn-sm ${typeFilter === type ? 'sf-btn-primary' : 'sf-btn-secondary'}`}
            >
              {type ? `${ICONS[type]} ${type}` : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Smart delivery status */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap',
        padding: '12px 16px',
        background: 'rgba(59,101,248,0.06)',
        border: '1px solid rgba(59,101,248,0.15)',
        borderRadius: 'var(--radius-md)', fontSize: 13,
      }}>
        <span style={{ color: 'var(--text-muted)' }}>SmartFlow Engine:</span>
        {[
          { label: 'Prefetch Queue', value: `${engine.getMetrics().prefetchQueue.queued} queued` },
          { label: 'Network', value: network.quality },
          { label: 'RTT', value: network.rttMs ? `${network.rttMs}ms` : '—' },
          { label: 'Status', value: network.status },
        ].map(({ label, value }) => (
          <span key={label} style={{ color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>{label}: </span>
            <strong>{value}</strong>
          </span>
        ))}
      </div>

      {/* Content grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {Array(8).fill(0).map((_, i) => <ContentCardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="sf-empty">
          <div className="sf-empty-icon">📭</div>
          <div className="sf-empty-title">No content yet</div>
          <div className="sf-empty-desc">Upload some files or add a source to get started.</div>
          <Link href="/dashboard/upload" className="sf-btn sf-btn-primary" style={{ marginTop: 12 }}>
            Upload Content →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {items.map((item) => (
            <ContentCard key={item.id} item={item} isPrefetched={engine.isPrefetched(item.id)} />
          ))}
        </div>
      )}

      {/* Load more trigger */}
      <div ref={loadMoreRef} style={{ textAlign: 'center', padding: 24 }}>
        {loadingMore && <div className="sf-skeleton" style={{ height: 40, width: 160, margin: '0 auto' }} />}
        {!hasNext && items.length > 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>All content loaded.</p>
        )}
      </div>
    </div>
  );
}

function ContentCard({ item, isPrefetched }: { item: ContentItem; isPrefetched: boolean }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={`/dashboard/content/${item.id}`}
      style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="sf-card"
        style={{
          overflow: 'hidden', cursor: 'pointer',
          border: `1px solid ${hovered ? 'var(--border-brand)' : 'var(--border-subtle)'}`,
          transform: hovered ? 'translateY(-2px)' : 'none',
          boxShadow: hovered ? 'var(--shadow-brand)' : 'none',
          transition: 'all var(--transition-base)',
        }}
      >
        {/* Thumbnail */}
        <div style={{
          height: 160, background: 'var(--bg-elevated)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt={item.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              loading="lazy"
            />
          ) : (
            <span style={{ fontSize: 48, opacity: 0.4 }}>{ICONS[item.content_type] || '📦'}</span>
          )}
          {/* Type badge */}
          <div style={{ position: 'absolute', top: 8, left: 8 }}>
            <span className={`sf-badge sf-badge-${item.content_type === 'video' ? 'error' : item.content_type === 'image' ? 'info' : 'neutral'}`}>
              {ICONS[item.content_type]} {item.content_type}
            </span>
          </div>
          {/* Prefetch indicator */}
          {isPrefetched && (
            <div style={{ position: 'absolute', top: 8, right: 8 }}>
              <span className="sf-badge sf-badge-success" title="Prefetched — ready instantly">
                ⚡ cached
              </span>
            </div>
          )}
          {/* Duration for video */}
          {item.duration_seconds && (
            <div style={{
              position: 'absolute', bottom: 8, right: 8,
              background: 'rgba(0,0,0,0.7)', borderRadius: 4,
              padding: '2px 6px', fontSize: 11, fontWeight: 600,
            }}>
              {Math.floor(item.duration_seconds / 60)}:{String(Math.floor(item.duration_seconds % 60)).padStart(2, '0')}
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: 16 }}>
          <h3 style={{
            fontSize: 15, fontWeight: 600, marginBottom: 6,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.title}
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{formatBytes(item.size_bytes)}</span>
            <span>👁 {item.view_count.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ContentCardSkeleton() {
  return (
    <div className="sf-card" style={{ overflow: 'hidden' }}>
      <div className="sf-skeleton" style={{ height: 160 }} />
      <div style={{ padding: 16 }}>
        <div className="sf-skeleton" style={{ height: 16, marginBottom: 8 }} />
        <div className="sf-skeleton" style={{ height: 12, width: '60%' }} />
      </div>
    </div>
  );
}
