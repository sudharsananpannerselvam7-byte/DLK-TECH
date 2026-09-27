'use client';

import { useState, useEffect } from 'react';
import { sourcesApi, type ContentSource } from '@/lib/api/client';

export default function SourcesPage() {
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [adapterType, setAdapterType] = useState('local');
  const [sourcePath, setSourcePath] = useState('');
  const [bucketName, setBucketName] = useState('');
  const [folderId, setFolderId] = useState('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const fetchSources = async () => {
    try {
      const res = await sourcesApi.list();
      setSources(res.data);
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const config: Record<string, unknown> = {};
      if (adapterType === 'local') config.path = sourcePath || 'uploads';
      if (adapterType === 's3' || adapterType === 'object_storage') config.bucket = bucketName;
      if (adapterType === 'google_drive') config.folder_id = folderId;

      await sourcesApi.create({
        name,
        adapter_type: adapterType,
        config,
      });
      setShowAddModal(false);
      setName('');
      fetchSources();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add source');
    }
  };

  const handleSync = async (id: string) => {
    try {
      setSyncStatus(`Initiating ingestion job for source ${id}...`);
      await sourcesApi.sync(id, true);
      setSyncStatus(`Sync dispatched. Check Background Jobs pipeline for live ingestion progress.`);
      fetchSources();
    } catch (err: unknown) {
      setSyncStatus(`Sync error: ${err instanceof Error ? err.message : 'Failed'}`);
    }
    setTimeout(() => setSyncStatus(null), 5000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this authorized content source?')) return;
    try {
      await sourcesApi.delete(id);
      fetchSources();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>Authorized Source Adapters</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Plug in authorized sources: Local Storage, S3 Object Storage, REST APIs, or Google Drive via service accounts.
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
          + Add Content Source
        </button>
      </div>

      {syncStatus && (
        <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--brand-500)', borderRadius: '8px', color: 'var(--brand-400)', fontSize: '13px' }}>
          {syncStatus}
        </div>
      )}

      {/* Sources Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card skeleton" style={{ height: '180px' }} />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>No content sources configured yet.</p>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">Connect First Source</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
          {sources.map((src) => (
            <div key={src.id} className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: 0 }}>{src.name}</h3>
                  <span className="badge badge-primary" style={{ marginTop: '6px', display: 'inline-block' }}>
                    {src.adapter_type.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <span className={`badge ${src.is_active ? 'badge-success' : 'badge-secondary'}`}>
                  {src.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>
                  Last Synced:{' '}
                  <span style={{ color: '#fff' }}>
                    {src.last_synced_at ? new Date(src.last_synced_at).toLocaleString() : 'Never'}
                  </span>
                </div>
                <div>
                  Configuration:{' '}
                  <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {JSON.stringify(src.config)}
                  </code>
                </div>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                <button
                  onClick={() => handleSync(src.id)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  🔄 Sync & Ingest
                </button>
                <button
                  onClick={() => handleDelete(src.id)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--accent-red)' }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Source Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', marginBottom: '16px' }}>Add Authorized Source Adapter</h2>
            <form onSubmit={handleCreateSource} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Source Label / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Media Library S3 Bucket"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Adapter Architecture</label>
                <select
                  className="input"
                  value={adapterType}
                  onChange={(e) => setAdapterType(e.target.value)}
                  style={{ background: 'var(--surface-color)', color: '#fff' }}
                >
                  <option value="local">Local Authorized Storage Adapter</option>
                  <option value="s3">S3-Compatible Object Storage Adapter</option>
                  <option value="google_drive">Google Drive Service Account Adapter</option>
                  <option value="api">Authorized REST API Adapter</option>
                </select>
              </div>

              {adapterType === 'local' && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Subfolder Path</label>
                  <input
                    type="text"
                    placeholder="uploads"
                    className="input"
                    value={sourcePath}
                    onChange={(e) => setSourcePath(e.target.value)}
                  />
                </div>
              )}

              {(adapterType === 's3' || adapterType === 'object_storage') && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Bucket Name</label>
                  <input
                    type="text"
                    placeholder="my-smartflow-bucket"
                    className="input"
                    value={bucketName}
                    onChange={(e) => setBucketName(e.target.value)}
                  />
                </div>
              )}

              {adapterType === 'google_drive' && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Google Drive Folder ID</label>
                  <input
                    type="text"
                    placeholder="1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
                    className="input"
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Credentials handled securely on backend via GOOGLE_SERVICE_ACCOUNT_JSON.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Source
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
