-- ═══════════════════════════════════════════════════════════════════════
--  نظام الخدمات المساندة المطور — مخطط قاعدة البيانات (PostgreSQL)
--  يُستخدم عند DB_DRIVER=postgres (الإنتاج داخل البحرين).
--
--  ملاحظة تصميمية: الحقول الأساسية معمودة (typed columns) لأغراض الفهرسة
--  والتقارير، والحقول التفصيلية تُخزَّن في عمود JSONB واحد اسمه data.
--  هذا يعطي مرونة نموذج KV مع قوة استعلام SQL.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sequences (
  name  TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  data         JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS suppliers    (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS contracts    (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS asset_types  (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sites        (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS assets       (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tickets      (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS work_orders  (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS budget_lines (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS invoices     (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS approvals    (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS payments     (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit        (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- فهارس الاستعلامات الشائعة
CREATE INDEX IF NOT EXISTS assets_site_idx     ON assets      ((data->>'siteCode'));
CREATE INDEX IF NOT EXISTS assets_type_idx     ON assets      ((data->>'typeCode'));
CREATE INDEX IF NOT EXISTS assets_status_idx   ON assets      ((data->>'status'));
CREATE INDEX IF NOT EXISTS tickets_status_idx  ON tickets     ((data->>'status'));
CREATE INDEX IF NOT EXISTS tickets_asset_idx   ON tickets     ((data->>'assetTag'));
CREATE INDEX IF NOT EXISTS wo_ticket_idx       ON work_orders ((data->>'ticketRef'));
CREATE INDEX IF NOT EXISTS wo_invoice_idx      ON work_orders ((data->>'invoiceRef'));
CREATE INDEX IF NOT EXISTS inv_status_idx      ON invoices    ((data->>'status'));
CREATE INDEX IF NOT EXISTS inv_supplier_idx    ON invoices    ((data->>'supplierId'));
CREATE INDEX IF NOT EXISTS appr_invoice_idx    ON approvals   ((data->>'invoiceRef'));
CREATE INDEX IF NOT EXISTS audit_entity_idx    ON audit       ((data->>'entity'), (data->>'entityId'));
CREATE INDEX IF NOT EXISTS contracts_supplier_idx ON contracts ((data->>'supplierId'));
CREATE INDEX IF NOT EXISTS contracts_status_idx   ON contracts ((data->>'status'));
