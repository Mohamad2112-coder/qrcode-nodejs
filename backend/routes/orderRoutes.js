/**
 * Order routes (tenant-scoped, JWT protected)
 *
 * POST   /                - Create order (cashier)
 * GET    /                - List orders for business
 * GET    /:orderId        - Get single order
 * POST   /:orderId/status - Transition status (kitchen/cashier/manager/owner)
 * GET    /track/:token    - Public order tracker lookup (no auth)
 */
import { Router } from 'express';
import { tenantScope, requireTenant } from '../middleware/tenantScope.js';
import {
  authenticate,
  authorize,
  authorizeRoles,
} from '../middleware/auth.js';
import {
  createOrder,
  getOrderByToken,
  transitionOrderStatus,
  listOrders,
  getOrder,
} from '../controllers/orderController.js';

const router = Router();

// ------------------------------------------------------------------
// Public order tracker (no authentication - used by customer PWA)
// ------------------------------------------------------------------
router.get('/track/:token', getOrderByToken);

// ------------------------------------------------------------------
// Protected order routes (require auth + tenant scope)
// ------------------------------------------------------------------
router.use(tenantScope);
router.use(authenticate);

/**
 * Create a new order.
 * Roles: cashier, manager, owner (super_admin bypasses tenant restriction)
 */
router.post(
  '/',
  authorizeRoles('cashier', 'manager', 'owner', 'super_admin'),
  createOrder,
);

/**
 * List orders for the caller's business.
 * Roles: all authenticated roles
 */
router.get(
  '/',
  authorize('orders:read'),
  listOrders,
);

/**
 * Get a single order by ID (tenant-enforced in controller).
 * Roles: all authenticated roles
 */
router.get(
  '/:orderId',
  authorize('orders:read'),
  getOrder,
);

/**
 * Transition order status.
 * Role-gated per transition in orderController (TRANSITION_ROLES).
 */
router.post(
  '/:orderId/status',
  authorize('orders:transition'),
  requireTenant,
  transitionOrderStatus,
);

export default router;
