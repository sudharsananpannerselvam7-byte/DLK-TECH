'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '36px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginBottom: '8px' }}>
          Application Encountered an Error
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
          {error.message || 'An unexpected runtime error occurred. SmartFlow resilient state is preserved.'}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <button onClick={() => reset()} className="btn btn-primary" style={{ padding: '8px 20px' }}>
            Try Again
          </button>
          <Link href="/dashboard" className="btn btn-secondary" style={{ padding: '8px 20px' }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
