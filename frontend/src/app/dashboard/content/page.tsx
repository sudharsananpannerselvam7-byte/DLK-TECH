'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { contentApi, cacheApi, type ContentItem, type PaginationMeta } from '@/lib/api/client';
import { getDeliveryEngine } from '@/lib/cache/SmartDeliveryEngine';

export default function ContentListPage() {
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [warmedIds, setWarmedIds] = useState<Set<string>>(new Set());
  const [deliveryEngine] = useState(() => getDeliveryEngine());

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await contentApi.list({
        page,
        per_page: 12,
        type: typeFilter || undefined,
        q: searchQuery || undefined,
      });
      setContentList(res.data);
      if (res.meta) setMeta(res.meta as unknown as PaginationMeta);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load content';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, searchQuery]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleWarmCache = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await cacheApi.warm(id);
      setWarmedIds((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setWarmedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 3000);
    } catch {
      // Ignored
    }
  };

  const handleInvalidate = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await cacheApi.invalidate(id);
      deliveryEngine.invalidate(id);
      loadContent();
    } catch {
      // Ignored
    }
  };

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'video':
        return 'badge-primary';
      case 'image':
        return 'badge-success';
      case 'audio':
        return 'badge-warning';
      default:
        return 'badge-secondary';
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.02em', color: '#fff' }}>Content Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Browse, inspect metadata, warm cache, and manage media delivery profiles.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/dashboard/upload" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
            + Upload New Content
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            className="input"
            placeholder="Search by title, filename, or tags..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['', 'video', 'image', 'audio', 'document'].map((t) => (
            <button
              key={t}
              onClick={() => {
                setTypeFilter(t);
                setPage(1);
              }}
              className={`btn ${typeFilter === t ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 14px', fontSize: '12px', textTransform: 'capitalize' }}
            >
              {t || 'All Types'}
            </button>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card skeleton" style={{ height: '240px', borderRadius: '12px' }} />
          ))}
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '32px', textAlign: 'center', borderColor: 'var(--accent-red)' }}>
          <p style={{ color: 'var(--accent-red)', marginBottom: '12px' }}>{error}</p>
          <button onClick={loadContent} className="btn btn-secondary">Retry Loading</button>
        </div>
      ) : contentList.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📂</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>No content found</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
            Upload files or sync an authorized storage adapter to get started.
          </p>
          <Link href="/dashboard/upload" className="btn btn-primary">Upload File</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {contentList.map((item) => (
            <div key={item.id} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className={`badge ${getTypeBadge(item.content_type)}`}>
                  {item.content_type}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {formatBytes(item.file_size)}
                </span>
              </div>

              <div>
                <Link
                  href={`/dashboard/content/${item.id}`}
                  style={{ fontSize: '16px', fontWeight: '700', color: '#fff', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {item.title}
                </Link>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.original_filename || 'Unknown file'}
                </p>
              </div>

              {/* Status and Optimization */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px' }}>
                <span style={{ padding: '2px 8px', borderRadius: '4px', background: item.is_optimized ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)', color: item.is_optimized ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                  {item.is_optimized ? '⚡ Optimized' : 'Raw Format'}
                </span>
                {item.duration_seconds ? (
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }}>
                    ⏱️ {Math.round(item.duration_seconds)}s
                  </span>
                ) : null}
              </div>

              {/* Action buttons */}
              <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={(e) => handleWarmCache(item.id, e)}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11px' }}
                    title="Warm Redis & Edge Cache"
                  >
                    {warmedIds.has(item.id) ? '🔥 Warmed!' : '🔥 Warm Cache'}
                  </button>
                  <button
                    onClick={(e) => handleInvalidate(item.id, e)}
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-red)' }}
                    title="Purge cache"
                  >
                    Purge
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  {item.content_type === 'video' ? (
                    <Link
                      href={`/dashboard/content/${item.id}/player`}
                      className="btn btn-primary"
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      ▶ Stream
                    </Link>
                  ) : (
                    <Link
                      href={`/dashboard/content/${item.id}`}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      Inspect
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
          <button
            className="btn btn-secondary"
            disabled={!meta.has_prev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ padding: '6px 16px', fontSize: '13px' }}
          >
            Previous
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Page {meta.page} of {meta.total_pages} ({meta.total} total items)
          </span>
          <button
            className="btn btn-secondary"
            disabled={!meta.has_next}
            onClick={() => setPage((p) => p + 1)}
            style={{ padding: '6px 16px', fontSize: '13px' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
