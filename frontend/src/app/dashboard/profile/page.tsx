'use client';

import { useAuthStore } from '@/features/auth/store';

export default function ProfilePage() {
  const { user } = useAuthStore();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>User Profile</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Account credentials, assigned roles, and permission levels.
        </p>
      </div>

      <div className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--brand-500), var(--accent-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: '800',
              color: '#fff',
            }}
          >
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', margin: 0 }}>
              {user?.full_name || user?.username || 'Authenticated User'}
            </h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
              <span className="badge badge-primary">{user?.role || 'user'}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{user?.email}</span>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-muted)' }}>User ID</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{user?.id || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-muted)' }}>Role Access Level</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: '600' }}>
              {user?.role === 'admin' ? 'Full Read/Write/Administer' : 'Read/Stream/Prefetch'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-muted)' }}>Authentication Protocol</span>
            <span style={{ color: 'var(--text-primary)' }}>JWT Access Token + Secure Refresh Token</span>
          </div>
        </div>
      </div>
    </div>
  );
}
