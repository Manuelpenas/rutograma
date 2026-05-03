const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, checkTenantActive } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, checkTenantActive);

router.get('/', (req, res) => {
  const db = getDb();
  const vehicles = db.prepare(
    'SELECT * FROM vehicles WHERE tenant_id = ? AND is_active = 1 ORDER BY plate'
  ).all(req.user.tenantId);
  res.json(vehicles);
});

router.post('/', (req, res) => {
  const { plate, type, brand, model, year, capacity } = req.body;
  if (!plate) return res.status(400).json({ error: 'Placa requerida.' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM vehicles WHERE tenant_id = ? AND plate = ?').get(req.user.tenantId, plate.toUpperCase());
  if (existing) return res.status(400).json({ error: 'La placa ya existe.' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO vehicles (id, tenant_id, plate, type, brand, model, year, capacity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.tenantId, plate.toUpperCase(), type || 'bus', brand || null, model || null, year || null, capacity || null);

  res.status(201).json({ id, message: 'Vehículo registrado.' });
});

router.put('/:id', (req, res) => {
  const { plate, type, brand, model, year, capacity, is_active } = req.body;
  const n = v => (v === undefined ? null : v);
  const db = getDb();
  db.prepare(`
    UPDATE vehicles SET
      plate = COALESCE(?, plate),
      type = COALESCE(?, type),
      brand = COALESCE(?, brand),
      model = COALESCE(?, model),
      year = COALESCE(?, year),
      capacity = COALESCE(?, capacity),
      is_active = COALESCE(?, is_active)
    WHERE id = ? AND tenant_id = ?
  `).run(n(plate?.toUpperCase()), n(type), n(brand), n(model), n(year), n(capacity), n(is_active), req.params.id, req.user.tenantId);
  res.json({ message: 'Vehículo actualizado.' });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE vehicles SET is_active = 0 WHERE id = ? AND tenant_id = ?').run(req.params.id, req.user.tenantId);
  res.json({ message: 'Vehículo eliminado.' });
});

module.exports = router;
