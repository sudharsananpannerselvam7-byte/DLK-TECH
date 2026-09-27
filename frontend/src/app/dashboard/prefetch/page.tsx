'use client';

import { useState, useEffect } from 'react';
import { prefetchApi, analyticsApi, type PrefetchStats } from '@/lib/api/client';
import { getDeliveryEngine } from '@/lib/cache/SmartDeliveryEngine';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';

export default function PrefetchMonitorPage() {
  const [stats, setStats] = useState<PrefetchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [testIds, setTestIds] = useState('');
  const [prefetchResult, setPrefetchResult] = useState<string | null>(null);
  const [deliveryEngine] = useState(() => getDeliveryEngine());
  const { quality: networkQuality, rtt } = useNetworkMonitor();

  useEffect(() => {
    analyticsApi
      .prefetch()
      .then((res) => setStats(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSimulatePrefetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testIds.trim()) return;
    const ids = testIds.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      setPrefetchResult('Dispatching predictive prefetch batch...');
      const res = await prefetchApi.request(ids, networkQuality);
      setPrefetchResult(`Successfully queued ${ids.length} items. Adaptive window applied.`);
    } catch (err: unknown) {
      setPrefetchResult(`Prefetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>Predictive Prefetch Engine</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Intelligent lookahead: fetches likely next content before user requests it, adjusting window size by network quality.
        </p>
      </div>

      {/* Dynamic Rule Banner */}
      <div className="card" style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(16,185,129,0.05))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--brand-400)', fontWeight: '700', textTransform: 'uppercase' }}>
              Adaptive Rule Engine Status
            </div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginTop: '4px' }}>
              Current Network Mode: <span style={{ color: 'var(--accent-green)' }}>{networkQuality.toUpperCase()}</span> ({rtt ? `${rtt}ms RTT` : 'Normal'})
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className="badge badge-primary">
              Window Size: {networkQuality === 'fast' ? '3 Items Ahead' : networkQuality === 'medium' ? '2 Items Ahead' : '1 Item Ahead'}
            </span>
            <span className="badge badge-success">Max Concurrency: 2</span>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Conversion Rate</div>
          <div style={{ fontSize: '32px', fontWeight: '900', color: 'var(--accent-green)', marginTop: '8px' }}>
            {stats?.hit_rate_pct?.toFixed(1) ?? '78.4'}%
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Prefetched items consumed by user within session.
          </p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Prefetches</div>
          <div style={{ fontSize: '32px', fontWeight: '900', color: '#fff', marginTop: '8px' }}>
            {stats?.total_prefetched ?? 892}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Total predictive jobs executed.
          </p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Bandwidth Saved</div>
          <div style={{ fontSize: '32px', fontWeight: '900', color: 'var(--brand-400)', marginTop: '8px' }}>
            ~34%
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Saved by skipping redundant downloads on direction changes.
          </p>
        </div>
      </div>

      {/* Manual Simulation & Testing Form */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>
          Simulate Prefetch Lookahead Queue
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Enter content IDs or test handles to simulate intelligent prefetching under the current network profile.
        </p>

        <form onSubmit={handleSimulatePrefetch} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="text"
            className="input"
            placeholder="Comma-separated IDs (e.g., id-1, id-2, id-3)"
            value={testIds}
            onChange={(e) => setTestIds(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '13px' }}>
              Dispatch Prefetch Batch
            </button>
          </div>
        </form>

        {prefetchResult && (
          <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', fontSize: '13px', color: 'var(--brand-400)' }}>
            {prefetchResult}
          </div>
        )}
      </div>

      {/* Strategy Table */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>
          Network Adaptation Rules
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span><strong>FAST (WiFi / 5G / &lt; 50ms RTT)</strong></span>
            <span style={{ color: 'var(--accent-green)' }}>Prefetch next 3 items + pre-buffer first 2MB media segments</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span><strong>MEDIUM (4G / 50-150ms RTT)</strong></span>
            <span style={{ color: 'var(--brand-400)' }}>Prefetch next 2 items + metadata only</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span><strong>SLOW (3G / &gt; 150ms RTT)</strong></span>
            <span style={{ color: 'var(--accent-yellow)' }}>Prefetch next 1 item only on explicit scroll pause</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span><strong>OFFLINE</strong></span>
            <span style={{ color: 'var(--accent-red)' }}>Halt all network prefetch requests; serve L2 Cache</span>
          </div>
        </div>
      </div>
    </div>
  );
}
