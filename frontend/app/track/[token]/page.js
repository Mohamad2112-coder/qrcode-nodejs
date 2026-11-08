/**
 * Customer Mobile Tracking PWA
 * - Mobile-first order tracker with status progress bar
 * - Item snapshot (historical name/price)
 * - Web Push permission opt-in banner
 * - Multi-language: English LTR, Arabic/Kurdish RTL
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { t, direction, formatCurrency } from '@/lib/i18n';
import { api } from '@/lib/api';

const STATUS_ORDER = ['PENDING', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED'];
const STATUS_STEPS = {
  en: [
    { key: 'PENDING', label: 'Order Received', icon: '📥' },
    { key: 'PREPARING', label: 'Preparing', icon: '🍳' },
    { key: 'READY', label: 'Ready for Pickup', icon: '✅' },
    { key: 'COLLECTED', label: 'Collected', icon: '🛍️' },
  ],
  ar: [
    { key: 'PENDING', label: 'تم استلام الطلب', icon: '📥' },
    { key: 'PREPARING', label: 'قيد التحضير', icon: '🍳' },
    { key: 'READY', label: 'جاهز للاستلام', icon: '✅' },
    { key: 'COLLECTED', label: 'تم الاستلام', icon: '🛍️' },
  ],
  kb: [
    { key: 'PENDING', label: 'فانلەکە گIRT', icon: '📥' },
    { key: 'PREPARING', label: 'ئامادەkirێ', icon: '🍳' },
    { key: 'READY', label: 'ئامادە بۆ هەylan', icon: '✅' },
    { key: 'COLLECTED', label: 'هێنرا', icon: '🛍️' },
  ],
};

export default function TrackPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token;
  const locale = typeof window !== 'undefined' ? (localStorage.getItem('qr_locale') || 'en') : 'en';
  const dir = direction(locale);

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushPrompt, setPushPrompt] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [previousStatus, setPreviousStatus] = useState(null);
  const [statusChanged, setStatusChanged] = useState(false);

  const steps = STATUS_STEPS[locale] || STATUS_STEPS.en;

  const trackStatusLabels = {
    PENDING: t('statusPending'),
    PREPARING: t('statusPreparing'),
    READY: t('statusReady'),
    COLLECTED: t('statusCollected'),
    CANCELLED: t('statusCancelled'),
  };

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setError('Missing order token');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const { order: o, items: it } = await api.get(`/api/v1/orders/track/${token}`);
        if (mounted) {
          setOrder(o);
          setItems(it);
          if (o.status !== previousStatus) {
            setPreviousStatus(o.status);
            setStatusChanged(true);
            setTimeout(() => setStatusChanged(false), 1500);
          }
        }
        setError(null);
      } catch (err) {
        setError(err.message || t('error'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // Poll for status updates (fallback when push unavailable)
    const poll = setInterval(async () => {
      if (!mounted) return;
      try {
        const { order: o, items: it } = await api.get(`/api/v1/orders/track/${token}`);
        if (mounted) {
          setOrder(o);
          setItems(it);
          if (o.status !== previousStatus) {
            setPreviousStatus(o.status);
            setStatusChanged(true);
            setTimeout(() => setStatusChanged(false), 1500);
          }
        }
      } catch (_e) {
        // silently retry
      }
    }, 5000);

    // Check push support
    if (typeof window !== 'undefined') {
      setPushSupported('serviceWorker' in navigator && 'PushManager' in window);
    }

    return () => {
      mounted = false;
      clearInterval(poll);
    };
  }, [token, locale]);

  const currentIndex = order ? STATUS_ORDER.indexOf(order.status) : -1;
  const progress = order ? Math.max(0, Math.min(100, (currentIndex / (STATUS_ORDER.length - 1)) * 100)) : 0;
  const isComplete = order && order.status === 'COLLECTED';

  const stepFor = (key) => steps.find((s) => s.key === key) || { label: key, icon: '⚪' };

  // --- Web Push subscription ---
  async function registerPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setRegistering(true);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''),
      });

      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/v1/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256h_key: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
          auth_key: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))),
          user_agent: navigator.userAgent,
          order_id: order?.id,
        }),
      });

      if (!resp.ok) throw new Error('Failed to register push subscription');

      setPushSubscribed(true);
      setPushPrompt(false);
      // Note: order_id is stored with the subscription so the backend
      // knows which order's READY notifications to send to this subscriber.
    } catch (err) {
      console.error('[PUSH] registration failed', err);
      setError(err.message || 'Push registration failed');
    } finally {
      setRegistering(false);
    }
  }

  async function checkExistingSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        const sub = await registration.pushManager.getSubscription();
        setPushSubscribed(!!sub);
      }
    } catch (_e) {
      // ignore
    }
  }

  useEffect(() => {
    checkExistingSubscription();
  }, [locale]);

  function urlBase64ToUint8Array(base64String) {
    if (!base64String || base64String.includes('REPLACE_WITH')) return new Uint8Array(0);
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold mx-auto mb-2 animate-spin">📦</div>
          <p className="text-gray-600">{t('loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="card p-8 text-center max-w-md">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-bold text-gray-900">{error || t('orderNotFound') || 'Order not found'}</h3>
          <p className="text-gray-600 text-sm mb-4">The tracking link may be expired or invalid.</p>
          <button onClick={() => router.push('/')} className="btn btn-primary">{t('back')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 md:p-0" dir={dir}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-900">←</button>
          <div className="flex-1 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{t('track')}</span>
            <h2 className="font-bold text-gray-900">#{order.orderNumber}</h2>
          </div>
          <div className="text-gray-400"></div>
        </div>
      </div>

      <div className="max-w-md mx-auto py-6 px-4 space-y-6">
        {/* Business */}
        {order.businessName && (
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900">{order.businessName}</p>
          </div>
        )}

        {/* Progress stepper */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">{t('orderStatus') || 'Order Status'}</p>
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => {
              const active = order.status === step.key;
              const completed = currentIndex > idx;
              const pending = currentIndex < idx;
              return (
                <div key={step.key} className="flex-1 flex flex-col items-center relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-500 ${
                    completed ? 'bg-green-600 text-white' : active ? 'bg-brand-600 text-white ring-2 ring-brand-300 animate-pulse' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {step.icon}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 h-px flex-1 ${
                      completed ? 'bg-green-400' : pending ? 'bg-gray-200' : 'bg-gray-100'
                    }"></div>
                  )}
                  <span className={`text-xs mt-1 font-medium ${completed || active ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div className={`h-full transition-all duration-500 ${
              currentIndex === STATUS_ORDER.length - 1 ? 'bg-green-600' : 'bg-brand-600'
            } ${statusChanged ? 'animate-pulse' : ''}`} style={{ width: `${progress}%` }}></div>
          </div>
        </div>

        {/* Current status card */}
        <div className={`card ${isComplete ? 'border-green-200 bg-green-50' : ''} ${statusChanged ? 'animate-pulse ring-2 ring-brand-300' : ''}`}>
          <div className="flex items-center gap-3">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
              order.status === 'READY' ? 'bg-green-100 text-green-600' :
              order.status === 'PREPARING' ? 'bg-blue-100 text-blue-600' :
              order.status === 'COLLECTED' ? 'bg-green-600 text-white animate-checkmark' :
              order.status === 'CANCELLED' ? 'bg-red-100 text-red-600' :
              'bg-amber-100 text-amber-700'
            }`}>
              {order.status === 'READY' ? '✅' : order.status === 'PREPARING' ? '🍳' : order.status === 'COLLECTED' ? '🛍️' : order.status === 'CANCELLED' ? '❌' : '⏳'}
            </span>
            <div>
              <p className={`font-semibold text-gray-900 ${order.status === 'READY' ? 'text-green-600' : 'text-gray-900'}`}>
                {trackStatusLabels[order.status] || order.status}
              </p>
              {order.status === 'READY' && (
                <p className="text-xs text-green-600 font-medium mt-0.5">Your order is ready for collection!</p>
              )}
            </div>
          </div>
        </div>

        {/* Items snapshot */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">{t('items')}</p>
          <div className="space-y-2">
            {items.length > 0 ? (
              items.map((item) => (
                <div key={item.name || item.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">{item.quantity}x</span>
                    <span className="text-sm font-medium text-gray-900">{item.name}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(item.totalPrice, locale)}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">No items</div>
            )}
          </div>
        </div>

        {/* Total */}
        <div className="card border-t-2 border-brand-600 pt-6 pb-4">
          <div className="flex justify-between text-lg font-bold text-gray-900">
            <span>{t('total')}</span>
            <span>{formatCurrency(order.totalAmount || 0, locale)}</span>
          </div>
        </div>

        {/* Web Push opt-in banner */}
        {pushSupported && !pushSubscribed && !isComplete && (
          <div className="card border-2 border-brand-200 bg-brand-50 p-4 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs">📢</div>
              <div>
                <p className="font-semibold text-gray-900">{t('enableNotifications')}</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  {t('notifyReady') || 'Get notified when your order is ready.'}
                </p>
              </div>
            </div>
            <button
              onClick={registerPush}
              disabled={registering}
              className="mt-4 w-full btn btn-primary py-2.5 text-sm disabled:opacity-50"
            >
              {registering ? 'Activating...' : t('notifyReady') || 'Notify Me When Ready'}
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
