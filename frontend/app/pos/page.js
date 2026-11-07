/**
 * Cashier POS Interface
 * - High-speed product grid (categories filterable)
 * - Reactive cart with quantity/notes adjustments
 * - Real-time total calculation
 * - Order submission & QR token generator modal
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { t, direction, formatCurrency } from '@/lib/i18n';
import { orders as orderApi } from '@/lib/api';

const CATEGORIES = [
  { id: 'all', label: { en: 'All', ar: 'ال全部', kb: 'هەموو' }, color: 'bg-gray-100 text-gray-700' },
  { id: 'food', label: { en: 'Food', ar: 'طعام', kb: 'نانون' }, color: 'bg-red-100 text-red-700' },
  { id: 'drink', label: { en: 'Drinks', ar: 'مشروبات', kb: 'عەرەبەکان' }, color: 'bg-blue-100 text-blue-700' },
  { id: 'dessert', label: { en: 'Dessert', ar: 'حلويات', kb: 'شیرینی' }, color: 'bg-amber-100 text-amber-700' },
];

const MENU = [
  { id: 'p1', category: 'food', name: { en: 'Grilled Burger', ar: 'برجر مشوي', kb: 'بۆर्गەر کۆتایی' }, price: 8.50, available: true },
  { id: 'p2', category: 'food', name: { en: 'Margherita Pizza', ar: 'بيتزا مارgherita', kb: 'پیتزای مارgherita' }, price: 12.00, available: true },
  { id: 'p3', category: 'food', name: { en: 'Caesar Salad', ar: 'سلطة سيزر', kb: 'سالاتی سێزەر' }, price: 6.50, available: true },
  { id: 'p4', category: 'drink', name: { en: 'Cola', ar: 'كوكاكولا', kb: 'کۆلا' }, price: 2.00, available: true },
  { id: 'p5', category: 'drink', name: { en: 'Fresh Orange Juice', ar: 'عصير برتقال طازج', kb: 'ئۆرێنج تازە' }, price: 4.00, available: true },
  { id: 'p6', category: 'drink', name: { en: 'Bottled Water', ar: 'ماء معبأ', kb: 'ئاو پڕکراو' }, price: 1.50, available: true },
  { id: 'p7', category: 'dessert', name: { en: 'Cheesecake', ar: 'كعكة الجبن', kb: 'چیزکیک' }, price: 5.50, available: true },
  { id: 'p8', category: 'dessert', name: { en: 'Ice Cream', ar: 'آيس كريم', kb: 'ئایسکریم' }, price: 3.00, available: true },
];

function localized(obj, locale) {
  return obj && obj[locale] ? obj[locale] : (obj.en || obj);
}

export default function PosPage() {
  const router = useRouter();
  const locale = typeof window !== 'undefined' ? localStorage.getItem('qr_locale') || 'en' : 'en';
  const dir = direction(locale);

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
  const [error, setError] = useState(null);

  // Load products from API on mount (fallback to static MENU)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // POS doesn't require backend products to function; static MENU is the fallback.
        // In production, fetch from /api/v1/products here.
      } catch (_e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter((p) => p.category === activeCategory && p.available);

  const cartTotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...product, quantity: 1 }];
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
      setQrData({
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        qrToken: result.qrToken,
        trackingUrl: result.trackingUrl,
        totalAmount: result.totalAmount,
      });
      setQrModal(true);
      clearCart();
      setCustomerName('');
      setCustomerPhone('');
      setTableNumber('');
      setOrderNotes('');
    } catch (err) {
      setError(err.message || t('error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
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
                  <div key={item.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{localized(item.name, locale)}</h4>
                        <span className="text-xs text-gray-500">{item.quantity}x</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-gray-700">{formatCurrency(item.unitPrice, locale)}</span>
                        <span className="text-xs text-gray-400">=</span>
                        <span className="text-sm font-medium text-gray-900">{formatCurrency(item.quantity * item.unitPrice, locale)}</span>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-gray-500 mt-1 italic">Note: {item.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => adjustQty(item.id, -1)} className="w-7 h-7 rounded-lg bg-white border border-gray-300 text-gray-700 text-xs font-bold flex items-center justify-center hover:bg-gray-100 transition-colors">−</button>
                      <button onClick={() => adjustQty(item.id, 1)} className="w-7 h-7 rounded-lg bg-white border border-gray-300 text-gray-700 text-xs font-bold flex items-center justify-center hover:bg-gray-100 transition-colors">+</button>
                      <button onClick={() => removeItem(item.id)} className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center text-xs">×</button>
                    </div>
                    <div className="ml-3">
                      <label className="label text-xs">{t('notes')}</label>
                      <input
                        type="text"
                        className="input text-xs"
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
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="label">{t('qrToken')}</label>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 truncate">
                    {qrData.qrToken}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{t('scanToTrack')}</p>
              </div>
              <div>
                <label className="label">{t('total')}</label>
                <span className="text-lg font-bold">{formatCurrency(qrData.totalAmount, locale)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(qrData.qrToken).catch(() => {});
                  setQrModal(false);
                }}
                className="btn btn-ghost flex-1 text-sm"
              >
                Copy Token
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
