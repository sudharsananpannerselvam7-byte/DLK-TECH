'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [autoPrefetch, setAutoPrefetch] = useState(true);
  const [prefetchWindow, setPrefetchWindow] = useState('dynamic');
  const [dataSaver, setDataSaver] = useState(false);
  const [cacheTTL, setCacheTTL] = useState('3600');
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('smartflow_user_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAutoPrefetch(parsed.autoPrefetch ?? true);
        setPrefetchWindow(parsed.prefetchWindow ?? 'dynamic');
        setDataSaver(parsed.dataSaver ?? false);
        setCacheTTL(parsed.cacheTTL ?? '3600');
      } catch {
        // Ignored
      }
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(
      'smartflow_user_settings',
      JSON.stringify({ autoPrefetch, prefetchWindow, dataSaver, cacheTTL })
    );
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>Platform Settings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Configure Smart Delivery Engine behavior, client prefetch aggressiveness, and cache storage limits.
        </p>
      </div>

      {savedNotice && (
        <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent-green)', borderRadius: '8px', color: 'var(--accent-green)', fontSize: '13px' }}>
          Settings successfully saved and applied to SmartDeliveryEngine.
        </div>
      )}

      <form onSubmit={handleSave} className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: '600', color: '#fff' }}>Enable Predictive Prefetching</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Pre-load next media items and feed cards before user clicks them.
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoPrefetch}
              onChange={(e) => setAutoPrefetch(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </label>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#fff', display: 'block', marginBottom: '6px' }}>
            Prefetch Window Size
          </label>
          <select
            className="input"
            value={prefetchWindow}
            onChange={(e) => setPrefetchWindow(e.target.value)}
            style={{ background: 'var(--surface-color)', color: '#fff' }}
          >
            <option value="dynamic">Dynamic (Network Adaptive - Recommended)</option>
            <option value="conservative">Conservative (1 Item Ahead)</option>
            <option value="aggressive">Aggressive (3+ Items Ahead)</option>
          </select>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: '600', color: '#fff' }}>Data Saver Mode</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Only prefetch metadata. Download media bytes exclusively on user request.
              </div>
            </div>
            <input
              type="checkbox"
              checked={dataSaver}
              onChange={(e) => setDataSaver(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </label>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#fff', display: 'block', marginBottom: '6px' }}>
            Client Cache TTL (Seconds)
          </label>
          <input
            type="number"
            className="input"
            value={cacheTTL}
            onChange={(e) => setCacheTTL(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button type="submit" className="btn btn-primary" style={{ padding: '8px 24px' }}>
            Save Preferences
          </button>
        </div>
      </form>
    </div>
  );
}
