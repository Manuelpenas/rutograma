const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, checkTenantActive } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, checkTenantActive);

// GET /api/trips
router.get('/', (req, res) => {
  const db = getDb();
  const { status, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT t.*,
      v.plate AS vehicle_plate, v.type AS vehicle_type,
      d.name AS driver_name, d.license_number
    FROM trips t
    JOIN vehicles v ON t.vehicle_id = v.id
    JOIN drivers d ON t.driver_id = d.id
    WHERE t.tenant_id = ?
  `;
  const params = [req.user.tenantId];

  if (status) { query += ' AND t.status = ?'; params.push(status); }
  query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  res.json(db.prepare(query).all(...params));
});

// GET /api/trips/active
router.get('/active', (req, res) => {
  const db = getDb();
  const trip = db.prepare(`
    SELECT t.*, v.plate AS vehicle_plate, d.name AS driver_name
    FROM trips t
    JOIN vehicles v ON t.vehicle_id = v.id
    JOIN drivers d ON t.driver_id = d.id
    WHERE t.tenant_id = ? AND t.status = 'active'
    ORDER BY t.started_at DESC LIMIT 1
  `).get(req.user.tenantId);
  res.json(trip || null);
});

// GET /api/trips/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const trip = db.prepare(`
    SELECT t.*, v.plate AS vehicle_plate, v.brand, v.model,
      d.name AS driver_name, d.license_number, d.phone AS driver_phone
    FROM trips t
    JOIN vehicles v ON t.vehicle_id = v.id
    JOIN drivers d ON t.driver_id = d.id
    WHERE t.id = ? AND t.tenant_id = ?
  `).get(req.params.id, req.user.tenantId);

  if (!trip) return res.status(404).json({ error: 'Viaje no encontrado.' });

  const alerts = db.prepare('SELECT * FROM trip_alerts WHERE trip_id = ? ORDER BY triggered_at').all(req.params.id);
  res.json({ ...trip, alerts });
});

// POST /api/trips (crear viaje)
router.post('/', (req, res) => {
  const {
    vehicle_id, driver_id,
    origin_name, origin_lat, origin_lng,
    destination_name, destination_lat, destination_lng,
    route_geometry, distance_km, estimated_duration, notes
  } = req.body;

  if (!vehicle_id || !driver_id || !origin_name || !destination_name) {
    return res.status(400).json({ error: 'Vehículo, conductor, origen y destino requeridos.' });
  }

  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO trips (id, tenant_id, vehicle_id, driver_id,
      origin_name, origin_lat, origin_lng,
      destination_name, destination_lat, destination_lng,
      route_geometry, distance_km, estimated_duration, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.tenantId, vehicle_id, driver_id,
    origin_name, origin_lat, origin_lng,
    destination_name, destination_lat, destination_lng,
    route_geometry || null, distance_km || null, estimated_duration || null,
    notes || null, req.user.id);

  res.status(201).json({ id, message: 'Viaje creado.' });
});

// POST /api/trips/:id/start
router.post('/:id/start', (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE trips SET status = 'active', started_at = datetime('now')
    WHERE id = ? AND tenant_id = ? AND status = 'planned'
  `).run(req.params.id, req.user.tenantId);
  res.json({ message: 'Viaje iniciado.' });
});

// POST /api/trips/:id/complete
router.post('/:id/complete', (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE trips SET status = 'completed', completed_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(req.params.id, req.user.tenantId);

  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  const alerts = db.prepare('SELECT * FROM trip_alerts WHERE trip_id = ? ORDER BY triggered_at').all(req.params.id);
  res.json({ message: 'Viaje completado.', trip, alerts });
});

// POST /api/trips/:id/track (enviar posición GPS)
router.post('/:id/track', (req, res) => {
  const { lat, lng, speed, heading, accuracy } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'Coordenadas requeridas.' });

  const db = getDb();
  db.prepare(`
    INSERT INTO trip_tracking (trip_id, lat, lng, speed, heading, accuracy)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.id, lat, lng, speed || null, heading || null, accuracy || null);

  res.json({ ok: true });
});

// POST /api/trips/:id/alert (registrar alerta disparada)
router.post('/:id/alert', (req, res) => {
  const { risk_point_id, alert_type, alert_source, severity, lat, lng, description, distance_m } = req.body;
  const db = getDb();
  db.prepare(`
    INSERT INTO trip_alerts (trip_id, risk_point_id, alert_type, alert_source, severity, lat, lng, description, distance_m)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, risk_point_id || null, alert_type, alert_source || 'custom',
    severity || 'medium', lat || null, lng || null, description || null, distance_m || null);

  res.json({ ok: true });
});

// GET /api/trips/:id/track (historial GPS)
router.get('/:id/track', (req, res) => {
  const db = getDb();
  const points = db.prepare('SELECT * FROM trip_tracking WHERE trip_id = ? ORDER BY recorded_at').all(req.params.id);
  res.json(points);
});

// GET /api/trips/:id/summary (resumen del viaje)
router.get('/:id/summary', (req, res) => {
  const db = getDb();
  const trip = db.prepare(`
    SELECT t.*, v.plate, v.brand, v.model, d.name AS driver_name
    FROM trips t
    JOIN vehicles v ON t.vehicle_id = v.id
    JOIN drivers d ON t.driver_id = d.id
    WHERE t.id = ? AND t.tenant_id = ?
  `).get(req.params.id, req.user.tenantId);

  if (!trip) return res.status(404).json({ error: 'Viaje no encontrado.' });

  const alerts = db.prepare('SELECT * FROM trip_alerts WHERE trip_id = ? ORDER BY triggered_at').all(req.params.id);
  const trackCount = db.prepare('SELECT COUNT(*) AS c FROM trip_tracking WHERE trip_id = ?').get(req.params.id).c;

  const summary = {
    trip,
    total_alerts: alerts.length,
    alerts_by_severity: {
      high: alerts.filter(a => a.severity === 'high').length,
      medium: alerts.filter(a => a.severity === 'medium').length,
      low: alerts.filter(a => a.severity === 'low').length
    },
    alerts_by_type: alerts.reduce((acc, a) => {
      acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
      return acc;
    }, {}),
    gps_points: trackCount,
    alerts
  };

  res.json(summary);
});

// POST /api/trips/:id/report-risk - Reportar riesgo en ruta activa
router.post('/:id/report-risk', (req, res) => {
  const { risk_point_id, lat, lng, notes } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat y lng requeridos.' });

  const db = getDb();
  const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenantId);
  if (!trip) return res.status(404).json({ error: 'Viaje no encontrado.' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO trip_alerts (id, trip_id, alert_type, severity, lat, lng, notes, triggered_at)
    VALUES (?, ?, 'manual_risk', 'medium', ?, ?, ?, datetime('now'))
  `).run(id, req.params.id, parseFloat(lat), parseFloat(lng), notes || null);

  // Si se proporciona risk_point_id, vincular
  if (risk_point_id) {
    db.prepare('UPDATE trip_alerts SET risk_point_id = ? WHERE id = ?').run(risk_point_id, id);
  }

  res.status(201).json({ id, message: 'Riesgo reportado en la ruta.' });
});

module.exports = router;
