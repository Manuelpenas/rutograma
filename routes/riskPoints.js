const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, checkTenantActive } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, checkTenantActive);

const RISK_TYPES = [
  'school', 'hospital', 'curve', 'animal_crossing', 'accident',
  'construction', 'traffic', 'weather_rain', 'weather_fog', 'weather_ice',
  'speed_bump', 'pedestrian_crossing', 'toll', 'police', 'road_closed',
  'pothole', 'flood', 'landslide', 'other'
];

// GET /api/riskpoints — todos los puntos del tenant
router.get('/', (req, res) => {
  const db = getDb();
  const { type, severity, active_only } = req.query;

  let query = 'SELECT * FROM risk_points WHERE tenant_id = ?';
  const params = [req.user.tenantId];

  if (type)        { query += ' AND type = ?';     params.push(type); }
  if (severity)    { query += ' AND severity = ?'; params.push(severity); }
  if (active_only) {
    query += " AND (is_permanent = 1 OR (valid_until IS NULL OR valid_until > datetime('now')))";
  }
  query += ' ORDER BY created_at DESC';

  res.json(db.prepare(query).all(...params));
});

// GET /api/riskpoints/nearby — puntos cercanos a una coordenada
router.get('/nearby', (req, res) => {
  const { lat, lng, radius_km = 5 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat y lng requeridos.' });

  const db = getDb();
  const latF = parseFloat(lat), lngF = parseFloat(lng), rad = parseFloat(radius_km);

  // Bounding box aproximado (1 grado ≈ 111 km)
  const delta = rad / 111;

  const points = db.prepare(`
    SELECT *,
      (((lat - ?) * (lat - ?)) + ((lng - ?) * (lng - ?))) AS dist_sq
    FROM risk_points
    WHERE tenant_id = ?
      AND lat BETWEEN ? AND ?
      AND lng BETWEEN ? AND ?
      AND (is_permanent = 1 OR valid_until IS NULL OR valid_until > datetime('now'))
    ORDER BY dist_sq
  `).all(latF, latF, lngF, lngF, req.user.tenantId,
    latF - delta, latF + delta, lngF - delta, lngF + delta);

  // Filtrar por distancia real (Haversine simplificado)
  const filtered = points.filter(p => {
    const dLat = (p.lat - latF) * Math.PI / 180;
    const dLng = (p.lng - lngF) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(latF*Math.PI/180) * Math.cos(p.lat*Math.PI/180) * Math.sin(dLng/2)**2;
    const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    p.distance_km = Math.round(distKm * 1000) / 1000;
    return distKm <= rad;
  });

  res.json(filtered);
});

// POST /api/riskpoints
router.post('/', (req, res) => {
  const {
    type, name, description, lat, lng,
    severity, is_permanent, valid_until, radius_meters
  } = req.body;

  if (!type || !lat || !lng) return res.status(400).json({ error: 'Tipo, lat y lng requeridos.' });
  if (!RISK_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de riesgo inválido.' });

  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO risk_points
      (id, tenant_id, type, name, description, lat, lng, severity,
       is_permanent, valid_until, radius_meters, source, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
  `).run(id, req.user.tenantId, type, name || null, description || null,
    parseFloat(lat), parseFloat(lng), severity || 'medium',
    is_permanent !== false ? 1 : 0, valid_until || null,
    radius_meters || 250, req.user.id);

  res.status(201).json({ id, message: 'Punto de riesgo registrado.' });
});

// PUT /api/riskpoints/:id
router.put('/:id', (req, res) => {
  const { name, description, severity, is_permanent, valid_until, radius_meters } = req.body;
  const n = v => (v === undefined ? null : v);
  const db = getDb();
  db.prepare(`
    UPDATE risk_points SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      severity = COALESCE(?, severity),
      is_permanent = COALESCE(?, is_permanent),
      valid_until = COALESCE(?, valid_until),
      radius_meters = COALESCE(?, radius_meters),
      updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(n(name), n(description), n(severity), n(is_permanent), n(valid_until), n(radius_meters),
    req.params.id, req.user.tenantId);

  res.json({ message: 'Punto actualizado.' });
});

// DELETE /api/riskpoints/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM risk_points WHERE id = ? AND tenant_id = ?').run(req.params.id, req.user.tenantId);
  res.json({ message: 'Punto eliminado.' });
});

module.exports = router;
