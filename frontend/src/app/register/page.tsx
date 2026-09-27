'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store';
import { ApiError } from '@/lib/api/client';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', username: '', password: '', full_name: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.username.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    setIsLoading(true);
    try {
      await register({
        email: form.email.trim(),
        username: form.username.trim(),
        password: form.password,
        full_name: form.full_name.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Registration failed. Please try again.');
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
        background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(34,211,238,0.1) 0%, transparent 70%)',
        position: 'fixed', inset: 0, pointerEvents: 'none',
      }} />

      <div className="sf-card sf-animate-in" style={{ width: '100%', maxWidth: 440, padding: 40, position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56,
            background: 'linear-gradient(135deg, var(--cyan-400), var(--brand-500))',
            borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: 'white', margin: '0 auto 16px',
          }}>S</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Create Account</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Join SmartFlow today</p>
        </div>

        {success && (
          <div className="sf-badge sf-badge-success" style={{ marginBottom: 20, width: '100%', justifyContent: 'flex-start', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
            ✓ Account created! Redirecting to login...
          </div>
        )}

        {error && (
          <div className="sf-badge sf-badge-error" style={{ marginBottom: 20, width: '100%', justifyContent: 'flex-start', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { key: 'full_name', label: 'Full Name (optional)', type: 'text', placeholder: 'Jane Smith', required: false, autoComplete: 'name' },
            { key: 'email', label: 'Email Address', type: 'email', placeholder: 'jane@company.com', required: true, autoComplete: 'email' },
            { key: 'username', label: 'Username', type: 'text', placeholder: 'janesmith', required: true, autoComplete: 'username' },
            { key: 'password', label: 'Password (min 8 chars)', type: 'password', placeholder: 'Strong password', required: true, autoComplete: 'new-password' },
          ].map(({ key, label, type, placeholder, required, autoComplete }) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
                {label}
              </label>
              <input
                id={key}
                type={type}
                className="sf-input"
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={placeholder}
                required={required}
                autoComplete={autoComplete}
              />
            </div>
          ))}

          <button
            type="submit"
            className="sf-btn sf-btn-primary"
            disabled={isLoading || success}
            style={{ width: '100%', marginTop: 8, padding: '12px 24px', fontSize: 15 }}
          >
            {isLoading ? 'Creating account...' : 'Create Account →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--brand-400)', fontWeight: 600 }}>Sign in →</Link>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link href="/" style={{ fontSize: 13, color: 'var(--text-muted)' }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
