'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store';

export default function LandingPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (!mounted) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Animated background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,101,248,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse 60% 40% at 80% 80%, rgba(34,211,238,0.08) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <header style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 40px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(10,14,26,0.7)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, var(--brand-500), var(--cyan-400))',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: 'white',
          }}>S</div>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>SmartFlow</span>
        </div>
        <nav style={{ display: 'flex', gap: 8 }}>
          <Link href="/login" className="sf-btn sf-btn-ghost sf-btn-sm">Sign In</Link>
          <Link href="/register" className="sf-btn sf-btn-primary sf-btn-sm">Get Started</Link>
        </nav>
      </header>

      {/* Hero */}
      <section style={{
        position: 'relative', zIndex: 1,
        textAlign: 'center', padding: '100px 40px 80px',
        maxWidth: 900, margin: '0 auto',
      }}>
        <div className="sf-badge sf-badge-info" style={{ marginBottom: 24, display: 'inline-flex' }}>
          ⚡ Intelligent Low-Latency Content Delivery
        </div>
        <h1 style={{ fontSize: 'clamp(42px, 7vw, 72px)', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: 24 }}>
          Deliver Content at the{' '}
          <span className="sf-gradient-text">Speed of Thought</span>
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 620, margin: '0 auto 40px' }}>
          SmartFlow intelligently prefetches, caches, and delivers content before users even request it.
          Experience near-zero perceived latency with adaptive streaming and offline resilience.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" className="sf-btn sf-btn-primary sf-btn-lg">
            Start Free →
          </Link>
          <Link href="/dashboard" className="sf-btn sf-btn-secondary sf-btn-lg">
            View Demo
          </Link>
        </div>

        {/* Metrics */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
          marginTop: 80,
          background: 'var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
        }}>
          {[
            { value: '< 30ms', label: 'Cache Hit Latency', icon: '⚡' },
            { value: '95%+', label: 'Cache Hit Rate', icon: '🎯' },
            { value: '10GB+', label: 'Large File Support', icon: '💾' },
          ].map((stat) => (
            <div key={stat.label} style={{
              padding: '32px 24px',
              background: 'var(--bg-secondary)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
              <div style={{
                fontSize: 36, fontWeight: 900,
                background: 'linear-gradient(135deg, var(--brand-300), var(--cyan-400))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '60px 40px', maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <h2 style={{ textAlign: 'center', fontSize: 36, marginBottom: 12 }}>
          Built for <span className="sf-gradient-text">Production</span>
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 60 }}>
          Every feature designed with performance, reliability, and scalability in mind.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="sf-card" style={{ padding: 28 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, marginBottom: 16,
                background: `linear-gradient(135deg, ${f.color1}, ${f.color2})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>{f.icon}</div>
              <h3 style={{ fontSize: 18, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '80px 40px', textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(59,101,248,0.1), rgba(34,211,238,0.05))',
        borderTop: '1px solid var(--border-subtle)',
        position: 'relative', zIndex: 1,
      }}>
        <h2 style={{ fontSize: 40, marginBottom: 16 }}>Ready to Ship Faster?</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
          Join SmartFlow and deliver content at the speed of thought.
        </p>
        <Link href="/register" className="sf-btn sf-btn-primary sf-btn-lg">
          Get Started Free →
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '32px 40px', borderTop: '1px solid var(--border-subtle)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16,
        color: 'var(--text-muted)', fontSize: 13,
      }}>
        <div>© 2024 SmartFlow. Intelligent Content Delivery Platform.</div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/dashboard" style={{ color: 'var(--text-muted)' }}>Dashboard</Link>
          <Link href="/login" style={{ color: 'var(--text-muted)' }}>Sign In</Link>
          <Link href="/register" style={{ color: 'var(--text-muted)' }}>Register</Link>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: '⚡', title: 'Smart Prefetching',
    desc: 'Intelligently predicts and pre-loads content before users request it. Adapts to network conditions.',
    color1: '#3b65f8', color2: '#22d3ee',
  },
  {
    icon: '🎯', title: 'Multi-Strategy Caching',
    desc: 'Cache-First, Network-First, Stale-While-Revalidate — the right strategy for every content type.',
    color1: '#8b5cf6', color2: '#c084fc',
  },
  {
    icon: '📡', title: 'Network Awareness',
    desc: 'Detects connection quality in real-time. Reduces prefetch on slow networks. Falls back to cache offline.',
    color1: '#059669', color2: '#34d399',
  },
  {
    icon: '🔄', title: 'Offline Resilience',
    desc: 'Service Worker ensures previously cached content remains available when network disappears.',
    color1: '#dc2626', color2: '#f87171',
  },
  {
    icon: '📊', title: 'Real-Time Analytics',
    desc: 'P50/P95/P99 latency, cache hit rate, prefetch efficiency. Real numbers, not estimates.',
    color1: '#d97706', color2: '#fbbf24',
  },
  {
    icon: '🎬', title: 'HLS Video Streaming',
    desc: 'Async FFmpeg processing, adaptive bitrate streaming, byte-range support for any-size videos.',
    color1: '#0891b2', color2: '#22d3ee',
  },
  {
    icon: '🔐', title: 'Enterprise Security',
    desc: 'JWT auth, bcrypt passwords, RBAC, SSRF protection, rate limiting, audit logging.',
    color1: '#065f46', color2: '#10b981',
  },
  {
    icon: '🔌', title: 'Source Adapters',
    desc: 'Google Drive, S3, Local Storage, and custom sources. Pluggable adapter architecture.',
    color1: '#7c3aed', color2: '#a78bfa',
  },
  {
    icon: '⚙️', title: 'Background Processing',
    desc: 'Celery workers handle ingestion, transcoding, and indexing — never block user requests.',
    color1: '#b45309', color2: '#f59e0b',
  },
];
