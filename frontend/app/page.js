/**
 * Landing / dashboard home.
 * Role-aware entry point: cashier -> POS, kitchen -> KDS, owner/manager -> POS.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { t, direction, formatCurrency } from '@/lib/i18n';
import { getAuthToken, removeToken } from '@/lib/api';
import { api } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push('/login');
      return;
    }
    fetchMe();
  }, [router]);

  async function fetchMe() {
    try {
      const { user: u } = await api.get('/api/v1/auth/me');
      setUser(u);
    } catch (err) {
      setError(err.message);
      setTimeout(() => router.push('/login'), 1000);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    removeToken();
    router.push('/login');
  }

  const role = user?.role || 'cashier';
  const isKitchen = role === 'kitchen';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold">QR</div>
          <p className="text-gray-600">{t('loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm">Q</div>
            <span className="font-bold text-xl tracking-tight text-gray-900">QR Order Pager</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{user?.role_name || user?.role}</span>
            <button onClick={handleLogout} className="btn btn-ghost text-sm">{t('logout')}</button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto py-10 px-6">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">{t('welcome')}</h1>
        <p className="mb-8 text-gray-600">
          {role === 'super_admin' ? 'Multi-tenant SaaS control plane.' : `Welcome to ${user?.business_name || 'your business'}.`}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href={isKitchen ? '/kitchen' : '/pos'}
            onClick={(e) => {
              e.preventDefault();
              router.push(isKitchen ? '/kitchen' : '/pos');
            }}
            className="group relative card p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-lg font-semibold text-gray-900">
                {isKitchen ? t('kitchen') : t('pos')}
              </span>
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                {isKitchen ? '🍳' : '🧾'}
              </div>
            </div>
            <p className="text-gray-600 text-sm">
              {isKitchen
                ? 'Manage live orders, mark preparing/ready/collected.'
                : 'Build orders, calculate totals, generate QR tracking token.'}
            </p>
          </a>

          <a
            href="/track"
            onClick={(e) => {
              e.preventDefault();
              router.push('/track');
            }}
            className="card p-6 hover:shadow-md transition-shadow border border-blue-200"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-lg font-semibold text-gray-900">{t('track')}</span>
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">📱</div>
            </div>
            <p className="text-gray-600 text-sm">Customer-facing order tracker with QR token.</p>
          </a>
        </div>

        {user && (
          <div className="mt-8 card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Account</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 block">Name</span>
                <span className="text-gray-900">{user.full_name || user.email}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Role</span>
                <span className="text-gray-900 capitalize">{user.role_name || user.role}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Business</span>
                <span className="text-gray-900">{user.business_name || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Status</span>
                <span className="text-green-600 font-medium">{user.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
