/**
 * Database connection pool using mysql2/promise.
 * Production-ready: pooling, timeouts, charset, health check, error handling.
 */
import { createPool } from 'mysql2/promise';

const pool = createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'qr_user',
  password: process.env.DB_PASSWORD || 'qr_password',
  database: process.env.DB_NAME || 'qr_order_db',
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  waitForConnections: true,
  charset: 'utf8mb4',
  typeCast: (field, next) => {
    if (field.type === 'BIT' || field.type === 'TINY' && field.length === 1) {
      const val = field.buffer();
      return val !== null ? Boolean(val[0]) : val;
    }
    return next();
  },
});

/**
 * Execute a query with automatic connection handling.
 * Supports both direct result access (res.length, res[0]) and
 * mysql2-style destructuring: const [rows] = await query(...).
 */
export async function query(sql, params = []) {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows, fields] = await connection.query(sql, params);
    if (rows && typeof rows === 'object') {
      rows[Symbol.iterator] = function* () {
        yield rows;
        yield fields;
      };
    }
    return rows;
  } catch (error) {
    console.error('[DB_QUERY_ERROR]', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
    });
    throw new Error(`Database query failed: ${error.message}`);
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get a single connection from the pool (for transactions).
 * Throws on connection failure.
 */
export async function getClient() {
  try {
    return await pool.getConnection();
  } catch (error) {
    console.error('[DB_CONNECTION_ERROR]', {
      message: error.message,
      code: error.code,
    });
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

/**
 * Health check - returns true if DB is reachable.
 */
export async function healthCheck() {
  try {
    await query('SELECT 1 AS healthy');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Close the pool (useful for graceful shutdown / tests).
 */
export async function closePool() {
  try {
    await pool.end();
  } catch (error) {
    console.error('[DB_POOL_CLOSE_ERROR]', error.message);
  }
}

export default { query, getClient, healthCheck, closePool };
