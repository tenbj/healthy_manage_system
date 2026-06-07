CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  wechat_name VARCHAR(80) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  source VARCHAR(40) NOT NULL,
  address VARCHAR(255) NOT NULL,
  preference TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  INDEX idx_customers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  contact VARCHAR(120) NOT NULL,
  status VARCHAR(32) NOT NULL,
  notes TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  INDEX idx_suppliers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  supplier_cost DECIMAL(12,2) NOT NULL,
  delivery_cost DECIMAL(12,2) NOT NULL,
  supplier_id VARCHAR(32) NOT NULL,
  supplier_name VARCHAR(80) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  INDEX idx_products_supplier_id (supplier_id),
  INDEX idx_products_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(32) PRIMARY KEY,
  customer_id VARCHAR(32) NOT NULL,
  customer_name VARCHAR(80) NOT NULL,
  service_date DATE NOT NULL,
  meal_name VARCHAR(120) NOT NULL,
  supplier_id VARCHAR(32) NOT NULL,
  supplier_name VARCHAR(80) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  supplier_cost DECIMAL(12,2) NOT NULL,
  delivery_cost DECIMAL(12,2) NOT NULL,
  gross_profit DECIMAL(12,2) NOT NULL,
  status VARCHAR(32) NOT NULL,
  payment_status VARCHAR(32) NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  INDEX idx_orders_customer_id (customer_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_service_date (service_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_status_logs (
  id VARCHAR(32) PRIMARY KEY,
  order_id VARCHAR(32) NOT NULL,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_order_status_logs_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_requests (
  id VARCHAR(32) PRIMARY KEY,
  customer_id VARCHAR(32) NOT NULL,
  customer_name VARCHAR(80) NOT NULL,
  order_id VARCHAR(32) NULL,
  type VARCHAR(32) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(32) NOT NULL,
  method VARCHAR(40) NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  paid_at DATETIME(3) NULL,
  INDEX idx_payment_requests_customer_id (customer_id),
  INDEX idx_payment_requests_order_id (order_id),
  INDEX idx_payment_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(32) PRIMARY KEY,
  payment_request_id VARCHAR(32) NOT NULL,
  customer_id VARCHAR(32) NOT NULL,
  order_id VARCHAR(32) NULL,
  type VARCHAR(32) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  method VARCHAR(40) NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'POSTED',
  voided_at DATETIME(3) NULL,
  void_reason TEXT NULL,
  UNIQUE KEY uniq_payments_idempotency (idempotency_key),
  INDEX idx_payments_customer_id (customer_id),
  INDEX idx_payments_order_id (order_id),
  INDEX idx_payments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prepaid_ledger (
  id VARCHAR(32) PRIMARY KEY,
  customer_id VARCHAR(32) NOT NULL,
  order_id VARCHAR(32) NULL,
  type VARCHAR(32) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  note TEXT NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uniq_prepaid_idempotency (idempotency_key),
  INDEX idx_prepaid_ledger_customer_id (customer_id),
  INDEX idx_prepaid_ledger_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_batches (
  id VARCHAR(32) PRIMARY KEY,
  supplier_id VARCHAR(32) NOT NULL,
  supplier_name VARCHAR(80) NOT NULL,
  service_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL,
  copy_text TEXT NOT NULL,
  item_count INT NOT NULL,
  total_cost DECIMAL(12,2) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  INDEX idx_supplier_batches_supplier_id (supplier_id),
  INDEX idx_supplier_batches_service_date (service_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_batch_items (
  id VARCHAR(32) PRIMARY KEY,
  batch_id VARCHAR(32) NOT NULL,
  order_id VARCHAR(32) NOT NULL,
  customer_name VARCHAR(80) NOT NULL,
  meal_name VARCHAR(120) NOT NULL,
  address VARCHAR(255) NOT NULL,
  note TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  supplier_cost DECIMAL(12,2) NOT NULL,
  UNIQUE KEY uniq_batch_order (order_id),
  INDEX idx_supplier_batch_items_batch_id (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
