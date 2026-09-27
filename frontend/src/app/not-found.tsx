import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '36px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', fontWeight: '900', color: 'var(--brand-400)', marginBottom: '8px' }}>
          404
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginBottom: '8px' }}>
          Content or Page Not Found
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
          The requested resource does not exist or has been removed from the delivery network.
        </p>
        <Link href="/dashboard" className="btn btn-primary" style={{ padding: '8px 24px' }}>
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
