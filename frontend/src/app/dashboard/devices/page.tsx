'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/services/api';

interface DeviceItem {
  id: string;
  device_name: string;
  device_type: string;
  device_fingerprint: string;
  client_version: string;
  ip_address: string;
  status: string;
  is_authorized: boolean;
  last_seen_at: string;
  created_at: string;
  system_info?: Record<string, any>;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<DeviceItem[]>('/devices');
      if (res.data) {
        setDevices(res.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load authorized devices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleUpdate = async (deviceId: string, isAuth?: boolean) => {
    try {
      const payload: any = {};
      if (editName && editingId === deviceId) {
        payload.device_name = editName;
      }
      if (isAuth !== undefined) {
        payload.is_authorized = isAuth;
      }
      await apiClient.patch(`/devices/${deviceId}`, payload);
      setActionMsg('Device updated successfully.');
      setEditingId(null);
      setEditName('');
      fetchDevices();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to update device.');
    }
  };

  const handleRevoke = async (deviceId: string) => {
    if (!confirm('Are you sure you want to revoke and disconnect this device?')) return;
    try {
      await apiClient.delete(`/devices/${deviceId}`);
      setActionMsg('Device revoked and disconnected.');
      fetchDevices();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke device.');
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#fff', letterSpacing: '-0.02em' }}>
            Authorized Devices
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Manage registered desktop agents, workstations, and local edge acceleration endpoints.
          </p>
        </div>
        <button
          onClick={fetchDevices}
          className="sf-btn sf-btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span>↻</span> Refresh List
        </button>
      </div>

      {actionMsg && (
        <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent-green)', borderRadius: '8px', color: 'var(--accent-green)', fontSize: '13px' }}>
          {actionMsg}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', borderRadius: '8px', color: 'var(--accent-red)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Security Architecture Info Banner */}
      <div className="card" style={{ padding: '20px', borderLeft: '4px solid var(--brand-500)', background: 'rgba(99, 102, 241, 0.05)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 22 }}>🛡</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>Zero-Trust Device Isolation</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              SmartFlow Desktop agents establish an authenticated link to your account.
              Cloud services cannot perform arbitrary filesystem exploration. Local indexing and caching only operate on user-authorized folders.
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map((i) => (
            <div key={i} className="card sf-skeleton" style={{ height: 100 }} />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>💻</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>No Devices Connected</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '460px', margin: '8px auto 20px', lineHeight: 1.5 }}>
            Launch the SmartFlow Desktop Agent on your machine to index local media, monitor filesystem changes, and accelerate access.
          </p>
          <div style={{ display: 'inline-flex', gap: 12 }}>
            <span style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }}>
              python desktop/desktop_app.py
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          {devices.map((device) => {
            const isOnline = device.status === 'online';
            return (
              <div
                key={device.id}
                className="card"
                style={{
                  padding: '22px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 16,
                  border: device.is_authorized ? '1px solid var(--border-subtle)' : '1px solid rgba(239, 68, 68, 0.4)',
                }}
              >
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                    }}
                  >
                    💻
                  </div>
                  <div>
                    {editingId === device.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="sf-input"
                          style={{ padding: '4px 8px', fontSize: 14 }}
                        />
                        <button
                          onClick={() => handleUpdate(device.id)}
                          className="sf-btn sf-btn-primary"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="sf-btn sf-btn-secondary"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>{device.device_name}</span>
                        <button
                          onClick={() => {
                            setEditingId(device.id);
                            setEditName(device.device_name);
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
                          title="Rename device"
                        >
                          ✎
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: isOnline ? 'var(--accent-green)' : 'var(--text-muted)',
                            display: 'inline-block',
                          }}
                        />
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                      <span>v{device.client_version}</span>
                      <span>IP: {device.ip_address || '127.0.0.1'}</span>
                      <span>ID: {device.device_fingerprint.slice(0, 12)}...</span>
                      <span>Last Seen: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleTimeString() : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => handleUpdate(device.id, !device.is_authorized)}
                    className="sf-btn sf-btn-secondary"
                    style={{
                      padding: '8px 14px',
                      fontSize: 12,
                      color: device.is_authorized ? 'var(--accent-yellow)' : 'var(--accent-green)',
                    }}
                  >
                    {device.is_authorized ? 'Suspend Access' : 'Authorize Device'}
                  </button>
                  <button
                    onClick={() => handleRevoke(device.id)}
                    className="sf-btn"
                    style={{
                      padding: '8px 14px',
                      fontSize: 12,
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: 'var(--accent-red)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
