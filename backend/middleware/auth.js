/**
 * Authentication & RBAC authorization middleware.
 *
 * Roles: super_admin > owner > manager > cashier > kitchen
 * Permissions are checked against the decoded JWT role.
 */
const ROLES = ['super_admin', 'owner', 'manager', 'cashier', 'kitchen'];

const ROLE_RANK = {
  super_admin: 5,
  owner: 4,
  manager: 3,
  cashier: 2,
  kitchen: 1,
};

const PERMISSIONS = {
  super_admin: ['*'],
  owner: ['*'],
  manager: [
    'orders:read', 'orders:write', 'orders:transition',
    'products:read', 'products:write',
    'users:read', 'users:write',
    'settings:read', 'settings:write',
    'sync:read', 'sync:write',
    'push:read', 'push:write',
  ],
  cashier: [
    'orders:read', 'orders:write', 'orders:transition:cashier',
    'products:read',
    'sync:read', 'sync:write',
    'push:read',
  ],
  kitchen: [
    'orders:read',
    'orders:transition:kitchen',
  ],
};

function hasPermission(role, permission) {
  const perms = PERMISSIONS[role] || [];
  if (perms.includes('*')) return true;
  return perms.some((p) => {
    if (p === permission) return true;
    // Support prefix matching, e.g. 'orders:transition:kitchen' covers 'orders:transition'
    if (p.startsWith(`${permission}:`)) return true;
    if (permission.endsWith(':*')) {
      const prefix = permission.slice(0, -1);
      return p.startsWith(prefix);
    }
    return false;
  });
}

/**
 * Ensure caller is authenticated (req.user must be set by tenantScope).
 */
export function authenticate(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
      code: 'NOT_AUTHENTICATED',
    });
  }
  next();
}

/**
 * Middleware factory: require a specific permission.
 * Usage: router.post('/', authenticate, authorize('orders:write'), controller)
 */
export function authorize(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
    }
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${req.user.role}' lacks permission '${permission}'`,
        code: 'INSUFFICIENT_PERMISSION',
      });
    }
    next();
  };
}

/**
 * Middleware factory: require one of several roles.
 */
export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${req.user.role}' not allowed (required: ${allowedRoles.join(', ')})`,
        code: 'INSUFFICIENT_ROLE',
      });
    }
    next();
  };
}

/**
 * Require a role at or above a minimum rank (e.g. manager or above).
 */
export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
    }
    const userRank = ROLE_RANK[req.user.role] || 0;
    const minRank = ROLE_RANK[minRole] || 0;
    if (userRank < minRank) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${req.user.role}' insufficient; minimum '${minRole}' required`,
        code: 'INSUFFICIENT_ROLE_RANK',
      });
    }
    next();
  };
}

export default {
  authenticate,
  authorize,
  authorizeRoles,
  requireMinRole,
  hasPermission,
  ROLES,
  ROLE_RANK,
  PERMISSIONS,
};
