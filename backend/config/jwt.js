/**
 * JWT signing & verification.
 * HS256 algorithm, mandatory strong secret.
 */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    '[JWT_CONFIG_ERROR] JWT_SECRET must be set and at least 32 characters long',
  );
}

/**
 * Sign a payload into a JWT.
 * @param {object} payload - Claims to embed (userId, business_id, role, email).
 * @returns {string} Signed JWT.
 */
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256',
    issuer: 'qr-order-api',
    audience: 'qr-order-client',
  });
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws on invalid/expired token.
 * @param {string} token - JWT string.
 * @returns {object} Decoded payload.
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'qr-order-api',
    audience: 'qr-order-client',
  });
}

export default { signToken, verifyToken };
