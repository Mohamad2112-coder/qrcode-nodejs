/**
 * Tenant scope middleware.
 *
 * Enforces business_id scoping on every authenticated request.
 * - Decodes JWT and attaches req.user { userId, businessId, role, email }.
 * - Super admins bypass tenant restriction; all other roles require a business_id.
 * - Attaches req.tenantFilter(params) to inject business_id into query builders.
 * - Attaches req.assertTenant(businessIdParam) to block cross-tenant access.
 * - Throws 403 on cross-tenant leaks.
 */
import { verifyToken } from '../config/jwt.js';

const TENANT_ROLES = ['owner', 'manager', 'cashier', 'kitchen'];

function scopeFieldFor(role) {
  if (role === 'super_admin') return null;
  return 'business_id';
}

export function tenantScope(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or malformed Bearer token',
        code: 'MISSING_TOKEN',
      });
    }

    const token = authHeader.slice(7).trim();
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
    }

    const businessId = decoded.business_id || decoded.businessId || null;

    const user = {
      userId: decoded.userId || decoded.sub,
      businessId,
      // Snake-case alias for controllers that read req.user.business_id
      business_id: businessId,
      role: decoded.role,
      email: decoded.email,
    };

    if (!user.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token missing user identity',
        code: 'INVALID_TOKEN_SUBJECT',
      });
    }

    const scopeField = scopeFieldFor(user.role);

    if (scopeField && !user.businessId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${user.role}' must be associated with a business`,
        code: 'NO_TENANT_CONTEXT',
      });
    }

    req.user = user;

    /**
     * Returns a filter object pre-populated with the caller's business_id.
     * Use when constructing WHERE clauses: `WHERE ?` or dynamic SQL.
     */
    req.tenantFilter = (extraParams = {}) => {
      const filter = { ...extraParams };
      if (scopeField && user.businessId) {
        filter[scopeField] = user.businessId;
      }
      return filter;
    };

    /**
     * Asserts that a given business_id belongs to the caller's tenant.
     * Super admins bypass. Throws an error with status 403 on mismatch.
     */
    req.assertTenant = (businessIdParam) => {
      if (scopeField === null) return true;
      if (businessIdParam == null || String(businessIdParam) !== String(user.businessId)) {
        const err = new Error('Forbidden: cross-tenant access blocked');
        err.status = 403;
        err.code = 'CROSS_TENANT_ACCESS';
        throw err;
      }
      return true;
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Standalone guard: require a tenant context (rejects super_admin-only calls
 * that lack a business where one is needed).
 */
export function requireTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
      code: 'NOT_AUTHENTICATED',
    });
  }
  const scopeField = scopeFieldFor(req.user.role);
  if (scopeField && !req.user.businessId) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Tenant context required',
      code: 'NO_TENANT_CONTEXT',
    });
  }
  next();
}

import { authenticate } from './auth.js';
export { authenticate };
export default { tenantScope, requireTenant, authenticate };
