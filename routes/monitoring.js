const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, checkTenantActive } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, checkTenantActive);

// GET /api/monitoring
router.get('/', (req, res) => {
  const db = getDb();
  const sessions = db.prepare(`
    SELECT ms.*,
      u.name AS monitor_name,
      d.name AS driver_name,
      v.plate AS vehicle_plate
    FROM monitoring_sessions ms
    LEFT JOIN users u ON ms.monitor_user_id = u.id
    LEFT JOIN drivers d ON ms.driver_id = d.id
    LEFT JOIN vehicles v ON ms.vehicle_id = v.id
    WHERE ms.tenant_id = ?
    ORDER BY ms.started_at DESC
    LIMIT 100
  `).all(req.user.tenantId);
  res.json(sessions);
});

// GET /api/monitoring/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT ms.*, u.name AS monitor_name, d.name AS driver_name, v.plate AS vehicle_plate
    FROM monitoring_sessions ms
    LEFT JOIN users u ON ms.monitor_user_id = u.id
    LEFT JOIN drivers d ON ms.driver_id = d.id
    LEFT JOIN vehicles v ON ms.vehicle_id = v.id
    WHERE ms.id = ? AND ms.tenant_id = ?
  `).get(req.params.id, req.user.tenantId);

  if (!session) return res.status(404).json({ error: 'Sesión no encontrada.' });

  // Puntos registrados en esta sesión
  const riskPoints = db.prepare(`
    SELECT * FROM risk_points
    WHERE tenant_id = ? AND created_by = ?
      AND created_at >= ? AND (? IS NULL OR created_at <= ?)
    ORDER BY created_at
  `).all(req.user.tenantId, req.user.id, session.started_at, session.ended_at, session.ended_at);

  res.json({ ...session, risk_points: riskPoints });
});

// POST /api/monitoring/start
router.post('/start', (req, res) => {
  const { driver_id, vehicle_id, trip_id, origin_name, destination_name } = req.body;

  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO monitoring_sessions
      (id, tenant_id, trip_id, monitor_user_id, driver_id, vehicle_id, origin_name, destination_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.tenantId, trip_id || null, req.user.id,
    driver_id || null, vehicle_id || null, origin_name || null, destination_name || null);

  res.status(201).json({ id, message: 'Sesión de monitoreo iniciada.' });
});

// POST /api/monitoring/:id/end
router.post('/:id/end', (req, res) => {
  const { notes, distance_km } = req.body;
  const db = getDb();

  // Contar puntos de riesgo agregados durante la sesión
  const session = db.prepare('SELECT * FROM monitoring_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada.' });

  const riskCount = db.prepare(`
    SELECT COUNT(*) AS c FROM risk_points
    WHERE tenant_id = ? AND created_by = ? AND created_at >= ?
  `).get(req.user.tenantId, req.user.id, session.started_at).c;

  db.prepare(`
    UPDATE monitoring_sessions SET
      ended_at = datetime('now'),
      notes = COALESCE(?, notes),
      distance_km = COALESCE(?, distance_km),
      risk_points_added = ?
    WHERE id = ? AND tenant_id = ?
  `).run(notes !== undefined ? notes : null, distance_km !== undefined ? distance_km : null, riskCount, req.params.id, req.user.tenantId);

  // Construir resumen
  const updatedSession = db.prepare(`
    SELECT ms.*, u.name AS monitor_name, d.name AS driver_name, v.plate AS vehicle_plate
    FROM monitoring_sessions ms
    LEFT JOIN users u ON ms.monitor_user_id = u.id
    LEFT JOIN drivers d ON ms.driver_id = d.id
    LEFT JOIN vehicles v ON ms.vehicle_id = v.id
    WHERE ms.id = ?
  `).get(req.params.id);

  const riskPoints = db.prepare(`
    SELECT * FROM risk_points
    WHERE tenant_id = ? AND created_by = ? AND created_at >= ?
    ORDER BY created_at
  `).all(req.user.tenantId, req.user.id, session.started_at);

  res.json({ session: updatedSession, risk_points: riskPoints });
});

// PUT /api/monitoring/:id/update-count
router.put('/:id/update-count', (req, res) => {
  const { risk_points_added, alerts_triggered } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE monitoring_sessions SET
      risk_points_added = COALESCE(?, risk_points_added),
      alerts_triggered = COALESCE(?, alerts_triggered)
    WHERE id = ? AND tenant_id = ?
  `).run(risk_points_added, alerts_triggered, req.params.id, req.user.tenantId);
  res.json({ ok: true });
});

module.exports = router;
