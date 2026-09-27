'use client';

import { useState, useEffect } from 'react';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';
import { networkApi } from '@/lib/api/client';

export default function NetworkMonitorPage() {
  const { isOnline, quality, rtt, bandwidth, isSyncing } = useNetworkMonitor();
  const [networkLogs, setNetworkLogs] = useState<Array<{ time: string; event: string; status: string }>>([]);
  const [pingStatus, setPingStatus] = useState<string | null>(null);

  useEffect(() => {
    // Record log entry on network state transition
    const now = new Date().toLocaleTimeString();
    setNetworkLogs((prev) => [
      {
        time: now,
        event: isOnline ? `Connected (${quality.toUpperCase()})` : 'Offline detected',
        status: isOnline ? 'online' : 'offline',
      },
      ...prev.slice(0, 19),
    ]);
  }, [isOnline, quality]);

  const handleTestLatency = async () => {
    const start = performance.now();
    try {
      setPingStatus('Pinging API endpoint...');
      await networkApi.report({
        rtt_ms: rtt || 10,
        bandwidth_mbps: bandwidth || 25,
        quality,
        is_online: isOnline,
      });
      const duration = Math.round(performance.now() - start);
      setPingStatus(`Ping response received in ${duration}ms. Telemetry synced with backend.`);
    } catch (err: unknown) {
      setPingStatus(`Ping failed: ${err instanceof Error ? err.message : 'Network error'}`);
    }
    setTimeout(() => setPingStatus(null), 5000);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>Network Telemetry & Quality Engine</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Real-time connection monitoring, downlink bandwidth estimation, and resilience failover controls.
        </p>
      </div>

      {/* Main Connection Status Card */}
      <div
        className="card"
        style={{
          padding: '24px',
          borderLeft: `4px solid ${isOnline ? 'var(--accent-green)' : 'var(--accent-red)'}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: isOnline ? 'var(--accent-green)' : 'var(--accent-red)',
                  display: 'inline-block',
                }}
              />
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', margin: 0 }}>
                {isOnline ? 'System Online — Full Connectivity' : 'System Offline — Local Cache Mode Active'}
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
              {isOnline
                ? `Delivery engine operating in ${quality.toUpperCase()} mode with adaptive lookahead.`
                : 'All network fetches halted. Serving cached assets through Service Worker and LRU memory.'}
            </p>
          </div>

          <button onClick={handleTestLatency} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
            ⚡ Ping API Health
          </button>
        </div>

        {pingStatus && (
          <div style={{ marginTop: '16px', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '13px', color: 'var(--brand-400)' }}>
            {pingStatus}
          </div>
        )}
      </div>

      {/* Telemetry Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Quality Classification</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: quality === 'fast' ? 'var(--accent-green)' : quality === 'medium' ? 'var(--brand-400)' : 'var(--accent-yellow)', marginTop: '6px' }}>
            {quality.toUpperCase()}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Based on NetworkInformation API and request RTT.
          </p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Round Trip Time (RTT)</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#fff', marginTop: '6px' }}>
            {rtt ? `${rtt} ms` : 'Estimating...'}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Observed round trip latency to gateway.
          </p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Estimated Downlink</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#fff', marginTop: '6px' }}>
            {bandwidth ? `${bandwidth} Mbps` : 'Unmetered'}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Available bandwidth for media buffering.
          </p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sync Status</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: isSyncing ? 'var(--brand-400)' : 'var(--accent-green)', marginTop: '6px' }}>
            {isSyncing ? 'SYNCING...' : 'IDLE / READY'}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Revalidation queue on network reconnect.
          </p>
        </div>
      </div>

      {/* Network Transition Event Log */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
          Network Transition Audit Log
        </h3>
        {networkLogs.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Monitoring active...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {networkLogs.map((log, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: log.status === 'online' ? 'var(--accent-green)' : 'var(--accent-red)',
                    }}
                  />
                  <span style={{ color: '#fff' }}>{log.event}</span>
                </div>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  {log.time}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
