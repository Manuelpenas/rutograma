const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, checkTenantActive } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, checkTenantActive);

router.get('/', (req, res) => {
  const db = getDb();
  const drivers = db.prepare(
    'SELECT * FROM drivers WHERE tenant_id = ? AND is_active = 1 ORDER BY name'
  ).all(req.user.tenantId);
  res.json(drivers);
});

router.post('/', (req, res) => {
  const { name, license_number, license_type, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre del conductor requerido.' });

  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO drivers (id, tenant_id, name, license_number, license_type, phone, email)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.tenantId, name, license_number || null, license_type || null, phone || null, email || null);

  res.status(201).json({ id, message: 'Conductor registrado.' });
});

router.put('/:id', (req, res) => {
  const { name, license_number, license_type, phone, email, is_active } = req.body;
  const n = v => (v === undefined ? null : v);
  const db = getDb();
  db.prepare(`
    UPDATE drivers SET
      name = COALESCE(?, name),
      license_number = COALESCE(?, license_number),
      license_type = COALESCE(?, license_type),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      is_active = COALESCE(?, is_active)
    WHERE id = ? AND tenant_id = ?
  `).run(n(name), n(license_number), n(license_type), n(phone), n(email), n(is_active), req.params.id, req.user.tenantId);
  res.json({ message: 'Conductor actualizado.' });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE drivers SET is_active = 0 WHERE id = ? AND tenant_id = ?').run(req.params.id, req.user.tenantId);
  res.json({ message: 'Conductor eliminado.' });
});

module.exports = router;
