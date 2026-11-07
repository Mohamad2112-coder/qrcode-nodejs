/**
 * Sync routes - Edge Hub offline order synchronization
 *
 * POST  /             - Submit offline order batch (tenant-scoped)
 * GET   /batches      - List sync batches for business
 */
import { Router } from 'express';
import { tenantScope } from '../middleware/tenantScope.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { syncBatch, listSyncBatches } from '../controllers/syncController.js';

const router = Router();

router.use(tenantScope);
router.use(authenticate);

/**
 * Submit an offline batch of orders from a Local Edge Hub.
 * Roles: cashier, manager, owner, super_admin
 */
router.post(
  '/',
  authorize('sync:write'),
  syncBatch,
);

/**
 * List sync batches for the caller's business.
 * Roles: cashier, manager, owner, super_admin
 */
router.get(
  '/batches',
  authorize('sync:read'),
  listSyncBatches,
);

export default router;
