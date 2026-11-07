/**
 * Auth routes
 *
 * POST /register - Register a new user (tenant-scoped, protected)
 * POST /login    - Authenticate & issue JWT (public)
 * GET  /me       - Current user profile (protected)
 */
import { Router } from 'express';
import { tenantScope } from '../middleware/tenantScope.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';
import { register, login, me } from '../controllers/authController.js';

const router = Router();

/**
 * Public login (no tenant scope needed).
 */
router.post('/login', login);

/**
 * Protected routes (require auth + tenant scope).
 */
router.use(tenantScope);
router.use(authenticate);

/**
 * Register a user within the caller's business.
 * Roles: super_admin, owner, manager
 */
router.post(
  '/register',
  authorizeRoles('super_admin', 'owner', 'manager'),
  register,
);

/**
 * Current user profile.
 */
router.get('/me', me);

export default router;
