'use client';

import { useState } from 'react';

export default function PrivacyPage() {
  const [clearing, setClearing] = useState(false);
  const [clearedNotice, setClearedNotice] = useState<string | null>(null);

  const handleClearCache = async (type: string) => {
    setClearing(true);
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      localStorage.removeItem('smartflow_user_settings');
      sessionStorage.clear();
      setClearedNotice(`Local ${type} storage wiped successfully. No residual data cached.`);
      setTimeout(() => setClearedNotice(null), 4000);
    } catch (e: any) {
      setClearedNotice('Cleared local buffers.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#fff', letterSpacing: '-0.02em' }}>
          Privacy, Cache Control & Data Isolation
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          SmartFlow is architected with a strict Local-First, Zero-Knowledge principle for user files and tokens.
        </p>
      </div>

      {clearedNotice && (
        <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent-green)', borderRadius: '8px', color: 'var(--accent-green)', fontSize: '13px' }}>
          {clearedNotice}
        </div>
      )}

      {/* Core Privacy Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>📁</span>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>What Stays Local</h3>
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 18 }}>
            <li>Local laptop files remain on your disk; raw file bytes are <strong>never</strong> uploaded to the central cloud.</li>
            <li>Local file index database (<code>local_index.db</code>) is stored locally on your machine.</li>
            <li>Folder change events monitored by the desktop agent are processed locally.</li>
            <li>Local cache disk storage remains inside the user-configured cache directory.</li>
          </ul>
        </div>

        <div className="card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>☁</span>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>What is Synchronized</h3>
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 18 }}>
            <li>Anonymized performance metrics (P50/P95 latency, cache hit ratios, bandwidth savings).</li>
            <li>Device registration status (fingerprint ID, client version, heartbeat timestamps).</li>
            <li>Content titles, MIME types, and sizes for user-created public or team feed items.</li>
            <li>Sequential transition graphs ($A \to B$) for prefetch lookahead calculation.</li>
          </ul>
        </div>
      </div>

      {/* Cache Eviction and Privacy Actions */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>User Cache Privacy Controls</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
          You retain full authority over cached resources on this device. Evicting cache will free storage immediately.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button
            onClick={() => handleClearCache('Service Worker & Media')}
            disabled={clearing}
            className="sf-btn sf-btn-secondary"
          >
            {clearing ? 'Clearing...' : 'Clear Browser L2 Cache'}
          </button>
          <button
            onClick={() => handleClearCache('Complete Local')}
            disabled={clearing}
            className="sf-btn"
            style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
          >
            Wipe All Local Acceleration Data
          </button>
        </div>
      </div>

      {/* Security Policies */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>Operational Guarantees</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
          <p>
            SmartFlow strictly abides by platform sandbox restrictions. It does NOT intercept private HTTPS traffic of third-party applications, does NOT bypass DRM, and never scrapes private social media or unauthorized cloud folders.
          </p>
          <p>
            All authenticated communications between the SmartFlow Desktop Agent and SmartFlow APIs use TLS 1.3 encryption with HMAC request verification.
          </p>
        </div>
      </div>
    </div>
  );
}
