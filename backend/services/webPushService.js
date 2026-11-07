/**
 * Web Push Notification Service
 *
 * - storeSubscription(business_id, subscription, order_id): persist a push subscription
 * - sendNotification(subscription, payload): send a push via web-push library
 * - enqueueReadyNotification(orderId, business_id, payload): insert notification_job
 * - processNotificationJobs(): process pending jobs (called by order controller / worker)
 *
 * Requires VAPID keys configured (see config/vapid.js).
 */
import { query, getClient } from '../config/db.js';
import { webpush } from '../config/vapid.js';
import { randomUUID } from 'crypto';

/**
 * Persist a push subscription (tenant-scoped).
 */
export async function storeSubscription({ business_id, order_id, endpoint, p256h_key, auth_key, user_agent }) {
  if (!business_id || !endpoint || !p256h_key || !auth_key) {
    throw new Error('Missing required push subscription fields');
  }

  const id = randomUUID();
  await query(
    `INSERT INTO push_subscriptions
     (id, business_id, order_id, endpoint, p256h_key, auth_key, user_agent, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       order_id = VALUES(order_id),
       p256h_key = VALUES(p256h_key),
       auth_key = VALUES(auth_key),
       user_agent = VALUES(user_agent),
       is_active = 1,
       updated_at = NOW()`,
    [id, business_id, order_id || null, endpoint, p256h_key, auth_key, user_agent || null],
  );

  return { id, business_id };
}

/**
 * Remove/deactivate a subscription (tenant-scoped).
 */
export async function removeSubscription(business_id, endpoint) {
  await query(
    `UPDATE push_subscriptions SET is_active = 0, updated_at = NOW()
     WHERE business_id = ? AND endpoint = ?`,
    [business_id, endpoint],
  );
}

/**
 * Send a push notification to a single subscription.
 * Returns { success: true } or throws on permanent failure (410/404 => remove sub).
 */
export async function sendNotification(subscription, payload) {
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256h: subscription.p256h_key, auth: subscription.auth_key },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    const statusCode = err.statusCode || err.status;
    // 410 Gone or 404 => subscription is no longer valid, mark inactive
    if (statusCode === 410 || statusCode === 404) {
      try {
        await query(
          `UPDATE push_subscriptions SET is_active = 0, updated_at = NOW() WHERE endpoint = ?`,
          [subscription.endpoint],
        );
      } catch (_dbErr) {
        // ignore DB cleanup errors
      }
      return { success: false, reason: 'subscription_expired', statusCode };
    }
    throw err;
  }
}

/**
 * Enqueue a notification job when an order reaches READY.
 */
export async function enqueueReadyNotification({ orderId, business_id, payload }) {
  const id = randomUUID();
  await query(
    `INSERT INTO notification_jobs
     (id, order_id, business_id, payload, status, attempts, max_attempts, scheduled_at)
     VALUES (?, ?, ?, ?, 'pending', 0, 5, NOW())`,
    [id, orderId, business_id, JSON.stringify(payload)],
  );
  return { id };
}

/**
 * Fetch active push subscriptions for a business, optionally linked to an order.
 */
export async function getActiveSubscriptions(business_id, order_id = null) {
  if (order_id) {
    return query(
      `SELECT id, endpoint, p256h_key, auth_key FROM push_subscriptions
       WHERE business_id = ? AND is_active = 1 AND order_id = ?`,
      [business_id, order_id],
    );
  }
  return query(
    `SELECT id, endpoint, p256h_key, auth_key FROM push_subscriptions
     WHERE business_id = ? AND is_active = 1`,
    [business_id],
  );
}

/**
 * Process pending notification jobs (outbox pattern).
 * Attempts delivery; marks sent/failed/deadletter.
 * Returns summary of processed jobs.
 */
export async function processNotificationJobs() {
  const [jobs] = await query(
    `SELECT id, order_id, business_id, payload, attempts, max_attempts
     FROM notification_jobs
     WHERE status = 'pending' AND attempts < max_attempts
     ORDER BY scheduled_at ASC
     LIMIT 100`,
  );

  const summary = { processed: 0, sent: 0, failed: 0, deadletter: 0 };

  for (const job of jobs) {
    let payload;
    try {
      payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    } catch (_e) {
      payload = {};
    }

    // Get subscriptions tied to this order, fallback to business-level active subs
    let subscriptions = await getActiveSubscriptions(job.business_id, job.order_id);
    if (!subscriptions || subscriptions.length === 0) {
      subscriptions = await getActiveSubscriptions(job.business_id);
    }

    let sentAny = false;
    let lastError = null;

    for (const sub of subscriptions) {
      try {
        await sendNotification(sub, {
          type: 'ORDER_READY',
          orderId: job.order_id,
          ...payload,
        });
        sentAny = true;
      } catch (err) {
        lastError = err.message;
      }
    }

    if (sentAny) {
      await query(
        `UPDATE notification_jobs SET status = 'sent', processed_at = NOW()
         WHERE id = ?`,
        [job.id],
      );
      summary.sent += 1;
    } else {
      const newAttempts = Number(job.attempts) + 1;
      if (newAttempts >= Number(job.max_attempts)) {
        await query(
          `UPDATE notification_jobs SET status = 'deadletter', attempts = ?, last_error = ?, processed_at = NOW()
           WHERE id = ?`,
          [newAttempts, lastError || 'delivery_failed', job.id],
        );
        summary.deadletter += 1;
      } else {
        await query(
          `UPDATE notification_jobs SET status = 'pending', attempts = ?, last_error = ?
           WHERE id = ?`,
          [newAttempts, lastError || 'delivery_failed', job.id],
        );
        summary.failed += 1;
      }
    }
    summary.processed += 1;
  }

  return summary;
}

/**
 * Send READY push notification to all active subscriptions for an order's business.
 * Called from order controller when status transitions to READY.
 */
export async function notifyOrderReady({ orderId, business_id, orderNumber, customerName }) {
  const payload = {
    type: 'ORDER_READY',
    orderId,
    orderNumber,
    customerName: customerName || 'Customer',
    message: `Your order #${orderNumber} is ready for collection!`,
    timestamp: new Date().toISOString(),
    url: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/track/${orderId}` : null,
  };

  await enqueueReadyNotification({ orderId, business_id, payload });

  // Attempt immediate delivery to any active subscriptions
  const subscriptions = await getActiveSubscriptions(business_id, orderId);
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await sendNotification(sub, payload);
      sent += 1;
    } catch (_err) {
      // job will be retried via processNotificationJobs
    }
  }

  return { enqueued: true, immediateSent: sent };
}

export default {
  storeSubscription,
  removeSubscription,
  sendNotification,
  enqueueReadyNotification,
  getActiveSubscriptions,
  processNotificationJobs,
  notifyOrderReady,
};
