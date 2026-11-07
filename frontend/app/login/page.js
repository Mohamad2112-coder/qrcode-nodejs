/**
 * Login page - authenticates user and issues JWT stored in localStorage.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import { api, setToken } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user, token } = await api.post('/api/v1/auth/login', { email, password });
      setToken(token);
      router.push('/');
    } catch (err) {
      setError(err.message || t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full card p-8 mx-auto shadow-lg">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold">Q</div>
          <span className="text-2xl font-bold text-gray-900 tracking-tight">QR Order Pager</span>
        </div>

        <h2 className="mb-6 text-xl font-bold text-gray-900">{t('login')}</h2>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-3"
          >
            {loading ? t('signin') || 'Signing in...' : t('login')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          No account? Contact your business owner to create one.
        </p>
      </div>
    </div>
  );
}
