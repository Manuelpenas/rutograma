const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authMiddleware, requireRole, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/billing/invoices — super admin ve todas, admin ve las suyas
router.get('/invoices', (req, res) => {
  const db = getDb();
  let query, params;

  if (req.user.role === 'superadmin') {
    query = `
      SELECT i.*, t.name AS tenant_name
      FROM invoices i JOIN tenants t ON i.tenant_id = t.id
      ORDER BY i.created_at DESC LIMIT 200
    `;
    params = [];
  } else {
    requireRole('admin')(req, res, () => {});
    query = `
      SELECT i.*, t.name AS tenant_name
      FROM invoices i JOIN tenants t ON i.tenant_id = t.id
      WHERE i.tenant_id = ? ORDER BY i.created_at DESC
    `;
    params = [req.user.tenantId];
  }

  res.json(db.prepare(query).all(...params));
});

// POST /api/billing/invoices (solo superadmin)
router.post('/invoices', requireSuperAdmin, (req, res) => {
  const { tenant_id, amount, currency, description, period_start, period_end, due_date } = req.body;
  if (!tenant_id || !amount) return res.status(400).json({ error: 'tenant_id y monto requeridos.' });

  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO invoices (id, tenant_id, amount, currency, description, period_start, period_end, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenant_id, amount, currency || 'USD', description || null,
    period_start || null, period_end || null, due_date || null);

  res.status(201).json({ id, message: 'Factura creada.' });
});

// PUT /api/billing/invoices/:id/pay (superadmin marca como pagada)
router.put('/invoices/:id/pay', requireSuperAdmin, (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE invoices SET status = 'paid', paid_at = datetime('now'), notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(req.body.notes || null, req.params.id);
  res.json({ message: 'Factura marcada como pagada.' });
});

// PUT /api/billing/invoices/:id/cancel
router.put('/invoices/:id/cancel', requireSuperAdmin, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Factura cancelada.' });
});

// GET /api/billing/stats
router.get('/stats', requireSuperAdmin, (req, res) => {
  const db = getDb();
  res.json({
    total_revenue: db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM invoices WHERE status='paid'").get().t,
    pending_amount: db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM invoices WHERE status='pending'").get().t,
    month_revenue: db.prepare(`
      SELECT COALESCE(SUM(amount),0) AS t FROM invoices
      WHERE status='paid' AND strftime('%Y-%m',paid_at)=strftime('%Y-%m','now')
    `).get().t,
    overdue: db.prepare(`
      SELECT COUNT(*) AS c FROM invoices
      WHERE status='pending' AND due_date < date('now')
    `).get().c
  });
});

module.exports = router;
