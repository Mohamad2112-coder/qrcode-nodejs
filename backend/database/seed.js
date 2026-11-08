/**
 * Seed script - creates initial tenant, roles, and a super-admin user.
 * Run once after schema is applied:
 *   node --input-type=module backend/database/seed.js
 *
 * Reads admin credentials from env (ADMIN_EMAIL, ADMIN_PASSWORD) or defaults.
 */
import { query } from '../config/db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@qrorder.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'Demo QR Cafe';
const BUSINESS_SLUG = process.env.BUSINESS_SLUG || 'demo-qr-cafe';

async function ensureBusiness() {
  const [rows] = await query('SELECT id FROM businesses WHERE slug = ? LIMIT 1', [BUSINESS_SLUG]);
  if (rows.length > 0) return rows[0].id;
  const id = uuidv4();
  await query(
    `INSERT INTO businesses (id, name, slug, timezone, currency) VALUES (?, ?, ?, 'UTC', 'IQD')`,
    [id, BUSINESS_NAME, BUSINESS_SLUG],
  );
  console.log(`[SEED] Created business: ${BUSINESS_NAME} (${id})`);
  return id;
}

async function ensureRoles() {
  const roleNames = ['super_admin', 'owner', 'manager', 'cashier', 'kitchen'];
  for (const name of roleNames) {
    const [rows] = await query('SELECT id FROM roles WHERE name = ? LIMIT 1', [name]);
    if (rows.length === 0) {
      const id = uuidv4();
      await query(
        `INSERT INTO roles (id, name, description) VALUES (?, ?, ?)`,
        [id, name, `${name} role`],
      );
      console.log(`[SEED] Created role: ${name}`);
    }
  }
}

async function ensureSuperAdmin(businessId) {
  const [rows] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [ADMIN_EMAIL]);
  if (rows.length > 0) {
    console.log(`[SEED] Super admin already exists: ${ADMIN_EMAIL}`);
    return;
  }
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  await query(
    `INSERT INTO users (id, business_id, email, password_hash, role_name, full_name, is_active, email_verified)
     VALUES (?, NULL, ?, ?, 'super_admin', ?, 1, 1)`,
    [id, ADMIN_EMAIL, passwordHash, 'System Administrator'],
  );
  console.log(`[SEED] Created super admin: ${ADMIN_EMAIL} / password: ${ADMIN_PASSWORD}`);
}

async function ensureDemoBusinessUser(businessId) {
  const [rows] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', ['cashier@demo.local']);
  if (rows.length > 0) return;
  const id = uuidv4();
  const passwordHash = await bcrypt.hash('Cashier123!', SALT_ROUNDS);
  await query(
    `INSERT INTO users (id, business_id, email, password_hash, role_name, full_name, is_active, email_verified)
     VALUES (?, ?, ?, ?, 'cashier', 'Demo Cashier', 1, 1)`,
    [id, businessId, 'cashier@demo.local', passwordHash],
  );
  console.log(`[SEED] Created demo cashier: cashier@demo.local / Cashier123!`);
}

async function ensureDemoKitchenUser(businessId) {
  const [rows] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', ['kitchen@demo.local']);
  if (rows.length > 0) return;
  const id = uuidv4();
  const passwordHash = await bcrypt.hash('Kitchen123!', SALT_ROUNDS);
  await query(
    `INSERT INTO users (id, business_id, email, password_hash, role_name, full_name, is_active, email_verified)
     VALUES (?, ?, ?, ?, 'kitchen', 'Demo Kitchen', 1, 1)`,
    [id, businessId, 'kitchen@demo.local', passwordHash],
  );
  console.log(`[SEED] Created demo kitchen: kitchen@demo.local / Kitchen123!`);
}

async function ensureProducts(businessId) {
  const MENU_ITEMS = [
    { id: 'p1', name: 'Grilled Burger', price: 8500 },
    { id: 'p2', name: 'Margherita Pizza', price: 12000 },
    { id: 'p3', name: 'Caesar Salad', price: 6500 },
    { id: 'p4', name: 'Cola', price: 2000 },
    { id: 'p5', name: 'Fresh Orange Juice', price: 4000 },
    { id: 'p6', name: 'Bottled Water', price: 1500 },
    { id: 'p7', name: 'Cheesecake', price: 5500 },
    { id: 'p8', name: 'Ice Cream', price: 3000 },
  ];
  for (const item of MENU_ITEMS) {
    const [rows] = await query('SELECT id FROM products WHERE id = ? LIMIT 1', [item.id]);
    if (rows.length === 0) {
      await query(
        `INSERT INTO products (id, business_id, name, price, is_available) VALUES (?, ?, ?, ?, 1)`,
        [item.id, businessId, item.name, item.price],
      );
      console.log(`[SEED] Created product: ${item.name} (${item.id})`);
    }
  }
}

async function seed() {
  console.log('[SEED] Starting...');
  await ensureRoles();
  const businessId = await ensureBusiness();
  await ensureSuperAdmin(businessId);
  await ensureDemoBusinessUser(businessId);
  await ensureDemoKitchenUser(businessId);
  await ensureProducts(businessId);
  console.log('[SEED] Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[SEED] Failed:', err.message);
  process.exit(1);
});
