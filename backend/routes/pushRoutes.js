/**
 * Web Push routes
 *
 * POST   /subscribe        - Store a push subscription (public - from customer tracker)
 * DELETE /subscribe        - Deactivate a push subscription (requires auth)
 * POST   /notify/ready     - Trigger READY notification for an order (requires auth)
 * POST   /process-jobs     - Process pending notification jobs (requires auth)
 */
import { Router } from 'express';
import { query } from '../config/db.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { authenticate, authorize, authorizeRoles } from '../middleware/auth.js';
import {
  storeSubscription,
  removeSubscription,
  notifyOrderReady,
  processNotificationJobs,
} from '../services/webPushService.js';

const router = Router();

/**
 * Public: Customer subscribes to push notifications from the tracking page.
 * No authentication required - the order_id in the body links the subscription
 * to a specific order/business.
 * Body: { endpoint, p256h_key, auth_key, user_agent?, order_id? }
 */
router.post(
  '/subscribe',
  async (req, res, next) => {
    try {
      const { endpoint, p256h_key, auth_key, user_agent, order_id } = req.body;

      if (!endpoint || !p256h_key || !auth_key) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Missing required push subscription fields',
          code: 'MISSING_FIELDS',
        });
      }

      // Look up business_id from the order if order_id is provided
      let business_id = null;
      if (order_id) {
        const [rows] = await query(
          'SELECT business_id FROM orders WHERE id = ? LIMIT 1',
          [order_id],
        );
        if (rows.length > 0) {
          business_id = rows[0].business_id;
        }
      }

      if (!business_id) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Cannot determine business from order',
          code: 'NO_BUSINESS_CONTEXT',
        });
      }

      const result = await storeSubscription({
        business_id,
        order_id: order_id || null,
        endpoint,
        p256h_key,
        auth_key,
        user_agent,
      });
      return res.status(201).json({ success: true, subscriptionId: result.id });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Protected routes (require authentication)
 */
router.use(tenantScope);
router.use(authenticate);

/**
 * Deactivate a subscription.
 * Body: { endpoint }
 */
router.delete(
  '/subscribe',
  async (req, res, next) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ error: 'endpoint is required' });
      }
      await removeSubscription(req.user.business_id, endpoint);
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Trigger READY notification for an order.
 * Body: { orderId, orderNumber, customerName }
 */
router.post(
  '/notify/ready',
  authorizeRoles('kitchen', 'cashier', 'manager', 'owner', 'super_admin'),
  async (req, res, next) => {
    try {
      const { business_id } = req.user;
      const { orderId, orderNumber, customerName } = req.body;
      if (!orderId) {
        return res.status(400).json({ error: 'orderId is required' });
      }
      const result = await notifyOrderReady({
        orderId,
        business_id,
        orderNumber,
        customerName,
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Process pending notification jobs (outbox worker endpoint).
 * Roles: super_admin, owner, manager
 */
router.post(
  '/process-jobs',
  authorizeRoles('super_admin', 'owner', 'manager'),
  async (_req, res, next) => {
    try {
      const summary = await processNotificationJobs();
      return res.json({ success: true, summary });
    } catch (err) {
      next(err);
    }
  },
);

export default router;