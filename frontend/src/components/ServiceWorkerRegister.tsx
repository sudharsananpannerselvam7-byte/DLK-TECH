'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[SmartFlow] Service Worker registered with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[SmartFlow] Service Worker registration failed:', err);
          });
      });
    }
  }, []);

  return null;
}
