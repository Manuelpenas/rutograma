const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, requireRole, checkTenantActive } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, checkTenantActive);

// GET /api/users
router.get('/', (req, res) => {
  const db = getDb();
  const tenantId = req.user.role === 'superadmin' ? req.query.tenant_id : req.user.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id requerido.' });

  const users = db.prepare(`
    SELECT id, name, email, role, phone, is_active, last_login, created_at
    FROM users WHERE tenant_id = ? ORDER BY name
  `).all(tenantId);
  res.json(users);
});

// POST /api/users
router.post('/', requireRole('superadmin', 'admin'), (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña requeridos.' });

  const tenantId = req.user.role === 'superadmin' && req.body.tenant_id
    ? req.body.tenant_id : req.user.tenantId;

  const db = getDb();

  // Verificar límite de usuarios
  const tenant = db.prepare('SELECT max_users FROM tenants WHERE id = ?').get(tenantId);
  const count = db.prepare('SELECT COUNT(*) AS c FROM users WHERE tenant_id = ? AND is_active = 1').get(tenantId).c;
  if (count >= tenant.max_users) {
    return res.status(400).json({ error: `Límite de usuarios alcanzado (${tenant.max_users}). Actualice su plan.` });
  }

  const existing = db.prepare('SELECT id FROM users WHERE tenant_id = ? AND email = ?').get(tenantId, email.toLowerCase());
  if (existing) return res.status(400).json({ error: 'El email ya está registrado en este tenant.' });

  const hash = bcrypt.hashSync(password, 12);
  const id = uuidv4();
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, email.toLowerCase(), hash, name, role || 'user', phone || null);

  res.status(201).json({ id, message: 'Usuario creado exitosamente.' });
});

// PUT /api/users/:id
router.put('/:id', requireRole('superadmin', 'admin'), (req, res) => {
  const { name, role, phone, is_active, password } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (req.user.role !== 'superadmin' && user.tenant_id !== req.user.tenantId) {
    return res.status(403).json({ error: 'Sin permisos.' });
  }

  if (password) {
    const hash = bcrypt.hashSync(password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  }

  const n = v => (v === undefined ? null : v);
  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      role = COALESCE(?, role),
      phone = COALESCE(?, phone),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(n(name), n(role), n(phone), n(is_active), req.params.id);

  res.json({ message: 'Usuario actualizado.' });
});

// DELETE /api/users/:id — Eliminación definitiva
router.delete('/:id', requireRole('superadmin', 'admin'), (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (req.user.role !== 'superadmin' && user.tenant_id !== req.user.tenantId) {
    return res.status(403).json({ error: 'Sin permisos.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Usuario eliminado definitivamente.' });
});

module.exports = router;
