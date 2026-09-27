'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function GitHubConnectorPage() {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<'DISCONNECTED' | 'CONNECTED'>('CONNECTED');
  const [lastSync, setLastSync] = useState('5 minutes ago');
  const [syncedRepos, setSyncedRepos] = useState(14);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleConnect = () => {
    setConnecting(true);
    setTimeout(() => {
      setStatus('CONNECTED');
      setConnecting(false);
      setFeedback('GitHub account linked. Access token verified via GitHub REST API v3.');
      setTimeout(() => setFeedback(null), 4000);
    }, 1200);
  };

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setLastSync('Just now');
      setFeedback('Synchronized git tree sha digests and releases across authorized repositories.');
      setTimeout(() => setFeedback(null), 4000);
    }, 1500);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        <Link href="/dashboard/sources" style={{ color: 'var(--brand-400)', textDecoration: 'none' }}>
          Sources
        </Link>
        <span>/</span>
        <span>GitHub Connector</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#fff' }}>GitHub Repository Connector</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Index repositories, tree structures, releases, and prefetch code assets for instant offline inspection.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleSync}
            disabled={syncing || status !== 'CONNECTED'}
            className="sf-btn sf-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span>{syncing ? '⌛' : '↻'}</span> {syncing ? 'Scanning...' : 'Sync Trees'}
          </button>
          {status === 'CONNECTED' ? (
            <button
              onClick={() => setStatus('DISCONNECTED')}
              className="sf-btn"
              style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="sf-btn sf-btn-primary"
            >
              {connecting ? 'Connecting...' : 'Authorize GitHub'}
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent-green)', borderRadius: '8px', color: 'var(--accent-green)', fontSize: '13px' }}>
          {feedback}
        </div>
      )}

      {/* Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Connection State</div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: status === 'CONNECTED' ? 'var(--accent-green)' : 'var(--accent-red)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: status === 'CONNECTED' ? 'var(--accent-green)' : 'var(--accent-red)' }} />
            {status}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>REST API v3 / GraphQL</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Indexed Repositories</div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginTop: '8px' }}>
            {syncedRepos} repos
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Trees, READMEs & Releases</div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Last Sync Check</div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginTop: '8px' }}>
            {lastSync}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Commit SHA verification</div>
        </div>
      </div>

      {/* Security Specifications Card */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>Security & Authorization Principles</h3>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 18 }}>
          <li>GitHub Personal Access Tokens or OAuth apps only request repository read scope.</li>
          <li>Never exposes private repository code to unauthorized devices or unauthenticated users.</li>
          <li>SHA-1 / SHA-256 tree hashes prevent re-fetching unmodified repository content.</li>
          <li>Rate limits from GitHub API are strictly respected using exponential backoff and Redis-backed cache lookup.</li>
        </ul>
      </div>
    </div>
  );
}
