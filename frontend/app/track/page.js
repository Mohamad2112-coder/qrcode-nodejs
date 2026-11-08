/**
 * Staff Order Management (Track My Order)
 * - Shows all orders for the logged-in business
 * - Cashier can change status: Pending → Preparing → Ready → Collected
 * - No kitchen needed: cashier handles the full workflow
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { t, direction, formatCurrency } from '@/lib/i18n';
import { orders as orderApi } from '@/lib/api';

const STATUS_COLORS = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  PREPARING: 'bg-blue-100 text-blue-800 border-blue-200',
  READY: 'bg-green-100 text-green-800 border-green-200',
  COLLECTED: 'bg-gray-100 text-gray-600 border-gray-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
};

const NEXT_STATUS = {
  PENDING: 'PREPARING',
  PREPARING: 'READY',
  READY: 'COLLECTED',
};

export default function TrackPage() {
  const router = useRouter();
  const locale = typeof window !== 'undefined' ? localStorage.getItem('qr_locale') || 'en' : 'en';
  const dir = direction(locale);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transitioning, setTransitioning] = useState({});

  const STATUS_LABELS = {
    PENDING: t('statusPending') || 'Pending',
    PREPARING: t('statusPreparing') || 'Preparing',
    READY: t('statusReady') || 'Ready',
    COLLECTED: t('statusCollected') || 'Collected',
    CANCELLED: t('statusCancelled') || 'Cancelled',
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { orders: fetched } = await orderApi.list({ limit: 100 });
      setOrders(fetched || []);
    } catch (err) {
      setError(err.message || t('error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 8000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const transitionOrder = async (orderId, currentStatus) => {
    const next = NEXT_STATUS[currentStatus];
    if (!next) return;
    setTransitioning((prev) => ({ ...prev, [orderId]: true }));
    try {
      await orderApi.transition(orderId, next);
      await fetchOrders();
    } catch (err) {
      setError(err.message || t('error'));
    } finally {
      setTransitioning((prev) => {
        const nextState = { ...prev };
        delete nextState[orderId];
        return nextState;
      });
    }
  };

  // Show all orders for the business (not just today) so no order is missed
  const allOrders = orders;
  const totalSales = allOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const pendingCount = allOrders.filter((o) => o.status === 'PENDING').length;
  const readyCount = allOrders.filter((o) => o.status === 'READY').length;
  const collectedCount = allOrders.filter((o) => o.status === 'COLLECTED').length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold mx-auto mb-2 animate-spin">Q</div>
          <p className="text-gray-600">{t('loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="card p-8 text-center max-w-md">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-bold text-gray-900">{error}</h3>
          <button onClick={() => router.push('/')} className="btn btn-primary mt-4">{t('back')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6" dir={dir}>
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('track') || 'Track My Order'}</h1>
          <p className="text-gray-600 text-sm">Manage all orders for your business</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/pos')} className="btn btn-ghost text-sm">← {t('pos')}</button>
        </div>
      </div>

      {/* Sales Summary Cards */}
      <div className="max-w-7xl mx-auto mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-6 bg-white border-l-4 border-brand-600 shadow-sm">
          <div className="text-gray-500 text-xs font-semibold uppercase mb-1">Total Sales</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalSales, locale)}</div>
        </div>
        <div className="card p-6 bg-white border-l-4 border-blue-600 shadow-sm">
          <div className="text-gray-500 text-xs font-semibold uppercase mb-1">All Orders</div>
          <div className="text-2xl font-bold text-gray-900">{allOrders.length}</div>
        </div>
        <div className="card p-6 bg-white border-l-4 border-amber-600 shadow-sm">
          <div className="text-gray-500 text-xs font-semibold uppercase mb-1">Pending</div>
          <div className="text-2xl font-bold text-gray-900">{pendingCount}</div>
        </div>
        <div className="card p-6 bg-white border-l-4 border-green-600 shadow-sm">
          <div className="text-gray-500 text-xs font-semibold uppercase mb-1">Ready / Collected</div>
          <div className="text-2xl font-bold text-gray-900">{readyCount + collectedCount}</div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{t('orders') || 'All Orders'}</h2>
          {allOrders.length === 0 && (
            <span className="text-xs text-gray-500">No orders yet</span>
          )}
        </div>

        {allOrders.length === 0 ? (
          <div className="card p-12 text-center border border-dashed border-gray-200">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-gray-500">No orders yet. Go to Point of Sale to create your first order.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Order #</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody>
                {allOrders.map((order) => {
                  const isTransitioning = transitioning[order.id];
                  const nextStatus = NEXT_STATUS[order.status];
                  const canTransition = !!nextStatus;
                  return (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm font-bold text-gray-900">
                        {order.order_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {order.customer_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {formatCurrency(order.total_amount || 0, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${STATUS_COLORS[order.status]}`}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {canTransition && !isTransitioning ? (
                          <button
                            onClick={() => transitionOrder(order.id, order.status)}
                            className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors"
                          >
                            {nextStatus === 'PREPARING' ? t('startPreparing') : nextStatus === 'READY' ? t('markReady') : t('markCollected')}
                          </button>
                        ) : canTransition && isTransitioning ? (
                          <span className="px-3 py-1.5 text-xs text-brand-600 animate-pulse">…</span>
                        ) : (
                          <span className="px-3 py-1.5 text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                        {order.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
