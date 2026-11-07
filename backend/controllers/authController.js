/**
 * Auth Controller - register/login/refresh/me
 * Password hashing with bcrypt, JWT issuance with tenant + role claims.
 */
import asyncHandler from 'express-async-handler';
import { query } from '../config/db.js';
import bcrypt from 'bcryptjs';
import { signToken } from '../config/jwt.js';
import { randomUUID } from 'crypto';

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

/**
 * POST /api/v1/auth/register
 * Super-admin can create any user; others create within their own business.
 */
export const register = asyncHandler(async (req, res) => {
  const { business_id, role: callerRole } = req.user;
  const { email, password, full_name, role_name, target_business_id } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Email and password are required',
      code: 'MISSING_CREDENTIALS',
    });
  }
  if (password.length < 8) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Password must be at least 8 characters',
      code: 'WEAK_PASSWORD',
    });
  }

  // Determine target business with tenant isolation
  let targetBusinessId = business_id;
  if (callerRole === 'super_admin' && target_business_id) {
    targetBusinessId = target_business_id;
  } else if (callerRole !== 'super_admin') {
    targetBusinessId = business_id;
  }

  if (!targetBusinessId) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Business context is required',
      code: 'MISSING_BUSINESS',
    });
  }

  const role = role_name || 'cashier';

  // Email uniqueness within target business
  const existing = await query(
    'SELECT id FROM users WHERE email = ? AND business_id = ? LIMIT 1',
    [email, targetBusinessId],
  );
  if (existing.length > 0) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'User already exists in this business',
      code: 'USER_EXISTS',
    });
  }

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await query(
    `INSERT INTO users (id, business_id, email, password_hash, role_name, full_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, targetBusinessId, email, passwordHash, role, full_name || null],
  );

  const token = signToken({ userId, business_id: targetBusinessId, role, email });

  return res.status(201).json({
    userId,
    email,
    role,
    business_id: targetBusinessId,
    token,
  });
});

/**
 * POST /api/v1/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Email and password are required',
      code: 'MISSING_CREDENTIALS',
    });
  }

  const [rows] = await query(
    `SELECT u.id, u.business_id, u.email, u.password_hash, u.role_name, u.full_name,
            u.is_active, b.name AS business_name
     FROM users u
     LEFT JOIN businesses b ON b.id = u.business_id
     WHERE u.email = ? LIMIT 1`,
    [email],
  );
  const user = rows[0];
  if (!user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
    });
  }

  if (!user.is_active) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Account is deactivated',
      code: 'ACCOUNT_INACTIVE',
    });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
    });
  }

  await query(
    'UPDATE users SET last_login_at = NOW() WHERE id = ?',
    [user.id],
  );

  const token = signToken({
    userId: user.id,
    business_id: user.business_id,
    role: user.role_name,
    email: user.email,
  });

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role_name,
      fullName: user.full_name,
      business_id: user.business_id,
      businessName: user.business_name,
    },
    token,
  });
});

/**
 * GET /api/v1/auth/me
 */
export const me = asyncHandler(async (req, res) => {
  const { userId, business_id, role, email } = req.user;

  const [rows] = await query(
    `SELECT u.id, u.email, u.role_name, u.full_name, u.is_active,
            b.name AS business_name
     FROM users u
     LEFT JOIN businesses b ON b.id = u.business_id
     WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  const user = rows[0];
  if (!user) {
    return res.status(404).json({
      error: 'Not found',
      message: 'User not found',
      code: 'USER_NOT_FOUND',
    });
  }

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role_name,
      fullName: user.full_name,
      isActive: user.is_active,
      business_id,
      businessName: user.business_name,
    },
  });
});
