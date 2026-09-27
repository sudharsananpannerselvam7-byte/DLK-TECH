'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';

const NAV_ITEMS = [
  { href: '/dashboard', icon: '◈', label: 'Dashboard' },
  { href: '/dashboard/feed', icon: '⊞', label: 'Content Feed' },
  { href: '/dashboard/search', icon: '⌕', label: 'Search' },
  { href: '/dashboard/upload', icon: '↑', label: 'Upload' },
  { type: 'divider', label: 'MONITORING' },
  { href: '/dashboard/analytics', icon: '📊', label: 'Analytics' },
  { href: '/dashboard/cache', icon: '⚡', label: 'Cache Monitor' },
  { href: '/dashboard/prefetch', icon: '🔮', label: 'Prefetch Monitor' },
  { href: '/dashboard/network', icon: '📡', label: 'Network Monitor' },
  { href: '/dashboard/jobs', icon: '⚙', label: 'Processing Jobs' },
  { type: 'divider', label: 'MANAGEMENT' },
  { href: '/dashboard/sources', icon: '🔌', label: 'Sources' },
  { href: '/dashboard/storage', icon: '💾', label: 'Storage' },
  { href: '/dashboard/profile', icon: '👤', label: 'Profile' },
  { href: '/dashboard/admin', icon: '🛡', label: 'Admin', roles: ['admin'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const network = useNetworkMonitor();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.push('/login');
    }
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="sf-skeleton" style={{ width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px' }} />
          <div className="sf-skeleton" style={{ width: 120, height: 16, margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const networkColor = network.isOnline
    ? network.quality === 'fast' ? 'var(--green-400)' : network.quality === 'medium' ? 'var(--yellow-400)' : 'var(--orange-400)'
    : 'var(--red-400)';

  return (
    <div className="sf-layout">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sf-sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, var(--brand-500), var(--cyan-400))',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: 'white', flexShrink: 0,
          }}>S</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>SmartFlow</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Content Delivery Platform</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }}>
          {NAV_ITEMS.map((item, idx) => {
            if ('type' in item && item.type === 'divider') {
              return (
                <div key={idx} style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  letterSpacing: '0.08em', padding: '16px 8px 6px',
                }}>
                  {item.label}
                </div>
              );
            }

            if (item.roles && !item.roles.includes(user?.role || '')) return null;

            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href!}
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 'var(--radius-md)',
                  marginBottom: 2, fontSize: 14, fontWeight: active ? 600 : 400,
                  color: active ? 'var(--brand-300)' : 'var(--text-secondary)',
                  background: active ? 'var(--bg-active)' : 'transparent',
                  transition: 'all var(--transition-fast)',
                  border: active ? '1px solid var(--border-brand)' : '1px solid transparent',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <span style={{ width: 20, textAlign: 'center', fontSize: 15 }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div style={{
          padding: '16px', borderTop: '1px solid var(--border-subtle)',
        }}>
          {/* Network status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)', marginBottom: 12, fontSize: 12,
          }}>
            <span className="sf-dot" style={{
              background: networkColor,
              boxShadow: `0 0 6px ${networkColor}`,
            }} />
            <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
              {network.status.charAt(0).toUpperCase() + network.status.slice(1)}
            </span>
            {network.rttMs && (
              <span style={{ color: 'var(--text-muted)' }}>{network.rttMs}ms</span>
            )}
          </div>

          {/* User info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36,
              background: 'linear-gradient(135deg, var(--brand-600), var(--brand-800))',
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0,
            }}>
              {(user?.username || 'U')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {user?.full_name || user?.username}
              </div>
              <div className="sf-badge sf-badge-info" style={{ fontSize: 10, padding: '1px 6px', display: 'inline-flex' }}>
                {user?.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="sf-btn sf-btn-ghost sf-btn-icon"
              title="Sign out"
              style={{ flexShrink: 0, fontSize: 16 }}
            >
              ⇥
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="sf-main">
        {/* Header */}
        <header className="sf-header">
          <button
            className="sf-btn sf-btn-ghost sf-btn-icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ display: 'none', marginRight: 12 }}
            id="sidebar-toggle"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>

          <div style={{ flex: 1 }}>
            <PageTitle pathname={pathname} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Network badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 'var(--radius-full)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: 12, fontWeight: 500,
            }}>
              <span className="sf-dot" style={{
                background: networkColor,
                boxShadow: network.isOnline ? `0 0 6px ${networkColor}` : 'none',
              }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                {network.quality === 'offline' ? 'Offline' : `${network.quality} · ${network.rttMs ? network.rttMs + 'ms' : '—'}`}
              </span>
            </div>

            <Link href="/dashboard/search" className="sf-btn sf-btn-secondary sf-btn-sm">
              ⌕ Search
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="sf-content sf-animate-in">
          {children}
        </main>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          #sidebar-toggle { display: flex !important; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function PageTitle({ pathname }: { pathname: string }) {
  const titles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/dashboard/feed': 'Content Feed',
    '/dashboard/search': 'Search',
    '/dashboard/upload': 'Upload Content',
    '/dashboard/analytics': 'Analytics',
    '/dashboard/cache': 'Cache Monitor',
    '/dashboard/prefetch': 'Prefetch Monitor',
    '/dashboard/network': 'Network Monitor',
    '/dashboard/jobs': 'Processing Jobs',
    '/dashboard/sources': 'Source Management',
    '/dashboard/storage': 'Storage',
    '/dashboard/profile': 'Profile',
    '/dashboard/admin': 'Admin Dashboard',
  };
  const title = titles[pathname] || 'SmartFlow';
  return <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h2>;
}
