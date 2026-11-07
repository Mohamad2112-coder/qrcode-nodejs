# QR Order Notification & Mobile Pager SaaS

A multi-tenant, real-time QR code ordering and mobile pager system built with **Node.js (Express)**, **Next.js 14**, and **MySQL 8.0**.

---

## 🚀 Features

- **Multi-Tenant Architecture**: Strict tenant scoping (`business_id`) across all routes and Socket.io rooms.
- **Point of Sale (POS)**: Cashier interface with responsive product catalog, cart management, and instant QR tracking token generation.
- **Kitchen Display System (KDS)**: Real-time order queue with elapsed timers, live Socket.io sync, and status progression controls.
- **Customer Mobile Tracker PWA**: Mobile-first customer tracking page with real-time status stepper, item snapshots, and Web Push notifications.
- **Edge Hub Offline Sync**: `/api/v1/sync` batch endpoint supporting offline POS orders with idempotency and duplicate conflict detection.
- **Multi-Language & RTL**: Full support for English (LTR), Arabic (RTL), and Kurdish (RTL).
- **Strict State Machine**: Enforces valid order lifecycles (`PENDING` ➔ `PREPARING` ➔ `READY` ➔ `COLLECTED`) and RBAC permissions.
- **Containerized**: Fully orchestrated with Docker Compose.

---

## 📦 Project Structure

```
.
├── backend/
│   ├── config/            # DB pool, JWT, and VAPID setup
│   ├── controllers/       # Auth, Order, and Sync controllers
│   ├── database/          # schema.sql and seed.js
│   ├── middleware/        # Tenant scoping, JWT auth & RBAC
│   ├── routes/            # Express route declarations
│   ├── services/          # Web Push & Socket.io helpers
│   ├── Dockerfile
│   └── server.js
├── frontend/
│   ├── app/
│   │   ├── kitchen/       # Kitchen Display System
│   │   ├── login/         # Authentication
│   │   ├── pos/           # Cashier Point of Sale
│   │   ├── track/[token]/ # Public Customer Order Tracker PWA
│   │   └── page.js        # Role-based dashboard
│   ├── lib/               # API client, i18n, Socket.io client
│   └── Dockerfile
├── docker-compose.yml     # Orchestration for MySQL, Backend, Frontend
└── .env.example
```

---

## 🛠️ Quick Start

### 1. Configure Environment
```bash
cp .env.example .env
```
Ensure `JWT_SECRET` is set (minimum 32 characters). Generate VAPID keys for Web Push if needed:
```bash
node -e "const crypto=require('crypto');const e=crypto.createECDH('prime256v1');e.generateKeys();console.log('PUB='+e.getPublicKey('base64url')+'\nPRIV='+e.getPrivateKey('base64url'))"
```

### 2. Start Containers
```bash
docker compose up --build -d
```

### 3. Seed Database
```bash
docker exec -i qr_order_api_backend node --input-type=module -e "import('./database/seed.js')"
```

---

## 🔑 Demo Credentials

| Role | Email | Password |
|---|---|---|
| **Super Admin** | `admin@qrorder.local` | `Admin123!` |
| **Cashier** | `cashier@demo.local` | `Cashier123!` |
| **Kitchen** | `kitchen@demo.local` | `Kitchen123!` |

---

## 🌐 Endpoints

- **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- **API Health**: [http://localhost:5000/health](http://localhost:5000/health)
- **Customer Tracker**: `http://localhost:3000/track/:token`
