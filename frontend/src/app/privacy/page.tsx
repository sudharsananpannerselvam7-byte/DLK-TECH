import Link from 'next/link';

export default function PublicPrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', padding: '40px 20px' }}>
      <div style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 28, height: 28, background: 'var(--brand-500)', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>S</span>
            SmartFlow
          </Link>
          <Link href="/login" className="sf-btn sf-btn-secondary" style={{ textDecoration: 'none' }}>
            Sign In
          </Link>
        </div>

        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#fff', letterSpacing: '-0.02em' }}>
            Privacy Architecture & Data Sovereignty
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginTop: '8px' }}>
            SmartFlow is an intelligent local-first data acceleration platform. We guarantee zero-knowledge local isolation for user files.
          </p>
        </div>

        <div className="card" style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>1. Local-First Indexing Guarantee</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
            When you link a local folder (such as Videos, Documents, or Projects), the SmartFlow Desktop Agent inspects file metadata and generates local rolling hashes entirely inside your computer.
            Your local files are <strong>never uploaded to our servers</strong>.
          </p>
        </div>

        <div className="card" style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>2. Platform Limitations & Security Boundaries</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
            SmartFlow operates within strict security boundaries:
          </p>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, paddingLeft: 20, marginTop: 8 }}>
            <li>No DRM bypassing or decryption of third-party private traffic.</li>
            <li>No unauthorized scraping of Instagram, YouTube, or private social media.</li>
            <li>Authorized cloud connections (Google Drive, GitHub) use official OAuth 2.0 PKCE scopes with explicit user consent.</li>
          </ul>
        </div>

        <div className="card" style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>3. Local Cache Control</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
            All cached data is subject to weighted LRU retention and user-defined storage ceilings. You can wipe your local cache at any time with a single click.
          </p>
        </div>
      </div>
    </div>
  );
}
