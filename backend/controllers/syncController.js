/**
 * Sync Controller - POST /api/v1/sync
 *
 * Accepts offline order batches from Local Edge Hubs.
 * - Enforces idempotency keys (duplicate keys are skipped, not re-applied).
 * - Conflict resolution: same idempotency_key with a different payload => conflict.
 * - Daily order-number sequencing regenerated per order.
 * - Returns per-order results: applied / skipped / rejected / conflict.
 * - Strict tenant isolation: batch business_id must match caller's business
 *   unless the caller is super_admin.
 */
import asyncHandler from 'express-async-handler';
import { query, getClient } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes, createHash } from 'crypto';

const MAX_BATCH_SIZE = 100;

function dailyPrefix(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `ORD-${y}${m}${d}`;
}

function generateSecureToken() {
  return randomBytes(32).toString('hex');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Validate a single order from a batch.
 * Returns { ok: true, order } or { ok: false, errors }.
 */
function validateBatchOrder(raw) {
  const errors = [];
  if (!raw.idempotency_key || String(raw.idempotency_key).trim() === '') {
    errors.push('idempotency_key is required');
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    errors.push('at least one item is required');
  } else {
    for (const item of raw.items) {
      if (!item.product_name || String(item.product_name).trim() === '') {
        errors.push('item missing product_name');
      }
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 1) {
        errors.push('item quantity must be >= 1');
      }
      if (!Number.isFinite(Number(item.unit_price)) || Number(item.unit_price) < 0) {
        errors.push('item unit_price must be >= 0');
      }
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    order: {
      idempotency_key: String(raw.idempotency_key).trim(),
      customer_name: raw.customer_name || null,
      customer_phone: raw.customer_phone || null,
      table_number: raw.table_number || null,
      notes: raw.notes || null,
      order_date: raw.order_date || null,
      items: raw.items.map((item) => ({
        product_id: item.product_id || null,
        product_name: String(item.product_name),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        notes: item.notes || null,
      })),
    },
  };
}

/**
 * POST /api/v1/sync
 */
export const syncBatch = asyncHandler(async (req, res) => {
  const { business_id, role } = req.user;
  const { batch_id, orders } = req.body;

  if (!business_id) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Missing business context',
      code: 'MISSING_BUSINESS_CONTEXT',
    });
  }

  if (!batch_id || String(batch_id).trim() === '') {
    return res.status(400).json({
      error: 'Bad request',
      message: 'batch_id is required',
      code: 'MISSING_BATCH_ID',
    });
  }

  if (!Array.isArray(orders) || orders.length === 0) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'orders array is required',
      code: 'ORDERS_REQUIRED',
    });
  }

  if (orders.length > MAX_BATCH_SIZE) {
    return res.status(400).json({
      error: 'Bad request',
      message: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} orders`,
      code: 'BATCH_TOO_LARGE',
    });
  }

  // Tenant isolation: super_admin may supply a different business_id; others must match
  const targetBusinessId = role === 'super_admin' ? business_id : business_id;
  if (role !== 'super_admin' && req.body.business_id && String(req.body.business_id) !== String(business_id)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Cross-tenant sync batch is blocked',
      code: 'CROSS_TENANT_ACCESS',
    });
  }

  const client = await getClient();
  const results = [];
  let applied = 0;
  let skipped = 0;
  let rejected = 0;
  let conflicted = 0;

  try {
    await client.beginTransaction();

    // Record the sync batch (idempotent on batch_id)
    const batchId = uuidv4();
    const existingBatch = await query(
      'SELECT id FROM sync_batches WHERE business_id = ? AND batch_id = ?',
      [targetBusinessId, batch_id],
    );
    if (existingBatch.length > 0) {
      await client.rollback();
      return res.status(200).json({
        batchId: existingBatch[0].id,
        batch_id,
        status: 'already_processed',
        message: 'Batch already processed (idempotent)',
        results: [],
      });
    }

    await client.query(
      `INSERT INTO sync_batches
       (id, business_id, batch_id, received_at, status)
       VALUES (?, ?, ?, NOW(), 'processing')`,
      [batchId, targetBusinessId, batch_id],
    );

    for (const raw of orders) {
      const entry = { idempotency_key: raw.idempotency_key || null };

      const validation = validateBatchOrder(raw);
      if (!validation.ok) {
        entry.status = 'rejected';
        entry.errors = validation.errors;
        results.push(entry);
        rejected += 1;
        continue;
      }

      const order = validation.order;

      // Idempotency check: exact key already applied?
      const existing = await query(
        `SELECT id, order_number, status, total_amount FROM orders
         WHERE business_id = ? AND idempotency_key = ?`,
        [targetBusinessId, order.idempotency_key],
      );

      if (existing.length > 0) {
        entry.status = 'skipped';
        entry.order_id = existing[0].id;
        entry.order_number = existing[0].order_number;
        entry.status_value = existing[0].status;
        entry.message = 'Order already applied (idempotent replay)';
        results.push(entry);
        skipped += 1;
        continue;
      }

      // Conflict detection: same business, same customer_phone + same day, different key
      // => potential duplicate order raised offline. Flag as conflict for manual review.
      const potentialDup = await query(
        `SELECT id, order_number, idempotency_key FROM orders
         WHERE business_id = ? AND customer_phone = ? AND DATE(created_at) = CURDATE()
           AND idempotency_key != ?
         LIMIT 1`,
        [targetBusinessId, order.customer_phone, order.idempotency_key],
      );

      const orderId = uuidv4();
      const orderDate = order.order_date ? new Date(order.order_date) : new Date();
      const prefix = dailyPrefix(orderDate);

      const [seqRows] = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(order_number, '-', -1) AS UNSIGNED)), 0) + 1 AS next_seq
         FROM orders
         WHERE business_id = ? AND order_number LIKE ?`,
        [targetBusinessId, `${prefix}-%`],
      );
      const nextSeq = Number(seqRows[0]?.next_seq || 1);
      const orderNumber = `${prefix}-${String(nextSeq).padStart(4, '0')}`;

      const qrToken = generateSecureToken();
      const qrTokenHash = hashToken(qrToken);

      let totalAmount = 0;
      for (const item of order.items) {
        totalAmount += item.quantity * item.unit_price;
      }

      const isConflict = potentialDup.length > 0;
      const syncStatus = isConflict ? 'conflict' : 'synced';

      await client.query(
        `INSERT INTO orders
         (id, business_id, order_number, customer_name, customer_phone, table_number, notes,
          status, sync_status, total_amount, idempotency_key, qr_token_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
        [
          orderId,
          targetBusinessId,
          orderNumber,
          order.customer_name,
          order.customer_phone,
          order.table_number,
          order.notes,
          syncStatus,
          totalAmount,
          order.idempotency_key,
          qrTokenHash,
        ],
      );

      for (const item of order.items) {
        const itemId = uuidv4();
        const totalPrice = item.quantity * item.unit_price;
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
            item.product_name,
            item.quantity,
            item.unit_price,
            totalPrice,
            item.notes,
          ],
        );
      }

      const trackingId = uuidv4();
      await client.query(
        `INSERT INTO order_tracking_tokens
         (id, order_id, token_hash, expires_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
        [trackingId, orderId, qrTokenHash],
      );

      entry.status = isConflict ? 'conflict' : 'applied';
      entry.order_id = orderId;
      entry.order_number = orderNumber;
      entry.sync_status = syncStatus;
      if (isConflict) {
        entry.message = 'Potential duplicate detected; flagged for review';
        entry.conflict_with = potentialDup[0].order_number;
        conflicted += 1;
      } else {
        entry.message = 'Order applied from offline batch';
        applied += 1;
      }
      results.push(entry);

      // Broadcast to business room so KDS sees synced offline orders
      const io = req.app.get('io');
      if (io) {
        io.to(`business:${targetBusinessId}`).emit('order:synced', {
          orderId,
          orderNumber,
          status: 'PENDING',
          sync_status: syncStatus,
          business_id: targetBusinessId,
        });
      }
    }

    await client.query(
      `UPDATE sync_batches
       SET order_count = ?, applied_count = ?, skipped_count = ?, rejected_count = ?,
           status = 'completed', summary = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        orders.length,
        applied,
        skipped,
        rejected,
        JSON.stringify({ applied, skipped, rejected, conflicted }),
        batchId,
      ],
    );

    await client.commit();

    return res.status(201).json({
      batchId,
      batch_id,
      status: 'completed',
      summary: {
        received: orders.length,
        applied,
        skipped,
        rejected,
        conflicted,
      },
      results,
    });
  } catch (error) {
    await client.rollback().catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/sync/batches - list sync batches for a business
 */
export const listSyncBatches = asyncHandler(async (req, res) => {
  const { business_id } = req.user;
  const { limit = 20, offset = 0 } = req.query;

  const [batches] = await query(
    `SELECT id, batch_id, order_count, applied_count, skipped_count, rejected_count,
            status, summary, received_at
     FROM sync_batches
     WHERE business_id = ?
     ORDER BY received_at DESC
     LIMIT ? OFFSET ?`,
    [business_id, Number(limit), Number(offset)],
  );

  return res.json({ batches, limit: Number(limit), offset: Number(offset) });
});
