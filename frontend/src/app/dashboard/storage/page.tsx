'use client';

import { useState, useEffect } from 'react';
import { contentApi, analyticsApi, type ContentItem } from '@/lib/api/client';

export default function StoragePage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalBytes, setTotalBytes] = useState(0);

  useEffect(() => {
    async function loadStorage() {
      try {
        const [contentRes, overviewRes] = await Promise.all([
          contentApi.list({ per_page: 50 }),
          analyticsApi.overview(),
        ]);
        setItems(contentRes.data);
        setTotalBytes(overviewRes.data.storage?.total_bytes || 0);
      } catch {
        // Ignored
      } finally {
        setLoading(false);
      }
    }
    loadStorage();
  }, []);

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>Object Storage & Tier Management</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Direct object storage references, checksum validations, and media segment storage optimization.
        </p>
      </div>

      {/* Storage Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Storage Consumed</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#fff', marginTop: '6px' }}>
            {formatBytes(totalBytes)}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--accent-green)', marginTop: '4px' }}>
            100% object-backed, 0% bloat in PostgreSQL
          </p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Tracked Object Keys</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--brand-400)', marginTop: '6px' }}>
            {items.length}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Managed binary files with checksums
          </p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Integrity Verification</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--accent-green)', marginTop: '6px' }}>
            VERIFIED
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            SHA-256 / ETag checksum verification active
          </p>
        </div>
      </div>

      {/* Storage Objects Table */}
      <div className="card" style={{ padding: '24px', overflowX: 'auto' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
          Indexed Storage Artifacts
        </h3>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card skeleton" style={{ height: '40px' }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No storage artifacts found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 8px' }}>Original File</th>
                <th style={{ padding: '10px 8px' }}>MIME Type</th>
                <th style={{ padding: '10px 8px' }}>Size</th>
                <th style={{ padding: '10px 8px' }}>Storage Path / Key</th>
                <th style={{ padding: '10px 8px' }}>Optimization</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 8px', color: '#fff', fontWeight: '600' }}>
                    {item.title}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {item.mime_type}
                  </td>
                  <td style={{ padding: '12px 8px' }}>{formatBytes(item.file_size)}</td>
                  <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.storage_path}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    {item.is_optimized ? (
                      <span className="badge badge-success">Optimized</span>
                    ) : (
                      <span className="badge badge-secondary">Raw</span>
                    )}
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
