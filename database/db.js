const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rutograma.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db;

function getDb() {
  if (!db) db = new Database(DB_PATH);
  return db;
}

function initializeDatabase() {
  const db = getDb();
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      domain        TEXT UNIQUE,
      plan          TEXT DEFAULT 'basic',
      status        TEXT DEFAULT 'active',
      max_users     INTEGER DEFAULT 10,
      max_monitors  INTEGER DEFAULT 3,
      max_routes_month INTEGER DEFAULT 500,
      openweather_api_key TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      address       TEXT,
      expires_at    TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT NOT NULL,
      email         TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT DEFAULT 'user',
      phone         TEXT,
      is_active     INTEGER DEFAULT 1,
      last_login    TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, email)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT NOT NULL,
      amount        REAL NOT NULL,
      currency      TEXT DEFAULT 'USD',
      status        TEXT DEFAULT 'pending',
      description   TEXT,
      period_start  TEXT,
      period_end    TEXT,
      due_date      TEXT,
      paid_at       TEXT,
      notes         TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id              TEXT PRIMARY KEY,
      tenant_id       TEXT NOT NULL,
      name            TEXT NOT NULL,
      license_number  TEXT,
      license_type    TEXT,
      phone           TEXT,
      email           TEXT,
      is_active       INTEGER DEFAULT 1,
      created_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id          TEXT PRIMARY KEY,
      tenant_id   TEXT NOT NULL,
      plate       TEXT NOT NULL,
      type        TEXT DEFAULT 'bus',
      brand       TEXT,
      model       TEXT,
      year        INTEGER,
      capacity    INTEGER,
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      UNIQUE(tenant_id, plate)
    );

    CREATE TABLE IF NOT EXISTS trips (
      id                  TEXT PRIMARY KEY,
      tenant_id           TEXT NOT NULL,
      vehicle_id          TEXT NOT NULL,
      driver_id           TEXT NOT NULL,
      origin_name         TEXT NOT NULL,
      origin_lat          REAL NOT NULL,
      origin_lng          REAL NOT NULL,
      destination_name    TEXT NOT NULL,
      destination_lat     REAL NOT NULL,
      destination_lng     REAL NOT NULL,
      route_geometry      TEXT,
      distance_km         REAL,
      estimated_duration  INTEGER,
      status              TEXT DEFAULT 'planned',
      notes               TEXT,
      started_at          TEXT,
      completed_at        TEXT,
      created_by          TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (driver_id) REFERENCES drivers(id)
    );

    CREATE TABLE IF NOT EXISTS trip_tracking (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id     TEXT NOT NULL,
      lat         REAL NOT NULL,
      lng         REAL NOT NULL,
      speed       REAL,
      heading     REAL,
      accuracy    REAL,
      recorded_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (trip_id) REFERENCES trips(id)
    );

    CREATE TABLE IF NOT EXISTS trip_alerts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id       TEXT NOT NULL,
      risk_point_id TEXT,
      alert_type    TEXT NOT NULL,
      alert_source  TEXT DEFAULT 'custom',
      severity      TEXT DEFAULT 'medium',
      lat           REAL,
      lng           REAL,
      description   TEXT,
      distance_m    REAL,
      triggered_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (trip_id) REFERENCES trips(id)
    );

    CREATE TABLE IF NOT EXISTS risk_points (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT NOT NULL,
      type          TEXT NOT NULL,
      name          TEXT,
      description   TEXT,
      lat           REAL NOT NULL,
      lng           REAL NOT NULL,
      severity      TEXT DEFAULT 'medium',
      is_permanent  INTEGER DEFAULT 1,
      valid_until   TEXT,
      radius_meters INTEGER DEFAULT 250,
      source        TEXT DEFAULT 'manual',
      photo_url     TEXT,
      created_by    TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS monitoring_sessions (
      id                  TEXT PRIMARY KEY,
      tenant_id           TEXT NOT NULL,
      trip_id             TEXT,
      monitor_user_id     TEXT NOT NULL,
      driver_id           TEXT,
      vehicle_id          TEXT,
      origin_name         TEXT,
      destination_name    TEXT,
      risk_points_added   INTEGER DEFAULT 0,
      alerts_triggered    INTEGER DEFAULT 0,
      distance_km         REAL,
      notes               TEXT,
      started_at          TEXT DEFAULT (datetime('now')),
      ended_at            TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (monitor_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_tenant      ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_trips_tenant      ON trips(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_trips_status      ON trips(status);
    CREATE INDEX IF NOT EXISTS idx_riskpoints_tenant ON risk_points(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_riskpoints_geo    ON risk_points(lat, lng);
    CREATE INDEX IF NOT EXISTS idx_tracking_trip     ON trip_tracking(trip_id);
  `);

  // Migraciones de columnas nuevas (idempotentes)
  const migrations = [
    "ALTER TABLE tenants ADD COLUMN logo_url     TEXT",
    "ALTER TABLE tenants ADD COLUMN favicon_url  TEXT",
    "ALTER TABLE tenants ADD COLUMN ai_api_key   TEXT",
    "ALTER TABLE tenants ADD COLUMN primary_color TEXT DEFAULT '#1a73e8'",
  ];
  migrations.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  createSuperAdmin(db);
  console.log('[DB] Base de datos inicializada correctamente.');
}

function createSuperAdmin(db) {
  const existing = db.prepare("SELECT id FROM tenants WHERE id = 'system'").get();
  if (existing) return;

  const tenantId = 'system';
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@rutograma.com';
  const adminPass  = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
  const adminName  = process.env.SUPER_ADMIN_NAME || 'Super Administrador';

  db.prepare(`INSERT INTO tenants (id, name, domain, plan, max_users, max_monitors)
    VALUES (?, 'Sistema Rutograma', 'system', 'enterprise', 9999, 9999)
  `).run(tenantId);

  const hash = bcrypt.hashSync(adminPass, 12);
  db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, ?, 'superadmin')
  `).run(uuidv4(), tenantId, adminEmail, hash, adminName);

  console.log(`[DB] Super Admin creado: ${adminEmail} / ${adminPass}`);
}

module.exports = { getDb, initializeDatabase };
