/**
 * QR Order Notification & Mobile Pager SaaS - Express API server.
 * Node 20, ESM, mysql2/promise pooling, Socket.io, JWT + RBAC, tenant scoping.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { query, healthCheck, closePool } from './config/db.js';
import { webpush, VAPID_PUBLIC_KEY } from './config/vapid.js';
import { verifyToken } from './config/jwt.js';

// Routes
import orderRoutes from './routes/orderRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
import authRoutes from './routes/authRoutes.js';
import pushRoutes from './routes/pushRoutes.js';

// Global error handler
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT) || 5000;

// ---------------------------------------------------------------
// Socket.io instance (attached to app for controllers to broadcast)
// ---------------------------------------------------------------
const io = new IOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Tenant/token room isolation middleware on Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) {
    // Allow unauthenticated connections for public tracker rooms only
    return next();
  }
  try {
    const decoded = verifyToken(token);
    socket.userId = decoded.userId || decoded.sub;
    socket.businessId = decoded.business_id || decoded.businessId || null;
    socket.role = decoded.role;
    next();
  } catch (err) {
    next(new Error('Socket authentication failed'));
  }
});

io.on('connection', (socket) => {
  console.log(`[SOCKET] connected: ${socket.id}`);

  // Join business room for real-time order broadcasts (tenant-scoped)
  if (socket.businessId) {
    socket.join(`business:${socket.businessId}`);
    socket.join(`user:${socket.userId}`);
  }

  // Public tracker room (by order tracking token hash)
  socket.on('track:join', (data) => {
    if (data && data.orderId) {
      socket.join(`order:${data.orderId}`);
      socket.join(`token:${data.tokenHash || ''}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] disconnected: ${socket.id}`);
  });
});

// Expose io to controllers via req.app.get('io')
app.set('io', io);

// ---------------------------------------------------------------
// Middleware stack
// ---------------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${req.ip}`);
  next();
});

// Global rate limiter
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests', code: 'RATE_LIMITED' },
  }),
);

// ---------------------------------------------------------------
// Health check
// ---------------------------------------------------------------
app.get(['/health', '/api/health'], async (_req, res) => {
  const dbOk = await healthCheck();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    database: dbOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    service: 'qr-order-api',
  });
});

// VAPID public key for frontend subscription
app.get('/api/v1/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// ---------------------------------------------------------------
// API routes
// ---------------------------------------------------------------
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/push', pushRoutes);

// ---------------------------------------------------------------
// 404
// ---------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'ROUTE_NOT_FOUND' });
});

// ---------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------
// Start server
// ---------------------------------------------------------------
async function start() {
  try {
    const dbOk = await healthCheck();
    if (!dbOk) {
      console.error('[STARTUP] Database health check failed. Is mysql_db reachable?');
      // Still start so health endpoint reports degraded state
    }
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[QR_ORDER_API] listening on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
    });
  } catch (err) {
    console.error('[STARTUP_ERROR]', err.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[SHUTDOWN] SIGTERM received');
  io.close();
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[SHUTDOWN] SIGINT received');
  io.close();
  await closePool();
  process.exit(0);
});

start();

export { app, httpServer, io };
