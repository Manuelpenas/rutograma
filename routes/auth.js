const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos.' });

  const db = getDb();
  const user = db.prepare(`
    SELECT u.*, t.name AS tenant_name, t.status AS tenant_status,
           t.expires_at, t.openweather_api_key, t.domain,
           t.logo_url, t.favicon_url, t.primary_color
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE u.email = ? AND u.is_active = 1
  `).get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  if (user.tenant_status !== 'active') {
    return res.status(403).json({ error: 'Cuenta suspendida. Contacte al administrador.' });
  }
  if (user.expires_at && new Date(user.expires_at) < new Date() && user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Licencia expirada. Renueve su suscripción.' });
  }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  const token = jwt.sign(
    {
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantName: user.tenant_name,
      openweatherKey: user.openweather_api_key,
      logoUrl: user.logo_url,
      faviconUrl: user.favicon_url,
      primaryColor: user.primary_color
    },
    process.env.JWT_SECRET || 'secret_dev',
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      domain: user.domain,
      logoUrl: user.logo_url,
      faviconUrl: user.favicon_url,
      primaryColor: user.primary_color
    }
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.tenant_id, u.phone,
           t.name AS tenant_name, t.plan, t.status AS tenant_status,
           t.expires_at, t.domain, t.openweather_api_key,
           t.logo_url, t.favicon_url, t.primary_color
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE u.id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(user);
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseña actual y nueva requeridas.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Contraseña actualizada correctamente.' });
});

module.exports = router;
