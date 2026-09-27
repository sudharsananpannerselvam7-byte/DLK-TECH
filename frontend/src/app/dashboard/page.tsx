'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { analyticsApi, jobsApi, type OverviewStats } from '@/lib/api/client';
import { useAuthStore } from '@/features/auth/store';

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  useEffect(() => {
    analyticsApi.overview()
      .then(r => setOverview(r.data as OverviewStats))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const la = overview?.latency;
  const ca = overview?.cache;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Welcome */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(59,101,248,0.15), rgba(34,211,238,0.08))',
        border: '1px solid rgba(59,101,248,0.2)',
        borderRadius: 'var(--radius-xl)', padding: '32px 36px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20,
      }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
            Welcome back, <span className="sf-gradient-text">{user?.full_name || user?.username}</span> 👋
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            SmartFlow is actively caching and prefetching content for your users.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/dashboard/feed" className="sf-btn sf-btn-secondary sf-btn-sm">View Feed</Link>
          <Link href="/dashboard/upload" className="sf-btn sf-btn-primary sf-btn-sm">Upload Content</Link>
        </div>
      </div>

      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {loading ? Array(6).fill(0).map((_, i) => (
          <MetricSkeleton key={i} />
        )) : [
          { label: 'Avg Latency', value: `${la?.avg_latency_ms?.toFixed(1) || 0}ms`, sub: `P95: ${la?.p95_latency_ms?.toFixed(1) || 0}ms`, icon: '⚡', color: 'var(--brand-400)' },
          { label: 'Cache Hit Rate', value: `${ca?.hit_rate_percent?.toFixed(1) || 0}%`, sub: `${ca?.hits || 0} hits`, icon: '🎯', color: 'var(--green-400)' },
          { label: 'Total Requests', value: `${la?.total_requests || 0}`, sub: `Last 24h`, icon: '📊', color: 'var(--cyan-400)' },
          { label: 'Error Rate', value: `${la?.error_rate?.toFixed(2) || 0}%`, sub: `${la?.error_count || 0} errors`, icon: '⚠', color: 'var(--red-400)' },
          { label: 'Active Jobs', value: `${overview?.jobs?.active || 0}`, sub: 'Processing', icon: '⚙', color: 'var(--yellow-400)' },
          { label: 'Content Items', value: `${overview?.content?.total || 0}`, sub: 'Total', icon: '📁', color: 'var(--purple-400)' },
        ].map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      {/* Latency Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Latency percentiles */}
        <div className="sf-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚡ Latency Percentiles
          </h3>
          {loading ? <div className="sf-skeleton" style={{ height: 120 }} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'P50 (Median)', value: la?.p50_latency_ms, max: la?.p99_latency_ms, color: 'var(--green-400)' },
                { label: 'P95', value: la?.p95_latency_ms, max: la?.p99_latency_ms, color: 'var(--yellow-400)' },
                { label: 'P99', value: la?.p99_latency_ms, max: la?.p99_latency_ms, color: 'var(--red-400)' },
              ].map(({ label, value, max, color }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontWeight: 600 }}>{value?.toFixed(1) || 0}ms</span>
                  </div>
                  <div className="sf-progress">
                    <div className="sf-progress-fill" style={{
                      width: `${max && max > 0 ? Math.min(100, ((value || 0) / max) * 100) : 0}%`,
                      background: color,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cache breakdown */}
        <div className="sf-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            🎯 Cache Breakdown
          </h3>
          {loading ? <div className="sf-skeleton" style={{ height: 120 }} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Cache Hits', value: la?.cache_hits || 0, color: 'var(--green-400)' },
                { label: 'Cache Misses', value: la?.cache_misses || 0, color: 'var(--red-400)' },
                { label: 'Prefetch Hits', value: la?.prefetch_hits || 0, color: 'var(--brand-400)' },
                { label: 'Offline Cache Hits', value: la?.offline_hits || 0, color: 'var(--purple-400)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="sf-dot" style={{ background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
                  </div>
                  <span style={{ fontWeight: 700, color }}>{value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="sf-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { href: '/dashboard/feed', label: 'Browse Feed', icon: '⊞', color: 'var(--brand-400)' },
            { href: '/dashboard/upload', label: 'Upload File', icon: '↑', color: 'var(--green-400)' },
            { href: '/dashboard/analytics', label: 'Analytics', icon: '📊', color: 'var(--cyan-400)' },
            { href: '/dashboard/cache', label: 'Cache Monitor', icon: '⚡', color: 'var(--yellow-400)' },
            { href: '/dashboard/sources', label: 'Add Source', icon: '🔌', color: 'var(--purple-400)' },
            { href: '/dashboard/jobs', label: 'View Jobs', icon: '⚙', color: 'var(--orange-400)' },
          ].map(({ href, label, icon, color }) => (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                padding: '20px 16px', borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = color;
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
              }}
            >
              <span style={{ fontSize: 24, filter: 'saturate(1.5)' }}>{icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, icon, color }: {
  label: string; value: string; sub: string; icon: string; color: string;
}) {
  return (
    <div className="sf-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="sf-card" style={{ padding: 20 }}>
      <div className="sf-skeleton" style={{ height: 16, width: '60%', marginBottom: 12 }} />
      <div className="sf-skeleton" style={{ height: 32, width: '80%', marginBottom: 8 }} />
      <div className="sf-skeleton" style={{ height: 12, width: '40%' }} />
    </div>
  );
}
