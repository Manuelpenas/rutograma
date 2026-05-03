/**
 * test.js — Suite de pruebas de la API de Rutograma
 */
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data)  headers['Content-Length'] = Buffer.byteLength(data);

    const r = http.request(
      { hostname: 'localhost', port: 3000, path, method, headers },
      (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
          catch { resolve({ status: res.statusCode, body: d }); }
        });
      }
    );
    r.on('error', e => resolve({ status: 0, body: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

let passed = 0, failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✅  ${name}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  ❌  ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function run() {
  console.log('\n══════════════════════════════════════════════');
  console.log('   RUTOGRAMA — Suite de Pruebas Completa');
  console.log('══════════════════════════════════════════════\n');

  // Suffix único por ejecución para evitar conflictos de UNIQUE
  const ts = Date.now().toString().slice(-6);

  let adminToken = '', demoToken = '', tenantId = '', tripId = '', sessionId = '';
  let vehicleId = '', driverId = '';

  // ── 1. Páginas HTML ─────────────────────────────────────────────────────
  console.log('📄 PÁGINAS HTML');
  let r;
  r = await req('GET', '/');        check('Login page (GET /)',       r.status === 200);
  r = await req('GET', '/app');     check('App page (GET /app)',      r.status === 200);
  r = await req('GET', '/monitor'); check('Monitor (GET /monitor)',   r.status === 200);
  r = await req('GET', '/admin');   check('Admin (GET /admin)',       r.status === 200);

  // ── 2. Autenticación ────────────────────────────────────────────────────
  console.log('\n🔐 AUTENTICACIÓN');
  r = await req('POST', '/api/auth/login', { email: 'admin@rutograma.com', password: 'Admin123!' });
  adminToken = r.body.token || '';
  check('Login super admin', r.status === 200 && !!adminToken, 'rol=' + r.body.user?.role);

  r = await req('POST', '/api/auth/login', { email: 'admin@rutograma.com', password: 'incorrecta' });
  check('Login contraseña incorrecta → 401', r.status === 401);

  r = await req('POST', '/api/auth/login', { email: 'no@existe.com', password: '123' });
  check('Login usuario no existente → 401', r.status === 401);

  r = await req('GET', '/api/auth/me', null, adminToken);
  check('/api/auth/me con token', r.status === 200, r.body.name);

  r = await req('GET', '/api/auth/me', null, '');
  check('/api/auth/me sin token → 401', r.status === 401);

  // ── 3. SaaS — Tenants ───────────────────────────────────────────────────
  console.log('\n🏢 SAAS — TENANTS');
  r = await req('GET', '/api/saas/stats', null, adminToken);
  check('GET /api/saas/stats', r.status === 200, 'tenants=' + r.body.totalTenants);

  r = await req('POST', '/api/saas/tenants', {
    name: `Empresa Demo ${ts}`,
    domain: `demo${ts}.rutograma.com`,
    plan: 'basic',
    admin_name: 'Admin Demo',
    admin_email: `admin${ts}@demo.com`,
    admin_password: 'Demo1234!'
  }, adminToken);
  tenantId = r.body.id || '';
  check('Crear tenant', r.status === 201, tenantId.slice(0, 8) + '...');

  r = await req('GET', '/api/saas/tenants', null, adminToken);
  check('Listar tenants', r.status === 200 && Array.isArray(r.body));

  r = await req('PUT', '/api/saas/tenants/' + tenantId, { plan: 'pro' }, adminToken);
  check('Actualizar tenant', r.status === 200);

  // ── 4. Login tenant demo ────────────────────────────────────────────────
  console.log('\n🔑 LOGIN TENANT DEMO');
  r = await req('POST', '/api/auth/login', { email: `admin${ts}@demo.com`, password: 'Demo1234!' });
  demoToken = r.body.token || '';
  check('Login admin demo', r.status === 200 && !!demoToken, 'rol=' + r.body.user?.role);

  // ── 5. Vehículos ────────────────────────────────────────────────────────
  console.log('\n🚌 VEHÍCULOS');
  const plate = `TRF${ts}`;
  r = await req('POST', '/api/vehicles', { plate, type: 'bus', brand: 'Mercedes', model: 'Sprinter', year: 2022 }, demoToken);
  vehicleId = r.body.id || '';
  check('Crear vehículo', r.status === 201, plate);

  r = await req('POST', '/api/vehicles', { plate, type: 'bus' }, demoToken);
  check('Placa duplicada → 400', r.status === 400);

  r = await req('GET', '/api/vehicles', null, demoToken);
  check('Listar vehículos', r.status === 200 && r.body.length >= 1, r.body.length + ' vehículo(s)');

  r = await req('PUT', '/api/vehicles/' + vehicleId, { brand: 'Volvo' }, demoToken);
  check('Actualizar vehículo', r.status === 200);

  // ── 6. Conductores ──────────────────────────────────────────────────────
  console.log('\n👨‍✈️ CONDUCTORES');
  r = await req('POST', '/api/drivers', { name: 'Juan Pérez', license_number: 'C1-001', phone: '3001112233' }, demoToken);
  driverId = r.body.id || '';
  check('Crear conductor', r.status === 201);

  r = await req('GET', '/api/drivers', null, demoToken);
  check('Listar conductores', r.status === 200 && r.body.length >= 1, r.body.length + ' conductor(es)');

  // ── 7. Puntos de Riesgo ─────────────────────────────────────────────────
  console.log('\n⚠️  PUNTOS DE RIESGO');
  r = await req('POST', '/api/riskpoints', { type: 'school', name: 'Escuela Central', lat: 4.6097, lng: -74.0817, severity: 'medium', description: 'Zona escolar activa' }, demoToken);
  check('Crear punto de riesgo (escuela)', r.status === 201);

  r = await req('POST', '/api/riskpoints', { type: 'curve', lat: 4.6150, lng: -74.0800, severity: 'high', description: 'Curva ciega km 3' }, demoToken);
  check('Crear punto de riesgo (curva)', r.status === 201);

  r = await req('POST', '/api/riskpoints', { type: 'animal_crossing', lat: 4.6080, lng: -74.0830, severity: 'medium' }, demoToken);
  check('Crear punto de riesgo (animales)', r.status === 201);

  r = await req('POST', '/api/riskpoints', { type: 'tipo_invalido', lat: 4.61, lng: -74.08 }, demoToken);
  check('Tipo inválido → 400', r.status === 400);

  r = await req('GET', '/api/riskpoints', null, demoToken);
  check('Listar todos los puntos', r.status === 200, r.body.length + ' punto(s)');

  r = await req('GET', '/api/riskpoints/nearby?lat=4.6097&lng=-74.0817&radius_km=5', null, demoToken);
  check('Puntos cercanos (radio 5km)', r.status === 200, r.body.length + ' cercano(s)');

  // ── 8. Viajes ───────────────────────────────────────────────────────────
  console.log('\n🗺️  VIAJES');
  r = await req('POST', '/api/trips', {
    vehicle_id: vehicleId, driver_id: driverId,
    origin_name: 'Terminal Norte', origin_lat: 4.6097, origin_lng: -74.0817,
    destination_name: 'Centro Bogotá', destination_lat: 4.5981, destination_lng: -74.0759,
    distance_km: 2.5, estimated_duration: 15
  }, demoToken);
  tripId = r.body.id || '';
  check('Crear viaje', r.status === 201, tripId.slice(0, 8) + '...');

  r = await req('POST', '/api/trips', { vehicle_id: vehicleId }, demoToken);
  check('Viaje sin destino → 400', r.status === 400);

  r = await req('GET', '/api/trips', null, demoToken);
  check('Listar viajes', r.status === 200, r.body.length + ' viaje(s)');

  r = await req('POST', '/api/trips/' + tripId + '/start', null, demoToken);
  check('Iniciar viaje', r.status === 200);

  r = await req('GET', '/api/trips/active', null, demoToken);
  check('GET viaje activo', r.status === 200 && r.body !== null, r.body?.destination_name);

  r = await req('POST', '/api/trips/' + tripId + '/track', { lat: 4.6100, lng: -74.0820, speed: 42, heading: 90 }, demoToken);
  check('Tracking GPS', r.status === 200);

  r = await req('POST', '/api/trips/' + tripId + '/alert', { alert_type: 'school', severity: 'medium', distance_m: 180 }, demoToken);
  check('Registrar alerta en viaje', r.status === 200);

  r = await req('GET', '/api/trips/' + tripId + '/track', null, demoToken);
  check('Historial GPS del viaje', r.status === 200 && r.body.length >= 1, r.body.length + ' punto(s)');

  r = await req('POST', '/api/trips/' + tripId + '/complete', null, demoToken);
  check('Completar viaje', r.status === 200);

  r = await req('GET', '/api/trips/' + tripId + '/summary', null, demoToken);
  check('Resumen del viaje', r.status === 200 && r.body.total_alerts !== undefined, 'alertas=' + r.body.total_alerts);

  // ── 9. Monitoreo ────────────────────────────────────────────────────────
  console.log('\n👁️  MONITOREO');
  r = await req('POST', '/api/monitoring/start', { vehicle_id: vehicleId, driver_id: driverId, origin_name: 'Base', destination_name: 'Terminal Sur' }, demoToken);
  sessionId = r.body.id || '';
  check('Iniciar sesión de monitoreo', r.status === 201, sessionId.slice(0, 8) + '...');

  r = await req('GET', '/api/monitoring', null, demoToken);
  check('Listar sesiones de monitoreo', r.status === 200);

  r = await req('POST', '/api/monitoring/' + sessionId + '/end', { notes: 'Ruta sin incidentes' }, demoToken);
  check('Finalizar sesión de monitoreo', r.status === 200, 'puntos=' + r.body.session?.risk_points_added);

  r = await req('GET', '/api/monitoring/' + sessionId, null, demoToken);
  check('Detalle de sesión', r.status === 200);

  // ── 10. Facturación ─────────────────────────────────────────────────────
  console.log('\n💳 FACTURACIÓN');
  r = await req('POST', '/api/billing/invoices', { tenant_id: tenantId, amount: 49.99, currency: 'USD', description: 'Licencia Basic — Mayo 2026', due_date: '2026-05-30' }, adminToken);
  const invoiceId = r.body.id || '';
  check('Crear factura', r.status === 201);

  r = await req('GET', '/api/billing/invoices', null, adminToken);
  check('Listar facturas', r.status === 200, r.body.length + ' factura(s)');

  r = await req('PUT', '/api/billing/invoices/' + invoiceId + '/pay', { notes: 'Transferencia' }, adminToken);
  check('Marcar factura como pagada', r.status === 200);

  r = await req('GET', '/api/billing/stats', null, adminToken);
  check('Stats de billing', r.status === 200, 'total=$' + r.body.total_revenue);

  // ── 11. Usuarios ────────────────────────────────────────────────────────
  console.log('\n👥 USUARIOS');
  r = await req('POST', '/api/users', { name: 'Monitor 1', email: `monitor${ts}@demo.com`, password: 'Mon1234!', role: 'monitor' }, demoToken);
  const userId = r.body.id || '';
  check('Crear usuario (monitor)', r.status === 201);

  r = await req('GET', '/api/users', null, demoToken);
  check('Listar usuarios del tenant', r.status === 200, r.body.length + ' usuario(s)');

  r = await req('PUT', '/api/users/' + userId, { is_active: 0 }, demoToken);
  check('Desactivar usuario', r.status === 200);

  // ── 12. Seguridad ───────────────────────────────────────────────────────
  console.log('\n🔒 SEGURIDAD');
  r = await req('GET', '/api/saas/tenants', null, demoToken);
  check('Admin demo no puede ver panel SaaS → 403', r.status === 403);

  r = await req('GET', '/api/trips', null, '');
  check('Sin token → 401', r.status === 401);

  r = await req('GET', '/api/trips', null, 'token.invalido.aqui');
  check('Token inválido → 401', r.status === 401);

  // ── Resumen final ────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n══════════════════════════════════════════════');
  console.log(`   RESULTADO: ${passed}/${total} pruebas pasadas`);
  if (failed === 0) {
    console.log('   🎉 ¡TODAS LAS PRUEBAS PASARON!');
  } else {
    console.log(`   ⚠️  ${failed} prueba(s) fallaron`);
  }
  console.log('══════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Error fatal:', e.message); process.exit(1); });
