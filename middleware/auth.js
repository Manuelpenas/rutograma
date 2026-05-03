const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado.' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret_dev');
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sin permisos para esta acción.' });
    }
    next();
  };
}

function requireSuperAdmin(req, res, next) {
  return requireRole('superadmin')(req, res, next);
}

// Verifica que el tenant esté activo y no expirado
function checkTenantActive(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado.' });
  if (req.user.role === 'superadmin') return next();

  const db = getDb();
  const tenant = db.prepare('SELECT status, expires_at FROM tenants WHERE id = ?').get(req.user.tenantId);
  if (!tenant || tenant.status !== 'active') {
    return res.status(403).json({ error: 'Licencia suspendida o inactiva. Contacte al administrador.' });
  }
  if (tenant.expires_at && new Date(tenant.expires_at) < new Date()) {
    return res.status(403).json({ error: 'Licencia expirada. Renueve su suscripción.' });
  }
  next();
}

module.exports = { authMiddleware, requireRole, requireSuperAdmin, checkTenantActive };
