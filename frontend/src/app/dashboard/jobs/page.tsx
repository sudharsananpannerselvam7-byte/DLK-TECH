'use client';

import { useState, useEffect, useCallback } from 'react';
import { jobsApi, type ProcessingJob } from '@/lib/api/client';

export default function JobsPage() {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await jobsApi.list({ status: statusFilter || undefined });
      setJobs(res.data);
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 4000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleCancel = async (id: string) => {
    try {
      await jobsApi.cancel(id);
      setActionMsg(`Job ${id} cancelled.`);
      fetchJobs();
    } catch (err: unknown) {
      setActionMsg(`Cancel failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleRetry = async (id: string) => {
    try {
      await jobsApi.retry(id);
      setActionMsg(`Job ${id} requeued for processing.`);
      fetchJobs();
    } catch (err: unknown) {
      setActionMsg(`Retry failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'badge-success';
      case 'processing':
        return 'badge-primary';
      case 'queued':
      case 'pending':
        return 'badge-warning';
      case 'failed':
      case 'cancelled':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>Background Processing Pipeline</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Asynchronous media optimization, transcoding, metadata extraction, and storage synchronization jobs.
          </p>
        </div>
        <button onClick={fetchJobs} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
          🔄 Refresh
        </button>
      </div>

      {actionMsg && (
        <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--brand-500)', borderRadius: '8px', color: 'var(--brand-400)', fontSize: '13px' }}>
          {actionMsg}
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginRight: '8px' }}>Filter by Status:</span>
        {['', 'processing', 'queued', 'completed', 'failed', 'cancelled'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`btn ${statusFilter === status ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 12px', fontSize: '12px', textTransform: 'capitalize' }}
          >
            {status || 'All Jobs'}
          </button>
        ))}
      </div>

      {/* Jobs Table */}
      <div className="card" style={{ padding: '24px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card skeleton" style={{ height: '48px' }} />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No background jobs found matching the filter.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 8px' }}>Job Type</th>
                <th style={{ padding: '10px 8px' }}>Status</th>
                <th style={{ padding: '10px 8px' }}>Progress</th>
                <th style={{ padding: '10px 8px' }}>Created</th>
                <th style={{ padding: '10px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ fontWeight: '600', color: '#fff' }}>{job.job_type}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ID: {job.id.slice(0, 8)}...
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span className={`badge ${getStatusBadge(job.status)}`}>
                      {job.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', minWidth: '140px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${job.progress_pct || (job.status === 'completed' ? 100 : 0)}%`,
                            height: '100%',
                            background: job.status === 'failed' ? 'var(--accent-red)' : 'var(--brand-500)',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', width: '32px' }}>
                        {job.progress_pct || (job.status === 'completed' ? 100 : 0)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    {new Date(job.created_at).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(job.status === 'processing' || job.status === 'queued') && (
                        <button
                          onClick={() => handleCancel(job.id)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-red)' }}
                        >
                          Cancel
                        </button>
                      )}
                      {(job.status === 'failed' || job.status === 'cancelled') && (
                        <button
                          onClick={() => handleRetry(job.id)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--brand-400)' }}
                        >
                          Retry
                        </button>
                      )}
                    </div>
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
