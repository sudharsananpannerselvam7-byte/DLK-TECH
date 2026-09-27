'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store';
import { ApiError } from '@/lib/api/client';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(identifier.trim(), password);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: '20px',
    }}>
      <div style={{
        background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(59,101,248,0.15) 0%, transparent 70%)',
        position: 'fixed', inset: 0, pointerEvents: 'none',
      }} />

      <div className="sf-card sf-animate-in" style={{ width: '100%', maxWidth: 420, padding: 40, position: 'relative' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56,
            background: 'linear-gradient(135deg, var(--brand-500), var(--cyan-400))',
            borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: 'white', margin: '0 auto 16px',
          }}>S</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Welcome back</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Sign in to SmartFlow</p>
        </div>

        {/* Demo credentials notice */}
        <div style={{
          background: 'rgba(59,101,248,0.08)', border: '1px solid rgba(59,101,248,0.2)',
          borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 24, fontSize: 13,
          color: 'var(--brand-300)',
        }}>
          <strong>Demo:</strong> admin@smartflow.local / SmartFlow@2024!
        </div>

        {error && (
          <div className="sf-badge sf-badge-error" style={{ marginBottom: 20, width: '100%', justifyContent: 'flex-start', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
              Email or Username
            </label>
            <input
              id="identifier"
              type="text"
              className="sf-input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="admin@smartflow.local"
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              className="sf-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="sf-btn sf-btn-primary"
            disabled={isLoading || !identifier || !password}
            style={{ width: '100%', marginTop: 8, padding: '12px 24px', fontSize: 15 }}
          >
            {isLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spinner /> Signing in...
              </span>
            ) : 'Sign In →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-muted)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: 'var(--brand-400)', fontWeight: 600 }}>Create one →</Link>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link href="/" style={{ fontSize: 13, color: 'var(--text-muted)' }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 16, height: 16,
      border: '2px solid rgba(255,255,255,0.3)',
      borderTopColor: 'white',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}
