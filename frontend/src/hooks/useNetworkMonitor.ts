/**
 * SmartFlow Network Monitor Hook
 * Detects online/offline status, estimates connection quality,
 * and reports metrics to the backend.
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { networkApi } from '@/lib/api/client';

export type NetworkQuality = 'fast' | 'medium' | 'slow' | 'offline';
export type NetworkStatus = 'online' | 'offline' | 'reconnecting' | 'syncing';

export interface NetworkState {
  isOnline: boolean;
  status: NetworkStatus;
  quality: NetworkQuality;
  rttMs: number | null;
  bandwidthMbps: number | null;
  lastOnlineAt: Date | null;
  rtt?: number | null;
  bandwidth?: number | null;
  isSyncing?: boolean;
}

const DEFAULT_STATE: NetworkState = {
  isOnline: true,
  status: 'online',
  quality: 'medium',
  rttMs: null,
  bandwidthMbps: null,
  lastOnlineAt: new Date(),
};

export function useNetworkMonitor() {
  const [network, setNetwork] = useState<NetworkState>(DEFAULT_STATE);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reportIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const estimateQuality = useCallback((rttMs: number | null): NetworkQuality => {
    if (!rttMs) return 'medium';
    if (rttMs < 50) return 'fast';
    if (rttMs < 200) return 'medium';
    return 'slow';
  }, []);

  const pingServer = useCallback(async () => {
    const start = performance.now();
    try {
      await fetch('/api/v1/health/live', { cache: 'no-store' });
      const rttMs = Math.round(performance.now() - start);
      const quality = estimateQuality(rttMs);
      
      setNetwork(prev => ({
        ...prev,
        isOnline: true,
        status: prev.status === 'reconnecting' ? 'syncing' : 'online',
        quality,
        rttMs,
        lastOnlineAt: new Date(),
      }));

      // After syncing, transition back to online
      setTimeout(() => {
        setNetwork(prev => ({ ...prev, status: prev.status === 'syncing' ? 'online' : prev.status }));
      }, 2000);

      return { rttMs, quality };
    } catch {
      return null;
    }
  }, [estimateQuality]);

  const reportToBackend = useCallback(async (state: NetworkState) => {
    try {
      await networkApi.report({
        rtt_ms: state.rttMs || undefined,
        quality: state.quality,
        is_online: state.isOnline,
      });
    } catch {
      // Never let reporting break the app
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = async () => {
      setNetwork(prev => ({ ...prev, isOnline: true, status: 'reconnecting' }));
      const result = await pingServer();
      if (result) {
        setNetwork(prev => ({
          ...prev,
          status: 'syncing',
          quality: result.quality,
          rttMs: result.rttMs,
          lastOnlineAt: new Date(),
        }));
        setTimeout(() => setNetwork(prev => ({ ...prev, status: 'online' })), 2000);
      }
    };

    const handleOffline = () => {
      setNetwork(prev => ({
        ...prev,
        isOnline: false,
        status: 'offline',
        quality: 'offline',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial ping
    pingServer();

    // Ping every 30 seconds
    pingIntervalRef.current = setInterval(pingServer, 30000);

    // Report to backend every 2 minutes
    reportIntervalRef.current = setInterval(() => {
      setNetwork(prev => {
        reportToBackend(prev);
        return prev;
      });
    }, 120000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reportIntervalRef.current) clearInterval(reportIntervalRef.current);
    };
  }, [pingServer, reportToBackend]);

  return {
    ...network,
    rtt: network.rttMs,
    bandwidth: network.bandwidthMbps,
    isSyncing: network.status === 'syncing',
  };
}
