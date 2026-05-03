require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initializeDatabase } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Seguridad y utilidades ──────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — solo en producción
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes, intente más tarde.' }
  });
  app.use('/api/', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Demasiados intentos de acceso.' }
  });
  app.use('/api/auth/', authLimiter);
}

// ── Archivos estáticos ──────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!require('fs').existsSync(uploadsDir)) require('fs').mkdirSync(uploadsDir, { recursive: true });
app.use(express.static(path.join(__dirname, 'public')));

// ── Rutas API ───────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/saas',       require('./routes/saas'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/vehicles',   require('./routes/vehicles'));
app.use('/api/drivers',    require('./routes/drivers'));
app.use('/api/trips',      require('./routes/trips'));
app.use('/api/riskpoints', require('./routes/riskPoints'));
app.use('/api/monitoring', require('./routes/monitoring'));
app.use('/api/external',   require('./routes/external'));
app.use('/api/billing',    require('./routes/billing'));

// ── SPA fallback para rutas del frontend ───────────────────────────────────
app.get('/app*',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/monitor*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'monitor.html')));
app.get('/admin*',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Manejador de errores ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

// ── Inicio ──────────────────────────────────────────────────────────────────
initializeDatabase();

app.listen(PORT, () => {
  console.log(`\n🚀 RUTOGRAMA iniciado en http://localhost:${PORT}`);
  console.log(`   Panel Admin: http://localhost:${PORT}/admin`);
  console.log(`   App:         http://localhost:${PORT}/app`);
  console.log(`   Monitor:     http://localhost:${PORT}/monitor\n`);
});

module.exports = app;
