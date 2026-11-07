/**
 * Web Push routes
 *
 * POST   /subscribe        - Store a push subscription (tenant-scoped)
 * DELETE /subscribe        - Deactivate a push subscription
 * GET    /vapid-public-key - (handled in server.js)
 * POST   /notify/ready     - Trigger READY notification for an order (kitchen/cashier)
 * POST   /process-jobs     - Process pending notification jobs (admin)
 */
import { Router } from 'express';
import { tenantScope } from '../middleware/tenantScope.js';
import { authenticate, authorize, authorizeRoles } from '../middleware/auth.js';
import {
  storeSubscription,
  removeSubscription,
  notifyOrderReady,
  processNotificationJobs,
} from '../services/webPushService.js';

const router = Router();

router.use(tenantScope);
router.use(authenticate);

/**
 * Store a push subscription from the customer tracker PWA.
 * Body: { endpoint, p256h_key, auth_key, user_agent?, order_id? }
 */
router.post(
  '/subscribe',
  authorize('push:write'),
  async (req, res, next) => {
    try {
      const { business_id } = req.user;
      const { endpoint, p256h_key, auth_key, user_agent, order_id } = req.body;
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
 * Deactivate a push subscription.
 * Body: { endpoint }
 */
router.delete(
  '/subscribe',
  authorize('push:write'),
  async (req, res, next) => {
    try {
      const { business_id } = req.user;
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ error: 'endpoint is required' });
      }
      await removeSubscription(business_id, endpoint);
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
  authorize('push:write'),
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
