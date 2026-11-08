/**
 * Cashier Dashboard / POS Interface
 * - Sales summary cards (today's revenue, order count, pending/ready)
 * - Order queue with status transitions (Mark Ready / Mark Collected)
 * - Product grid + cart for taking new orders
 * - QR token generation for customer tracking
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { t, direction, formatCurrency } from '@/lib/i18n';
import { orders as orderApi, getAuthToken, removeToken } from '@/lib/api';

const CATEGORIES = [
  { id: 'all', label: { en: 'All', ar: 'ال全部', kb: 'هەموو' }, color: 'bg-gray-100 text-gray-700' },
  { id: 'food', label: { en: 'Food', ar: 'طعام', kb: 'نانون' }, color: 'bg-red-100 text-red-700' },
  { id: 'drink', label: { en: 'Drinks', ar: 'مشروبات', kb: 'عەرەبەکان' }, color: 'bg-blue-100 text-blue-700' },
  { id: 'dessert', label: { en: 'Dessert', ar: 'حلويات', kb: 'شیرینی' }, color: 'bg-amber-100 text-amber-700' },
];

const MENU = [
  { id: 'p1', category: 'food', name: { en: 'Grilled Burger', ar: 'برجر مشوي', kb: 'بۆرجەر کۆتایی' }, price: 8500, available: true },
  { id: 'p2', category: 'food', name: { en: 'Margherita Pizza', ar: 'بيتزا مارgherita', kb: 'پیتزای مارgherita' }, price: 12000, available: true },
  { id: 'p3', category: 'food', name: { en: 'Caesar Salad', ar: 'سلطة سيزر', kb: 'سالاتی سێزەر' }, price: 6500, available: true },
  { id: 'p4', category: 'drink', name: { en: 'Cola', ar: 'كوكاكولا', kb: 'کۆلا' }, price: 2000, available: true },
  { id: 'p5', category: 'drink', name: { en: 'Fresh Orange Juice', ar: 'عصير برتقال طازج', kb: 'ئۆرێنج تازە' }, price: 4000, available: true },
  { id: 'p6', category: 'drink', name: { en: 'Bottled Water', ar: 'ماء معبأ', kb: 'ئاو پڕکراو' }, price: 1500, available: true },
  { id: 'p7', category: 'dessert', name: { en: 'Cheesecake', ar: 'كعكة الجبن', kb: 'چیزکیک' }, price: 5500, available: true },
  { id: 'p8', category: 'dessert', name: { en: 'Ice Cream', ar: 'آيس كريم', kb: 'ئایسکریم' }, price: 3000, available: true },
];

const STATUS_COLORS = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  PREPARING: 'bg-blue-100 text-blue-800 border-blue-200',
  READY: 'bg-green-100 text-green-800 border-green-200',
  COLLECTED: 'bg-gray-100 text-gray-600 border-gray-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
};

function localized(obj, locale) {
  return obj && obj[locale] ? obj[locale] : (obj.en || obj);
}

export default function PosPage() {
  const router = useRouter();
  const locale = typeof window !== 'undefined' ? localStorage.getItem('qr_locale') || 'en' : 'en';
  const dir = direction(locale);

  // --- Cart state ---
  const [products, setProducts] = useState(MENU);
  const [activeCategory, setActiveCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null);
  const [error, setError] = useState(null);

  // --- Order queue state ---
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [transitioning, setTransitioning] = useState({});

  // --- Auth check: redirect to login if no valid token ---
  useEffect(() => {
    if (!getAuthToken()) {
      removeToken();
      router.push('/login');
      return;
    }
  }, [router]);

  // --- Load products from API on mount (fallback to static MENU) ---
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // POS doesn't require backend products to function; static MENU is the fallback.
      } catch (_e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  // --- Fetch today's orders for the queue ---
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const { orders: fetched } = await orderApi.list({ limit: 100 });
      setOrders(fetched || []);
    } catch (_e) {
      // ignore - queue will be empty
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // --- Transition order status ---
  const transitionOrder = async (orderId, status) => {
    setTransitioning((prev) => ({ ...prev, [orderId]: true }));
    try {
      await orderApi.transition(orderId, status);
      await fetchOrders();
    } catch (err) {
      setError(err.message || t('error'));
    } finally {
      setTransitioning((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const isPending = (s) => s === 'PENDING';
  const isPreparing = (s) => s === 'PREPARING';
  const isReady = (s) => s === 'READY';

  // --- Cart computations ---
  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter((p) => p.category === activeCategory && p.available);

  const cartTotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // --- Sales summary from orders ---
  // Show all orders for the business (not just today) so no order is missed
  const allOrders = orders;
  const totalSales = allOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const pendingCount = allOrders.filter((o) => o.status === 'PENDING').length;
  const readyCount = allOrders.filter((o) => o.status === 'READY').length;
  const collectedCount = allOrders.filter((o) => o.status === 'COLLECTED').length;

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...product, quantity: 1, unitPrice: product.price }];
    });
  }, []);

  const adjustQty = (id, delta) => {
    setCart((prev) => {
      const next = prev.map((i) => {
        if (i.id === id) return { ...i, quantity: Math.max(0, i.quantity + delta) };
        return i;
      });
      return next.filter((i) => i.quantity > 0);
    });
  };

  const updateItemNotes = (id, notes) => {
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, notes } : i)));
  };

  const removeItem = (id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const clearCart = () => setCart([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      setError('Add at least one item before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        table_number: tableNumber || null,
        notes: orderNotes || null,
        items: cart.map((item) => ({
          product_id: item.id,
          product_name: item.name.en || item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          notes: item.notes || null,
        })),
      };
      const result = await orderApi.create(payload);
      const trackingUrl = result.trackingUrl;

      // Generate QR code image URL (no canvas needed)
      const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(trackingUrl)}`;

      setQrData({
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        qrToken: result.qrToken,
        trackingUrl: result.trackingUrl,
        totalAmount: result.totalAmount,
        customerName: customerName || 'Walk-in Customer',
        customerPhone: customerPhone || '',
        tableNumber: tableNumber || '',
        // Save cart items before clearing for print receipt
        items: cart.map((item) => ({
          name: localized(item.name, locale),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
        })),
      });
      setQrCodeDataUrl(qrDataUrl);
      setQrModal(true);
      clearCart();
      setCustomerName('');
      setCustomerPhone('');
      setTableNumber('');
      setOrderNotes('');
      await fetchOrders();
    } catch (err) {
      if (err.status === 401) {
        removeToken();
        router.push('/login');
        return;
      }
      setError(err.message || t('error'));
    } finally {
      setSubmitting(false);
    }
  };

  const STATUS_LABELS = {
    PENDING: t('statusPending') || 'Pending',
    PREPARING: t('statusPreparing') || 'Preparing',
    READY: t('statusReady') || 'Ready',
    COLLECTED: t('statusCollected') || 'Collected',
    CANCELLED: t('statusCancelled') || 'Cancelled',
  };

  const printOrder = () => {
    const printItems = qrData?.items || [];
    const printWindow = window.open('', '_blank');
    const itemsHtml = printItems
      .map(
        (item) => `
      <tr>
        <td>${item.name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td>${formatCurrency(item.unitPrice, locale)}</td>
        <td>${formatCurrency(item.totalPrice, locale)}</td>
      </tr>
    `,
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Order Receipt - ${qrData.orderNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .qr-code { margin: 10px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .total { font-size: 18px; font-weight: bold; text-align: right; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <h1>QR Order Pager</h1>
            <p>Order #${qrData.orderNumber}</p>
            <p>Customer: ${qrData.customerName}</p>
            <p>Table: ${qrData.tableNumber || '—'}</p>
            <p>Phone: ${qrData.customerPhone || '—'}</p>
          </div>

          <div class="qr-code">
            <img src="${qrCodeDataUrl}" alt="QR Code" width="200" height="200" />
            <p><strong>Customer scans this QR to track order status</strong></p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="total">
            Total: ${formatCurrency(qrData.totalAmount, locale)}
          </div>

          <div class="footer">
            Thank you for your order! Scan the QR code above to track your order status.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6" dir={dir}>
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('pos')}</h1>
          <p className="text-gray-600 text-sm">{t('welcome')}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${cartCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {cartCount} {t('items')}
          </span>
          <button onClick={router.push ? () => router.push('/') : undefined} className="btn btn-ghost text-sm">{t('back')}</button>
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

      {/* Order Queue Section */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{t('orders') || 'Order Queue'}</h2>
          {ordersLoading && (
            <span className="text-xs text-brand-600 animate-pulse">Updating…</span>
          )}
        </div>

        {allOrders.length === 0 ? (
          <div className="card p-12 text-center text-gray-500 border border-dashed border-gray-200">
            <div className="text-4xl mb-2">📋</div>
            <p>No orders yet. Start by adding items to the cart below.</p>
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
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allOrders.map((order) => {
                  const isTransitioning = transitioning[order.id];
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
                        <div className="flex gap-2">
                          {isPending(order.status) && !isTransitioning && (
                            <button
                              onClick={() => transitionOrder(order.id, 'PREPARING')}
                              disabled={isTransitioning}
                              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {t('startPreparing') || 'Mark Preparing'}
                            </button>
                          )}
                          {isPreparing(order.status) && !isTransitioning && (
                            <button
                              onClick={() => transitionOrder(order.id, 'READY')}
                              disabled={isTransitioning}
                              className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50 transition-colors"
                            >
                              {t('markReady') || 'Mark Ready'}
                            </button>
                          )}
                          {isReady(order.status) && !isTransitioning && (
                            <button
                              onClick={() => transitionOrder(order.id, 'COLLECTED')}
                              disabled={isTransitioning}
                              className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              {t('markCollected') || 'Mark Collected'}
                            </button>
                          )}
                          {isTransitioning && (
                            <span className="px-3 py-1.5 text-xs text-gray-400 animate-pulse">…</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* POS Order Taking Section */}
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-6">
        {/* Left: Menu Grid (8 cols) */}
        <div className="md:col-span-8 space-y-4">
          {/* Category chips */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeCategory === cat.id ? 'bg-brand-600 text-white shadow-sm' : cat.color
                }`}
              >
                {localized(cat.label, locale)}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full py-10 text-center text-gray-500">{t('noOrders')}</div>
            ) : (
              filteredProducts.map((product) => {
                const name = localized(product.name, locale);
                const inCart = cart.find((i) => i.id === product.id);
                const qty = inCart ? inCart.quantity : 0;
                return (
                  <div
                    key={product.id}
                    className={`card relative group ${!product.available ? 'opacity-50 grayscale' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 truncate">{name}</h3>
                      <span className="text-sm font-bold text-brand-600">{formatCurrency(product.price, locale)}</span>
                    </div>
                    {!product.available && (
                      <span className="absolute top-2 left-2 z-10 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded">
                        {t('statusCancelled') || 'Unavailable'}
                      </span>
                    )}
                    <div className="mt-4 pt-2 border-t border-gray-100">
                      {qty > 0 ? (
                        <div className="flex items-center justify-between gap-2">
                          <button onClick={() => adjustQty(product.id, -1)} className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 text-sm font-bold flex items-center justify-center">−</button>
                          <span className="w-8 text-center text-sm font-medium">{qty}</span>
                          <button onClick={() => addToCart(product)} className="w-8 h-8 rounded-lg bg-brand-600 text-white text-sm font-bold flex items-center justify-center hover:bg-brand-700 transition-colors">+</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(product)}
                          disabled={!product.available}
                          className="w-full py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                        >
                          {t('addItem')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Cart (4 cols) */}
        <div className="md:col-span-4 space-y-4">
          <div className="card sticky top-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('cart') || 'Cart'}</h2>

            {cart.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-2">🛒</div>
                <p>{t('noOrders')}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                {cart.map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                    {/* Top row: item name, qty, price breakdown */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-gray-900 truncate">
                            {localized(item.name, locale)}
                          </h4>
                          <span className="text-xs text-gray-500">{item.quantity}x</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-700">{formatCurrency(item.unitPrice, locale)}</span>
                          <span className="text-xs text-gray-400">×</span>
                          <span className="text-xs text-gray-400">{item.quantity}</span>
                          <span className="text-xs text-gray-400">=</span>
                          <span className="font-medium text-gray-900">
                            {formatCurrency(item.quantity * item.unitPrice, locale)}
                          </span>
                        </div>
                        {item.notes && (
                          <p className="text-xs text-gray-500 mt-1 italic">Note: {item.notes}</p>
                        )}
                      </div>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => adjustQty(item.id, -1)}
                          className="w-8 h-8 rounded-lg bg-white border border-gray-300 text-gray-700 text-xs font-bold flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-gray-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => adjustQty(item.id, 1)}
                          className="w-8 h-8 rounded-lg bg-white border border-gray-300 text-gray-700 text-xs font-bold flex items-center justify-center hover:bg-gray-100 transition-colors"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center text-xs"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* Notes input */}
                    <div className="flex items-center gap-2">
                      <label className="label text-xs">{t('notes')}</label>
                      <input
                        type="text"
                        className="flex-1 input text-xs"
                        value={item.notes || ''}
                        onChange={(e) => updateItemNotes(item.id, e.target.value)}
                        placeholder={t('notes')}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(cartTotal, locale)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-gray-900">
                <span>{t('total')}</span>
                <span>{formatCurrency(cartTotal, locale)}</span>
              </div>
            </div>

            {/* Order details */}
            <div className="mt-6 space-y-3">
              <label className="label">{t('customer')}</label>
              <input
                className="input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name (optional)"
              />
              <input
                className="input mt-3"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone (optional)"
              />
              <input
                className="input mt-3"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder={t('table')}
              />
              <textarea
                className="input mt-3"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Order notes (optional)"
                rows={2}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || cart.length === 0}
              className="btn btn-success w-full py-3 mt-6 disabled:opacity-50"
            >
              {submitting ? 'Processing...' : t('submitOrder')}
            </button>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QR Token Modal */}
      {qrModal && qrData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setQrModal(false)}>
          <div className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-sm shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setQrModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3 text-green-600 font-bold text-2xl">
                ✓
              </div>
              <h3 className="text-xl font-bold text-gray-900">{t('orderCreated')}</h3>
              <p className="text-gray-600 text-sm mt-1">Order #{qrData.orderNumber}</p>
              <p className="text-gray-600 text-sm mt-0.5">{t('customer')}: {qrData.customerName}</p>
            </div>

            {/* Order Items List */}
            {qrData.items && qrData.items.length > 0 && (
              <div className="space-y-2 mb-6">
                <label className="label">{t('items')}</label>
                <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
                  {qrData.items.map((item) => (
                    <div key={item.name} className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{item.quantity}x</span>
                        <span className="text-sm text-gray-900 truncate">{item.name}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(item.totalPrice, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4 mb-6">
              {qrCodeDataUrl ? (
                <div className="flex flex-col items-center">
                  <img
                    src={qrCodeDataUrl}
                    alt="QR Code"
                    className="w-40 h-40 rounded-lg bg-white p-2 border border-gray-200 shadow-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2">{t('scanQrToTrack') || 'Scan to track your order'}</p>
                </div>
              ) : (
                <div>
                  <label className="label">{t('qrToken')}</label>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 truncate">
                      {qrData.qrToken}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{t('scanToTrack')}</p>
                </div>
              )}
              <div>
                <label className="label">{t('total')}</label>
                <span className="text-lg font-bold">{formatCurrency(qrData.totalAmount, locale)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={printOrder}
                className="btn btn-ghost flex-1 text-sm"
              >
                🖨️ {t('printOrder') || 'Print Order'}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(qrData.trackingUrl).catch(() => {});
                  setQrModal(false);
                }}
                className="btn btn-ghost flex-1 text-sm"
              >
                {qrCodeDataUrl ? t('copyUrl') || 'Copy Tracking URL' : t('copyToken') || 'Copy Token'}
              </button>
              <button
                onClick={() => setQrModal(false)}
                className="btn btn-primary flex-1 text-sm"
              >
                New Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
