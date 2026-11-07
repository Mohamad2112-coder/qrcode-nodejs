-- -----------------------------------------------------------
# QR Order Notification & Mobile Pager SaaS - MySQL 8.0 Schema
-- Fully normalized, strict tenant isolation, UUID v4 primary keys
-- -----------------------------------------------------------

-- Run as root or a user with CREATE privileges:
--   mysql -u root -p qr_order_db < schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------
-- Core tenant table
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `businesses` (
  `id` CHAR(36) NOT NULL COMMENT 'UUID v4 primary key',
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
  `currency` CHAR(3) NOT NULL DEFAULT 'USD',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_businesses_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Business settings (key/value per tenant)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `business_settings` (
  `id` CHAR(36) NOT NULL,
  `business_id` CHAR(36) NOT NULL,
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` JSON NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_business_settings_business_key` (`business_id`, `setting_key`),
  CONSTRAINT `fk_business_settings_business`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Roles (RBAC definitions)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id` CHAR(36) NOT NULL,
  `name` ENUM('super_admin','owner','manager','cashier','kitchen') NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Users (scoped to a business; super_admin may have NULL business_id)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `business_id` CHAR(36) DEFAULT NULL COMMENT 'NULL for super_admin',
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role_name` ENUM('super_admin','owner','manager','cashier','kitchen') NOT NULL DEFAULT 'cashier',
  `full_name` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `email_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `idx_users_business_id` (`business_id`),
  CONSTRAINT `fk_users_business`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Product categories (per business)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `product_categories` (
  `id` CHAR(36) NOT NULL,
  `business_id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product_categories_business` (`business_id`),
  CONSTRAINT `fk_product_categories_business`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Products (per business, snapshot price used at order time)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `products` (
  `id` CHAR(36) NOT NULL,
  `business_id` CHAR(36) NOT NULL,
  `category_id` CHAR(36) DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `is_available` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_products_business` (`business_id`),
  KEY `idx_products_category` (`category_id`),
  CONSTRAINT `fk_products_business`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_products_category`
    FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Orders (state machine: PENDING -> PREPARING -> READY -> COLLECTED/CANCELLED)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id` CHAR(36) NOT NULL,
  `business_id` CHAR(36) NOT NULL,
  `order_number` VARCHAR(32) NOT NULL COMMENT 'Daily sequence, e.g. ORD-20240101-0001',
  `idempotency_key` VARCHAR(128) DEFAULT NULL COMMENT 'Client-supplied idempotency key for offline sync',
  `customer_name` VARCHAR(255) DEFAULT NULL,
  `customer_phone` VARCHAR(50) DEFAULT NULL,
  `table_number` VARCHAR(20) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `status` ENUM('PENDING','PREPARING','READY','COLLECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `sync_status` ENUM('synced','pending','conflict') NOT NULL DEFAULT 'synced',
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `qr_token_hash` CHAR(64) DEFAULT NULL COMMENT 'SHA-256 of the 256-bit QR tracking token',
  `ready_notified_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'When READY web push was sent',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_orders_idempotency` (`business_id`, `idempotency_key`),
  KEY `idx_orders_business_status` (`business_id`, `status`),
  KEY `idx_orders_business_created` (`business_id`, `created_at`),
  KEY `idx_orders_qr_token_hash` (`qr_token_hash`),
  KEY `idx_orders_number` (`order_number`),
  CONSTRAINT `fk_orders_business`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Order items (historical name & price snapshots)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `product_id` CHAR(36) DEFAULT NULL,
  `product_name_snapshot` VARCHAR(255) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `unit_price_snapshot` DECIMAL(10,2) NOT NULL,
  `total_price_snapshot` DECIMAL(10,2) NOT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order` (`order_id`),
  KEY `idx_order_items_product` (`product_id`),
  CONSTRAINT `fk_order_items_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_order_items_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Order tracking tokens (secure unguessable 64-char strings)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_tracking_tokens` (
  `id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL COMMENT 'SHA-256 of the plaintext 64-char token',
  `expires_at` TIMESTAMP NOT NULL,
  `is_revoked` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_tracking_tokens_token_hash` (`token_hash`),
  KEY `idx_order_tracking_tokens_order` (`order_id`),
  KEY `idx_order_tracking_tokens_expires` (`expires_at`),
  CONSTRAINT `fk_order_tracking_tokens_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Order status audit trail
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_status_audit` (
  `id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `from_status` ENUM('PENDING','PREPARING','READY','COLLECTED','CANCELLED') DEFAULT NULL,
  `to_status` ENUM('PENDING','PREPARING','READY','COLLECTED','CANCELLED') NOT NULL,
  `changed_by` CHAR(36) DEFAULT NULL,
  `changed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_status_audit_order` (`order_id`),
  KEY `idx_order_status_audit_changed_at` (`changed_at`),
  CONSTRAINT `fk_order_status_audit_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_order_status_audit_user`
    FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Push subscriptions (Web Push API)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` CHAR(36) NOT NULL,
  `business_id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) DEFAULT NULL COMMENT 'Linked order when opting in via tracker',
  `endpoint` TEXT NOT NULL,
  `p256h_key` TEXT NOT NULL,
  `auth_key` TEXT NOT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_push_subscriptions_business` (`business_id`),
  KEY `idx_push_subscriptions_order` (`order_id`),
  CONSTRAINT `fk_push_subscriptions_business`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_push_subscriptions_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Notification jobs (outbox pattern for Web Push delivery)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notification_jobs` (
  `id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `business_id` CHAR(36) NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('pending','sent','failed','deadletter') NOT NULL DEFAULT 'pending',
  `attempts` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 5,
  `last_error` TEXT DEFAULT NULL,
  `scheduled_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notification_jobs_status` (`status`),
  KEY `idx_notification_jobs_order` (`order_id`),
  KEY `idx_notification_jobs_scheduled` (`scheduled_at`),
  CONSTRAINT `fk_notification_jobs_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_notification_jobs_business`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Sync batches (offline Edge Hub sync ledger)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sync_batches` (
  `id` CHAR(36) NOT NULL,
  `business_id` CHAR(36) NOT NULL,
  `batch_id` VARCHAR(128) NOT NULL COMMENT 'Client-supplied batch identifier',
  `received_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `order_count` INT NOT NULL DEFAULT 0,
  `applied_count` INT NOT NULL DEFAULT 0,
  `skipped_count` INT NOT NULL DEFAULT 0,
  `rejected_count` INT NOT NULL DEFAULT 0,
  `status` ENUM('received','processing','completed','failed') NOT NULL DEFAULT 'received',
  `summary` JSON DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sync_batches_batch` (`business_id`, `batch_id`),
  KEY `idx_sync_batches_business` (`business_id`),
  CONSTRAINT `fk_sync_batches_business`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Indexes for performance & tenant-scoped lookups
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS `idx_orders_business_id` ON `orders` (`business_id`);
CREATE INDEX IF NOT EXISTS `idx_order_items_order_id` ON `order_items` (`order_id`);
CREATE INDEX IF NOT EXISTS `idx_push_subscriptions_business_active` ON `push_subscriptions` (`business_id`, `is_active`);

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------
-- End of schema
-- -----------------------------------------------------------
