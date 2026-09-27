'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';
import { getDeliveryEngine } from '@/lib/cache/SmartDeliveryEngine';
import { type ContentItem } from '@/lib/api/client';

export default function OfflinePage() {
  const { isOnline, isSyncing } = useNetworkMonitor();
  const [cachedItems, setCachedItems] = useState<ContentItem[]>([]);
  const [deliveryEngine] = useState(() => getDeliveryEngine());

  useEffect(() => {
    // Read from client-side memory cache or localStorage
    try {
      const savedItems = localStorage.getItem('smartflow_cached_feed');
      if (savedItems) {
        setCachedItems(JSON.parse(savedItems));
      }
    } catch {
      // Ignored
    }
  }, []);

  return (
    <div style={{ maxWidth: '900px', margin: '40px auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Offline Status Banner */}
      <div
        className="card"
        style={{
          padding: '32px',
          textAlign: 'center',
          borderLeft: `4px solid ${isOnline ? 'var(--accent-green)' : 'var(--accent-yellow)'}`,
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
          {isOnline ? '🌐' : '📡'}
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff', marginBottom: '8px' }}>
          {isOnline ? 'Network Connection Restored' : 'Offline Mode — Local Resilience Active'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '600px', margin: '0 auto 20px' }}>
          {isOnline
            ? 'Your connection is back online. Revalidating stale cache and synchronizing prefetch queue.'
            : 'You are currently disconnected. SmartFlow is serving previously cached content from your local browser storage. Uncached media will be fetched automatically when connectivity returns.'}
        </p>

        {isOnline ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <Link href="/dashboard/feed" className="btn btn-primary">
              Return to Live Feed
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <span className="badge badge-warning">
              {isSyncing ? 'Reconnecting...' : 'Operating from Local Cache'}
            </span>
          </div>
        )}
      </div>

      {/* Available Offline Content */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>
            Available Offline Content ({cachedItems.length})
          </h2>
          <span className="badge badge-success">Saved Locally</span>
        </div>

        {cachedItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No media was cached prior to disconnection. Content viewed during active sessions is stored here automatically.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            {cachedItems.map((item) => (
              <div
                key={item.id}
                className="card"
                style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="badge badge-secondary">{item.content_type}</span>
                  <span style={{ fontSize: '11px', color: 'var(--accent-green)' }}>✓ Offline Ready</span>
                </div>
                <div style={{ fontWeight: '700', color: '#fff', fontSize: '14px' }}>{item.title}</div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  {item.description || item.original_filename}
                </p>
                <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                  <Link
                    href={`/dashboard/content/${item.id}`}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11px', width: '100%', textAlign: 'center' }}
                  >
                    View Cached Item →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
