const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../database/db');
const { authMiddleware, requireSuperAdmin, checkTenantActive } = require('../middleware/auth');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes permitidas'));
  }
});

const router = express.Router();
router.use(authMiddleware, requireSuperAdmin);

// GET /api/saas/tenants
router.get('/tenants', (req, res) => {
  const db = getDb();
  const tenants = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND is_active = 1) AS active_users,
      (SELECT COUNT(*) FROM trips WHERE tenant_id = t.id) AS total_trips
    FROM tenants t
    WHERE t.id != 'system'
    ORDER BY t.created_at DESC
  `).all();
  res.json(tenants);
});

// POST /api/saas/tenants
router.post('/tenants', (req, res) => {
  const { name, domain, plan, contact_email, contact_phone, address,
          max_users, max_monitors, max_routes_month, expires_at,
          openweather_api_key, admin_email, admin_password, admin_name } = req.body;

  if (!name || !admin_email || !admin_password || !admin_name) {
    return res.status(400).json({ error: 'Nombre, email/password/nombre del admin son requeridos.' });
  }

  const db = getDb();
  const plans = { free: [3,1,50], basic: [10,3,500], pro: [30,10,2000], enterprise: [9999,99,99999] };
  const [mu, mm, mr] = plans[plan] || plans.basic;

  const tenantId = uuidv4();
  db.prepare(`
    INSERT INTO tenants (id, name, domain, plan, status, max_users, max_monitors,
      max_routes_month, openweather_api_key, contact_email, contact_phone, address, expires_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId, name, domain || null, plan || 'basic',
    max_users || mu, max_monitors || mm, max_routes_month || mr,
    openweather_api_key || null, contact_email || null,
    contact_phone || null, address || null, expires_at || null);

  const hash = bcrypt.hashSync(admin_password, 12);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, ?, 'admin')
  `).run(uuidv4(), tenantId, admin_email.toLowerCase(), hash, admin_name);

  res.status(201).json({ id: tenantId, message: 'Tenant creado exitosamente.' });
});

// PUT /api/saas/tenants/:id
router.put('/tenants/:id', (req, res) => {
  const { name, domain, plan, status, max_users, max_monitors,
          max_routes_month, expires_at, openweather_api_key, ai_api_key,
          contact_email, contact_phone, address, primary_color,
          admin_name, admin_email, admin_password, update_admin } = req.body;

  const n = v => (v === undefined ? null : v);
  const db = getDb();

  db.prepare(`
    UPDATE tenants SET
      name = COALESCE(?, name),
      domain = COALESCE(?, domain),
      plan = COALESCE(?, plan),
      status = COALESCE(?, status),
      max_users = COALESCE(?, max_users),
      max_monitors = COALESCE(?, max_monitors),
      max_routes_month = COALESCE(?, max_routes_month),
      expires_at = COALESCE(?, expires_at),
      openweather_api_key = COALESCE(?, openweather_api_key),
      ai_api_key = COALESCE(?, ai_api_key),
      contact_email = COALESCE(?, contact_email),
      contact_phone = COALESCE(?, contact_phone),
      address = COALESCE(?, address),
      primary_color = COALESCE(?, primary_color),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(n(name), n(domain), n(plan), n(status), n(max_users), n(max_monitors),
         n(max_routes_month), n(expires_at), n(openweather_api_key), n(ai_api_key),
         n(contact_email), n(contact_phone), n(address), n(primary_color),
         req.params.id);

  // Actualizar admin del tenant si se solicita
  if (update_admin) {
    const admin = db.prepare("SELECT id FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1").get(req.params.id);
    if (admin) {
      const upd = [];
      const vals = [];
      if (admin_name) { upd.push('name = ?'); vals.push(admin_name); }
      if (admin_email) { upd.push('email = ?'); vals.push(admin_email.toLowerCase()); }
      if (admin_password) { upd.push('password_hash = ?'); vals.push(bcrypt.hashSync(admin_password, 12)); }
      if (upd.length) {
        db.prepare(`UPDATE users SET ${upd.join(', ')} WHERE id = ?`).run(...vals, admin.id);
      }
    }
  }

  res.json({ message: 'Tenant actualizado.' });
});

// GET /api/saas/tenants/:id
router.get('/tenants/:id', (req, res) => {
  const db = getDb();
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado.' });
  const users = db.prepare('SELECT id, name, email, role, is_active, created_at FROM users WHERE tenant_id = ?').all(req.params.id);
  res.json({ ...tenant, users });
});

// POST /api/saas/upload-logo - Solo tenant admin
router.post('/upload-logo', authMiddleware, checkTenantActive, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió archivo.' });

  const user = req.user;
  const ext = path.extname(req.file.originalname) || '.png';
  const fileName = `logo-${user.tenantId}-${Date.now()}${ext}`;
  const destPath = path.join(__dirname, '../uploads', fileName);
  const relPath = `/uploads/${fileName}`;

  // Mover archivo
  try {
    fs.renameSync(req.file.path, destPath);
  } catch(e) {
    return res.status(500).json({ error: 'Error al guardar archivo.' });
  }

  // Actualizar tenant con logo y favicon
  const db = getDb();
  db.prepare(`UPDATE tenants SET logo_url = ?, favicon_url = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(relPath, relPath, user.tenantId);

  res.json({ message: 'Logo actualizado.', url: relPath });
});

module.exports = router;
