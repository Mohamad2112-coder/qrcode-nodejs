/**
 * Kitchen Display System (KDS)
 * - Touch-friendly active order cards with elapsed timers
 * - Status action buttons: Start Preparing / Mark Ready / Mark Collected
 * - Live Socket.io sync + polling fallback
 * - Offline status indicator
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import { t, direction, formatCurrency } from '@/lib/i18n';
import { api } from '@/lib/api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
const POLL_INTERVAL = 4000;

const STATUS_COLORS = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  PREPARING: 'bg-blue-100 text-blue-800 border-blue-200',
  READY: 'bg-green-100 text-green-800 border-green-200',
  COLLECTED: 'bg-gray-100 text-gray-600 border-gray-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
};

const STATUS_LABELS = {
  en: { PENDING: 'Pending', PREPARING: 'Preparing', READY: 'Ready', COLLECTED: 'Collected', CANCELLED: 'Cancelled' },
  ar: { PENDING: 'قيد الانتظار', PREPARING: 'قيد التحضير', READY: 'جاهز', COLLECTED: 'تم الاستلام', CANCELLED: 'ملغي' },
  kb: { PENDING: 'ئامادە نیە', PREPARING: 'ئامادەkirێ', READY: 'ئامادە', COLLECTED: 'هێنرا', CANCELLED: 'لێدانەوە' },
};

export default function KitchenPage() {
  const router = useRouter();
  const locale = typeof window !== 'undefined' ? (localStorage.getItem('qr_locale') || 'en') : 'en';
  const dir = direction(locale);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [online, setOnline] = useState(true);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    // Connect Socket.io with JWT auth if available
    const token = typeof window !== 'undefined' ? localStorage.getItem('qr_token') : null;
    const sock = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : {},
      reconnection: true,
    });

    sock.on('connect', () => {
      if (mounted) {
        setOnline(true);
        setSocket(sock);
      }
    });
    sock.on('disconnect', () => {
      if (mounted) setOnline(false);
    });
    sock.on('connect_error', () => {
      if (mounted) setOnline(false);
    });

    // Listen for order status changes in our business room
    sock.on('order:status_changed', (data) => {
      if (mounted) {
        setOrders((prev) => prev.map((o) => (o.id === data.orderId ? { ...o, status: data.status } : o)));
      }
    });
    sock.on('order:created', (data) => {
      if (mounted) {
        fetchOrders(); // refresh to get full details
      }
    });
    sock.on('order:synced', (data) => {
      if (mounted) fetchOrders();
    });

    // Initial fetch
    fetchOrders();

    const poll = setInterval(fetchOrders, POLL_INTERVAL);

    return () => {
      mounted = false;
      clearInterval(poll);
      sock.disconnect();
    };
  }, [locale]);

  const fetchOrders = useCallback(async () => {
    try {
      const { orders: fetched } = await api.get('/api/v1/orders?status=PENDING&status=PREPARING&status=READY&limit=50');
      setOrders(fetched || []);
      setError(null);
    } catch (err) {
      setError(err.message || t('error'));
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const transitionStatus = async (orderId, status) => {
    try {
      await api.post(`/api/v1/orders/${orderId}/status`, { status });
      // Socket broadcast will update UI, but optimistic refresh too
      await fetchOrders();
    } catch (err) {
      setError(err.message || t('error'));
    }
  };

  const labelFor = (status) => {
    const labels = STATUS_LABELS[locale] || STATUS_LABELS.en;
    return labels[status] || status;
  };

  const elapsedMinutes = (createdAt) => {
    const ms = Date.now() - new Date(createdAt).getTime();
    return Math.floor(ms / 60000);
  };

  const formatTime = (createdAt) => {
    const mins = elapsedMinutes(createdAt);
    if (mins < 1) return t('justNow') || 'Just now';
    if (mins < 60) return `${mins} ${t('minutes') || 'min'}`;
    const h = Math.floor(mins / 60);
    return `${h}h ${mins % 60}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold mx-auto mb-2">🍳</div>
          <p className="text-gray-600">{t('loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  const activeOrders = orders.filter((o) => o.status !== 'COLLECTED' && o.status !== 'CANCELLED');

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('kitchen')}</h1>
            <p className="text-gray-600 text-sm">Live orders requiring kitchen attention</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {online ? t('online') : t('offline')}
            </span>
            <span className="text-sm font-medium text-gray-900">{activeOrders.length} Active</span>
            <button
              onClick={fetchOrders}
              className="btn btn-ghost text-sm"
              disabled={loading}
            >
              {t('syncing') || 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        {activeOrders.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-6xl mb-4">🍳</div>
            <h3 className="text-lg font-semibold text-gray-900">{t('noOrders')}</h3>
            <p className="text-gray-600">No active orders in the kitchen.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeOrders.map((order) => (
              <div
                key={order.id}
                className={`card p-5 relative group shadow-sm transition-all hover:shadow-md ${
                  order.status === 'READY' ? 'border-green-300 ring-1 ring-green-400' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_COLORS[order.status]}`}>
                      {labelFor(order.status)}
                    </span>
                    <span className="text-xs font-mono text-gray-500">#{order.orderNumber}</span>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{t('customer')}</span>
                    <span className="text-gray-900 font-medium">{order.customer_name || '—'}</span>
                  </div>
                  {order.table_number && (
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{t('table')}</span>
                      <span className="text-gray-900">{order.table_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{t('total')}</span>
                    <span className="text-gray-900 font-medium">{formatCurrency(order.total_amount, locale)}</span>
                  </div>
                </div>

                {/* Elapsed timer */}
                <div className="mb-4 p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 uppercase">Elapsed</span>
                    <span className={`font-mono text-lg font-bold ${order.status === 'READY' ? 'text-green-600' : 'text-gray-900'}`}>
                      {formatTime(order.created_at)}
                    </span>
                  </div>
                </div>

                {/* Action buttons based on status */}
                <div className="grid grid-cols-2 gap-2">
                  {order.status === 'PENDING' && (
                    <button
                      onClick={() => transitionStatus(order.id, 'PREPARING')}
                      disabled={!online}
                      className="btn btn-ghost py-2 text-sm border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {t('startPreparing')}
                    </button>
                  )}
                  {order.status === 'PREPARING' && (
                    <button
                      onClick={() => transitionStatus(order.id, 'READY')}
                      disabled={!online}
                      className="btn btn-success py-2 text-sm disabled:opacity-50"
                    >
                      {t('markReady')}
                    </button>
                  )}
                  {order.status === 'READY' && (
                    <button
                      onClick={() => transitionStatus(order.id, 'COLLECTED')}
                      disabled={!online}
                      className="btn btn-primary py-2 text-sm disabled:opacity-50"
                    >
                      {t('markCollected')}
                    </button>
                  )}
                </div>

                {/* Offline warning overlay */}
                {!online && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur rounded-xl flex items-center justify-center pointer-events-none">
                    <span className="text-white text-sm font-bold">{t('offline')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
