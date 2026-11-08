/**
 * Order Controller
 * - Create orders with secure 256-bit QR tracking token, daily order numbers, item snapshots.
 * - Strict server-side status state machine validation.
 * - Broadcasts via Socket.io to tenant-scoped business rooms.
 * - Triggers Web Push notification jobs when an order reaches READY.
 */
import asyncHandler from 'express-async-handler';
import { query, getClient } from '../config/db.js';
import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { enqueueReadyNotification, processNotificationJobs } from '../services/webPushService.js';

// ------------------------------------------------------------------
// Status state machine
// ------------------------------------------------------------------
export const ORDER_STATUSES = ['PENDING', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED'];

export const ALLOWED_TRANSITIONS = {
  PENDING: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COLLECTED', 'CANCELLED'],
  COLLECTED: [],
  CANCELLED: [],
};

// transitionKey => roles allowed to perform it
export const TRANSITION_ROLES = {
  'PENDING->PREPARING': ['kitchen', 'cashier', 'manager', 'owner'],
  'PENDING->READY': ['cashier', 'manager', 'owner'],
  'PENDING->CANCELLED': ['cashier', 'manager', 'owner'],
  'PREPARING->READY': ['kitchen', 'manager', 'owner'],
  'PREPARING->CANCELLED': ['manager', 'owner'],
  'READY->COLLECTED': ['kitchen', 'cashier', 'manager', 'owner'],
  'READY->CANCELLED': ['manager', 'owner'],
};

/**
 * Generate a cryptographically secure random 256-bit token (64 hex chars).
 */
function generateSecureToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Build a daily order-number prefix ORD-YYYYMMDD.
 */
function dailyPrefix(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `ORD-${y}${m}${d}`;
}

/**
 * SHA-256 hash of a plaintext token (never store plaintext tokens).
 */
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// ------------------------------------------------------------------
// Create order
// ------------------------------------------------------------------
export const createOrder = asyncHandler(async (req, res) => {
  const { business_id, role } = req.user;
  const {
    items,
    customer_name,
    customer_phone,
    table_number,
    notes,
    idempotency_key,
  } = req.body;

  if (!business_id) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Missing business context',
      code: 'MISSING_BUSINESS_CONTEXT',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'At least one order item is required',
      code: 'ITEMS_REQUIRED',
    });
  }

  // Validate each item
  for (const item of items) {
    if (!item.product_name || String(item.product_name).trim() === '') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Each item must have a product_name',
        code: 'INVALID_ITEM',
      });
    }
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 1) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Item quantity must be a positive integer',
        code: 'INVALID_QUANTITY',
      });
    }
    if (!Number.isFinite(Number(item.unit_price)) || Number(item.unit_price) < 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Item unit_price must be >= 0',
        code: 'INVALID_UNIT_PRICE',
      });
    }
  }

  // Idempotency check (client-supplied key prevents duplicates on retry)
  if (idempotency_key) {
    const existing = await query(
      'SELECT id, order_number, status FROM orders WHERE business_id = ? AND idempotency_key = ?',
      [business_id, idempotency_key],
    );
    if (existing.length > 0) {
      return res.status(200).json({
        orderId: existing[0].id,
        orderNumber: existing[0].order_number,
        status: existing[0].status,
        message: 'Order already exists (idempotent replay)',
        code: 'IDEMPOTENT_REPLAY',
      });
    }
  }

  const client = await getClient();
  try {
    await client.beginTransaction();

    const orderId = uuidv4();
    const now = new Date();
    const prefix = dailyPrefix(now);

    // Compute next daily sequence for this business
    const [seqRows] = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(order_number, '-', -1) AS UNSIGNED)), 0) + 1 AS next_seq
       FROM orders
       WHERE business_id = ? AND order_number LIKE ?`,
      [business_id, `${prefix}-%`],
    );
    const nextSeq = Number(seqRows[0]?.next_seq || 1);
    const orderNumber = `${prefix}-${String(nextSeq).padStart(4, '0')}`;

    // Generate secure 256-bit QR tracking token; store only the hash
    const qrToken = generateSecureToken();
    const qrTokenHash = hashToken(qrToken);

    // Calculate total from snapshots
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += Number(item.quantity) * Number(item.unit_price);
    }

    await client.query(
      `INSERT INTO orders
       (id, business_id, order_number, customer_name, customer_phone, table_number, notes,
        status, sync_status, total_amount, idempotency_key, qr_token_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'synced', ?, ?, ?)`,
      [
        orderId,
        business_id,
        orderNumber,
        customer_name || null,
        customer_phone || null,
        table_number || null,
        notes || null,
        totalAmount,
        idempotency_key || null,
        qrTokenHash,
      ],
    );

    // Insert order items with historical name/price snapshots
    for (const item of items) {
      const itemId = uuidv4();
      const totalPrice = Number(item.quantity) * Number(item.unit_price);
      let validProductId = null;
      if (item.product_id) {
        const [prod] = await client.query('SELECT id FROM products WHERE id = ? LIMIT 1', [item.product_id]);
        if (prod && prod.length > 0) validProductId = item.product_id;
      }
      await client.query(
        `INSERT INTO order_items
         (id, order_id, product_id, product_name_snapshot, quantity,
          unit_price_snapshot, total_price_snapshot, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          orderId,
          validProductId,
          String(item.product_name),
          Number(item.quantity),
          Number(item.unit_price),
          totalPrice,
          item.notes || null,
        ],
      );
    }

    // Insert tracking token (expires in 7 days)
    const trackingId = uuidv4();
    await client.query(
      `INSERT INTO order_tracking_tokens
       (id, order_id, token_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [trackingId, orderId, qrTokenHash],
    );

    await client.commit();

    // Broadcast order:created to tenant-scoped business room
    const io = req.app.get('io');
    if (io) {
      io.to(`business:${business_id}`).emit('order:created', {
        orderId,
        orderNumber,
        status: 'PENDING',
        business_id,
        createdAt: now.toISOString(),
      });
    }

    // Return plaintext token ONCE to cashier for QR display
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.status(201).json({
      orderId,
      orderNumber,
      status: 'PENDING',
      qrToken, // plaintext, shown to cashier only at creation time
      trackingUrl: `${frontendUrl}/track/${qrToken}`,
      totalAmount,
      message: 'Order created successfully',
    });
  } catch (error) {
    await client.rollback().catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------
// Get order by tracking token (public, used by customer tracker)
// ------------------------------------------------------------------
export const getOrderByToken = asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!token || token.length !== 64) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Invalid tracking token format',
      code: 'INVALID_TOKEN',
    });
  }

  const tokenHash = hashToken(token);

  const [rows] = await query(
    `SELECT o.id, o.order_number, o.status, o.customer_name, o.table_number,
            o.notes, o.created_at, o.updated_at, o.total_amount,
            b.name AS business_name, b.slug AS business_slug
     FROM order_tracking_tokens t
     JOIN orders o ON o.id = t.order_id
     JOIN businesses b ON b.id = o.business_id
     WHERE t.token_hash = ? AND t.expires_at > NOW() AND t.is_revoked = 0
     LIMIT 1`,
    [tokenHash],
  );

  if (rows.length === 0) {
    return res.status(404).json({
      error: 'Not found',
      message: 'Order not found or token expired/revoked',
      code: 'ORDER_NOT_FOUND',
    });
  }

  const order = rows[0];

  const [items] = await query(
    `SELECT product_name_snapshot AS name, quantity, unit_price_snapshot AS unitPrice,
            total_price_snapshot AS totalPrice, notes
     FROM order_items
     WHERE order_id = ?`,
    [order.id],
  );

  return res.json({
    order: {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      customerName: order.customer_name,
      tableNumber: order.table_number,
      notes: order.notes,
      totalAmount: order.total_amount,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      businessName: order.business_name,
      businessSlug: order.business_slug,
    },
    items,
  });
});

// ------------------------------------------------------------------
// Transition order status (strict server-side state machine)
// ------------------------------------------------------------------
export const transitionOrderStatus = asyncHandler(async (req, res) => {
  const { business_id, role, userId } = req.user;
  const { orderId } = req.params;
  const { status } = req.body;

  if (!orderId) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'orderId is required',
      code: 'MISSING_ORDER_ID',
    });
  }

  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({
      error: 'Bad request',
      message: `Invalid status. Allowed: ${ORDER_STATUSES.join(', ')}`,
      code: 'INVALID_STATUS',
    });
  }

  const client = await getClient();
  try {
    await client.beginTransaction();

    // Lock the order row to prevent concurrent transition races
    const [rows] = await client.query(
      `SELECT id, order_number, business_id, status FROM orders WHERE id = ? FOR UPDATE`,
      [orderId],
    );
    const order = rows[0];
    if (!order) {
      await client.rollback();
      return res.status(404).json({
        error: 'Not found',
        message: 'Order not found',
        code: 'ORDER_NOT_FOUND',
      });
    }

    // Strict tenant isolation: block cross-tenant access
    if (role !== 'super_admin' && String(order.business_id) !== String(business_id)) {
      await client.rollback();
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cross-tenant order access is blocked',
        code: 'CROSS_TENANT_ACCESS',
      });
    }

    const currentStatus = order.status;
    if (currentStatus === status) {
      await client.rollback();
      return res.status(400).json({
        error: 'Bad request',
        message: `Order is already in ${status} status`,
        code: 'ALREADY_IN_STATUS',
      });
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(status)) {
      await client.rollback();
      return res.status(409).json({
        error: 'Conflict',
        message: `Illegal transition from ${currentStatus} to ${status}`,
        code: 'ILLEGAL_TRANSITION',
      });
    }

    const transitionKey = `${currentStatus}->${status}`;
    const allowedRoles = TRANSITION_ROLES[transitionKey];
    if (!allowedRoles || !allowedRoles.includes(role)) {
      await client.rollback();
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${role}' cannot perform transition ${transitionKey}`,
        code: 'INSUFFICIENT_ROLE_FOR_TRANSITION',
      });
    }

    await client.query(
      `UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?`,
      [status, orderId],
    );

    // Audit trail
    await client.query(
      `INSERT INTO order_status_audit
       (id, order_id, from_status, to_status, changed_by, changed_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [uuidv4(), orderId, currentStatus, status, userId || null],
    );

    // If moving to READY, mark notification timestamp
    if (status === 'READY') {
      await client.query(
        `UPDATE orders SET ready_notified_at = NOW() WHERE id = ? AND ready_notified_at IS NULL`,
        [orderId],
      );
    }

    await client.commit();

    // After commit: enqueue and process Web Push notification outbox job
    if (status === 'READY') {
      enqueueReadyNotification({
        orderId,
        business_id,
        payload: {
          title: 'Order is Ready!',
          body: `Order #${order.order_number} is ready for pickup.`,
          orderId,
          status: 'READY',
        },
      })
        .then(() => processNotificationJobs())
        .catch((err) => console.error('[PUSH_PROCESS_ERROR]', err.message));
    }

    // Broadcast to tenant-scoped business room + order-specific room
    const io = req.app.get('io');
    if (io) {
      const tenantRoom = `business:${business_id}`;
      const orderRoom = `order:${orderId}`;
      io.to(tenantRoom).emit('order:status_changed', {
        orderId,
        status,
        previousStatus: currentStatus,
        business_id,
        changedBy: userId,
      });
      io.to(orderRoom).emit('order:status_changed', {
        orderId,
        status,
        previousStatus: currentStatus,
      });
      if (status === 'READY') {
        io.to(tenantRoom).emit('order:ready', { orderId, business_id });
      }
    }

    return res.json({
      orderId,
      status,
      previousStatus: currentStatus,
      message: 'Order status updated',
    });
  } catch (error) {
    await client.rollback().catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------
// List orders for a business (tenant-scoped)
// ------------------------------------------------------------------
export const listOrders = asyncHandler(async (req, res) => {
  const { business_id, role } = req.user;
  const { status, limit = 50, offset = 0 } = req.query;

  const params = [business_id];
  let where = 'WHERE o.business_id = ?';

  if (status) {
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid status filter',
        code: 'INVALID_STATUS_FILTER',
      });
    }
    where += ' AND o.status = ?';
    params.push(status);
  }

  const [orders] = await query(
    `SELECT o.id, o.order_number, o.status, o.customer_name, o.table_number,
            o.total_amount, o.created_at, o.updated_at, o.ready_notified_at
     FROM orders o
     ${where}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)],
  );

  return res.json({ orders, limit: Number(limit), offset: Number(offset) });
});

// ------------------------------------------------------------------
// Get a single order by ID (tenant-scoped)
// ------------------------------------------------------------------
export const getOrder = asyncHandler(async (req, res) => {
  const { business_id, role } = req.user;
  const { orderId } = req.params;

  const [rows] = await query(
    `SELECT o.*, b.name AS business_name
     FROM orders o
     JOIN businesses b ON b.id = o.business_id
     WHERE o.id = ? LIMIT 1`,
    [orderId],
  );
  const order = rows[0];
  if (!order) {
    return res.status(404).json({
      error: 'Not found',
      message: 'Order not found',
      code: 'ORDER_NOT_FOUND',
    });
  }

  if (role !== 'super_admin' && String(order.business_id) !== String(business_id)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Cross-tenant order access is blocked',
      code: 'CROSS_TENANT_ACCESS',
    });
  }

  const [items] = await query(
    `SELECT product_name_snapshot AS name, quantity, unit_price_snapshot AS unitPrice,
            total_price_snapshot AS totalPrice, notes
     FROM order_items WHERE order_id = ?`,
    [orderId],
  );

  return res.json({ order, items });
});

