'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { searchApi, type ContentItem, type PaginationMeta } from '@/lib/api/client';
import { getDeliveryEngine } from '@/lib/cache/SmartDeliveryEngine';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [results, setResults] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [deliveryEngine] = useState(() => getDeliveryEngine());

  // Debounce query typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  // Execute search
  const performSearch = useCallback(async () => {
    if (!debouncedQuery) {
      setResults([]);
      setLatencyMs(null);
      return;
    }
    setLoading(true);
    const start = performance.now();
    try {
      const res = await searchApi.search(debouncedQuery, {
        type: typeFilter || undefined,
        page,
        per_page: 12,
      });
      const end = performance.now();
      setLatencyMs(Math.round(end - start));
      setResults(res.data);
      if (res.meta) setMeta(res.meta as unknown as PaginationMeta);

      // Prefetch top 3 search results for instant access
      if (res.data && res.data.length > 0) {
        const topIds = res.data.slice(0, 3).map((item) => item.id);
        deliveryEngine.triggerPrefetch(topIds);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, typeFilter, page, deliveryEngine]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>Intelligent Content Search</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Real-time indexed search across titles, descriptions, MIME types, and source metadata.
        </p>
      </div>

      {/* Search Input Bar */}
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="input"
            placeholder="Search keywords, file names, tags (e.g., 'sample', 'h264', 'video')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ fontSize: '15px', padding: '12px 16px', paddingLeft: '42px' }}
            autoFocus
          />
          <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
            🔍
          </span>
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters and telemetry */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['', 'video', 'image', 'audio', 'document'].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTypeFilter(t);
                  setPage(1);
                }}
                className={`btn ${typeFilter === t ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 12px', fontSize: '12px', textTransform: 'capitalize' }}
              >
                {t || 'All Types'}
              </button>
            ))}
          </div>

          {latencyMs !== null && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Query latency:{' '}
              <strong style={{ color: latencyMs < 30 ? 'var(--accent-green)' : 'var(--brand-400)' }}>
                {latencyMs}ms
              </strong>{' '}
              | Top items prefetched to client cache
            </div>
          )}
        </div>
      </div>

      {/* Results Section */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card skeleton" style={{ height: '180px' }} />
          ))}
        </div>
      ) : debouncedQuery && results.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            No content matches &quot;<strong>{debouncedQuery}</strong>&quot;.
          </p>
        </div>
      ) : results.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {results.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/content/${item.id}`}
                className="card"
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  textDecoration: 'none',
                  transition: 'transform 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge ${item.content_type === 'video' ? 'badge-primary' : 'badge-secondary'}`}>
                    {item.content_type}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatBytes(item.file_size)}</span>
                </div>
                <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#fff', margin: 0 }}>{item.title}</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.description || item.original_filename}
                </p>
                <div style={{ marginTop: 'auto', paddingTop: '8px', fontSize: '11px', color: 'var(--brand-400)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Inspect metadata →</span>
                  {item.is_optimized && <span style={{ color: 'var(--accent-green)' }}>⚡ Fast Stream</span>}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {meta && meta.total_pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
              <button
                className="btn btn-secondary"
                disabled={!meta.has_prev}
                onClick={() => setPage((p) => p - 1)}
                style={{ padding: '6px 16px', fontSize: '13px' }}
              >
                Previous
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                Page {meta.page} of {meta.total_pages}
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
      ) : (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚡</div>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Instant Prefetch Search</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '420px', margin: '0 auto' }}>
            Type any search query. Top results will be automatically warmed in memory cache so viewing is instantaneous.
          </p>
        </div>
      )}
    </div>
  );
}
