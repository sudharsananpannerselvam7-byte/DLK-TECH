'use client';

import { useState, useEffect } from 'react';
import { cacheApi, contentApi, type ContentItem } from '@/lib/api/client';
import { getDeliveryEngine } from '@/lib/cache/SmartDeliveryEngine';

export default function CacheMonitorPage() {
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [deliveryEngine] = useState(() => getDeliveryEngine());
  const [stats, setStats] = useState({ memoryCacheItems: 0, pendingPrefetches: 0 });

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      setStats(deliveryEngine.getStats());
    }, 2000);
    return () => clearInterval(interval);
  }, [deliveryEngine]);

  const loadData = async () => {
    try {
      const res = await contentApi.list({ per_page: 20 });
      setContentList(res.data);
      setStats(deliveryEngine.getStats());
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  const handleWarmAll = async () => {
    setStatusMsg('Warming edge cache for all items...');
    try {
      for (const item of contentList.slice(0, 10)) {
        await cacheApi.warm(item.id);
      }
      setStatusMsg('Successfully warmed top 10 items in Redis cache.');
    } catch {
      setStatusMsg('Error warming cache.');
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handlePurgeAll = () => {
    deliveryEngine.clearCache();
    setStats(deliveryEngine.getStats());
    setStatusMsg('Client memory cache purged.');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleWarmSingle = async (id: string) => {
    try {
      await cacheApi.warm(id);
      setStatusMsg(`Cache warmed for item ${id}`);
    } catch {
      setStatusMsg('Failed to warm item');
    }
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handlePurgeSingle = async (id: string) => {
    try {
      await cacheApi.invalidate(id);
      deliveryEngine.invalidate(id);
      setStats(deliveryEngine.getStats());
      setStatusMsg(`Purged item ${id} from edge & client cache`);
    } catch {
      setStatusMsg('Failed to purge item');
    }
    setTimeout(() => setStatusMsg(null), 3000);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>Cache Inspection & Control</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Multi-tiered caching: L1 Browser Memory Cache, L2 Service Worker Cache, and L3 Redis Edge Cache.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleWarmAll} className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }}>
            🔥 Warm Top Items
          </button>
          <button onClick={handlePurgeAll} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '12px', color: 'var(--accent-red)' }}>
            Purge Client Cache
          </button>
        </div>
      </div>

      {statusMsg && (
        <div style={{ padding: '12px 16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--brand-500)', borderRadius: '8px', color: 'var(--brand-400)', fontSize: '13px' }}>
          {statusMsg}
        </div>
      )}

      {/* Tier Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>L1: Client In-Memory</span>
            <span className="badge badge-success">&lt; 2ms</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#fff', marginTop: '8px' }}>
            {stats.memoryCacheItems} Cached Objects
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            LRU eviction bounded at 100 entries. Prevents duplicate HTTP transfers.
          </p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>L2: Service Worker Cache</span>
            <span className="badge badge-primary">Offline Resilient</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--brand-400)', marginTop: '8px' }}>
            ACTIVE (v1)
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Stale-While-Revalidate strategy for content feeds and static media headers.
          </p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>L3: Redis Edge Cache</span>
            <span className="badge badge-warning">&lt; 15ms</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-yellow)', marginTop: '8px' }}>
            CONNECTED
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Distributed lock coalescing to protect origin from cache stampedes.
          </p>
        </div>
      </div>

      {/* Item-level Cache Management Table */}
      <div className="card" style={{ padding: '24px', overflowX: 'auto' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
          Managed Cache Entries
        </h3>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card skeleton" style={{ height: '40px' }} />
            ))}
          </div>
        ) : contentList.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No content items to manage.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 8px' }}>Content Title</th>
                <th style={{ padding: '10px 8px' }}>Type</th>
                <th style={{ padding: '10px 8px' }}>Strategy</th>
                <th style={{ padding: '10px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contentList.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 8px', color: '#fff', fontWeight: '600' }}>
                    {item.title}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span className="badge badge-secondary">{item.content_type}</span>
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--brand-400)' }}>
                    {item.content_type === 'video' ? 'CACHE-FIRST (CHUNKS)' : 'STALE-WHILE-REVALIDATE'}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleWarmSingle(item.id)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                      >
                        🔥 Warm
                      </button>
                      <button
                        onClick={() => handlePurgeSingle(item.id)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-red)' }}
                      >
                        Purge
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
