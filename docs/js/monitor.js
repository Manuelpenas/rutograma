/**
 * monitor.js — Lógica del módulo Monitor
 */

const MonState = {
  map: null,
  userLat: null, userLng: null,
  sessionId: null,
  sessionStartTime: null,
  timerInterval: null,
  watchId: null,
  pendingLat: null, pendingLng: null,
  selectedRiskType: null,
  riskMarkers: [],
  pointsAdded: 0,
  vehicles: [], drivers: []
};

// ── Inicialización ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const user = Auth.check();
  if (!user) return;
  if (!['monitor', 'admin', 'superadmin'].includes(user.role)) {
    showToast('Sin permisos para acceder al módulo Monitor.', 'warning');
    setTimeout(() => location.href = '/app', 2000);
    return;
  }
  document.getElementById('userBadge').textContent = user.name;
  initMap();
  getCurrentPosition();
  buildRiskTypeGrid();
  await loadVehiclesAndDrivers();
});

let monTileLayer = null;

function initMap() {
  MonState.map = L.map('map', { zoomControl: false }).setView([4.6097, -74.0817], 13);
  switchMapStyleMon('carto');
  L.control.zoom({ position: 'bottomleft' }).addTo(MonState.map);

  // Clic en mapa para agregar punto de riesgo
  MonState.map.on('click', onMapClick);
}

const MON_MAP_STYLES = {
  openstreet: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { attribution: '© OpenStreetMap', maxZoom: 19 }
  },
  carto: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: { attribution: '© OSM © CARTO', subdomains: 'abcd', maxZoom: 19 }
  },
  satellite: {
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    options: { attribution: '© Google', maxZoom: 20 }
  }
};

// Cargar preferencia al iniciar
const savedMonStyle = localStorage.getItem('rg_mon_map_style');
if (savedMonStyle && MON_MAP_STYLES[savedMonStyle]) {
  // Se aplica en initMap
}

function switchMapStyleMon(styleKey) {
  const style = MON_MAP_STYLES[styleKey];
  if (!style) return;
  if (monTileLayer) MonState.map.removeLayer(monTileLayer);
  monTileLayer = L.tileLayer(style.url, style.options).addTo(MonState.map);
  localStorage.setItem('rg_mon_map_style', styleKey);
  // Actualizar UI
  document.querySelectorAll('#mapStyleMon .style-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.style === styleKey);
  });
}

function toggleHistoryFilter() {
  const el = document.getElementById('historyFilter');
  if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

async function loadHistoryAlerts() {
  const date = document.getElementById('histDate')?.value;
  const type = document.getElementById('histType')?.value;
  const list = document.getElementById('historyList');
  if (!list) return;

  list.innerHTML = '<div class="spinner" style="padding:20px"></div>';

  try {
    const tenantId = Auth.getUser()?.tenantId;
    if (!tenantId) return;

    let query = '/riskpoints?';
    if (date) query += `date=${date}&`;
    if (type) query += `type=${type}&`;

    const points = await api(query);
    if (!points.length) { list.innerHTML = '<div style="font-size:.82rem;color:#888;text-align:center;padding:10px">Sin alertas en este período</div>'; return; }

    list.innerHTML = points.slice(0, 50).map(p => {
      const rc = getRiskConfig(p.type);
      const sc = getSeverityConfig(p.severity);
      return `<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;display:flex;gap:8px;align-items:center">
        <span style="font-size:1.1rem">${rc.icon}</span>
        <div style="flex:1;font-size:.8rem">
          <div style="font-weight:600">${rc.label}</div>
          <div style="color:#888">${p.created_at ? fmtDate(p.created_at) : ''}</div>
        </div>
        <span class="badge badge-${p.severity==='low'?'success':p.severity==='medium'?'warning':'danger'}" style="font-size:.7rem">${sc.label}</span>
      </div>`;
    }).join('');
  } catch { list.innerHTML = '<div style="color:#888;padding:10px">Error cargando histórico</div>'; }
}

function toggleMapStyleSelectorMon() {
  const sel = document.getElementById('mapStyleMon');
  if (sel) sel.style.display = sel.style.display === 'block' ? 'none' : 'block';
}

// Cargar preferencia al iniciar
const savedMonStyle = localStorage.getItem('rg_mon_map_style');
if (savedMonStyle && MON_MAP_STYLES[savedMonStyle]) {
  // Se aplica en initMap
}

function getCurrentPosition() {
  const badge = document.getElementById('userBadge');
  if (!navigator.geolocation) {
    showToast('GPS no disponible en este dispositivo.', 'warning');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    MonState.userLat = pos.coords.latitude;
    MonState.userLng = pos.coords.longitude;
    placeUserMarker(MonState.userLat, MonState.userLng);
    MonState.map.setView([MonState.userLat, MonState.userLng], 15);
    loadExistingRisks(MonState.userLat, MonState.userLng);
    showToast('📍 Ubicación GPS obtenida.', 'info', 2000);
  }, err => {
    const msgs = {
      1: '⚠️ Permiso de GPS denegado. Active la ubicación en su navegador.',
      2: '⚠️ No se pudo determinar la ubicación GPS.',
      3: '⚠️ Tiempo de espera del GPS agotado.'
    };
    showToast(msgs[err.code] || '⚠️ Error al obtener GPS.', 'warning', 5000);
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}

function placeUserMarker(lat, lng) {
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;background:#1a73e8;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(26,115,232,.3)"></div>`,
    iconSize: [20, 20], iconAnchor: [10, 10]
  });
  if (MonState.userMarker) MonState.userMarker.setLatLng([lat, lng]);
  else MonState.userMarker = L.marker([lat, lng], { icon }).addTo(MonState.map);
}

function centerOnMe() {
  if (MonState.userLat) MonState.map.setView([MonState.userLat, MonState.userLng], 16);
}

// ── Cargar vehículos y conductores ─────────────────────────────────────────
async function loadVehiclesAndDrivers() {
  try {
    [MonState.vehicles, MonState.drivers] = await Promise.all([api('/vehicles'), api('/drivers')]);
    renderMonVehicleCards();
    renderMonDriverCards();
  } catch {}
}

function renderMonVehicleCards() {
  const grid = document.getElementById('selVehicleGrid');
  if (!grid) return;
  if (!MonState.vehicles.length) {
    grid.innerHTML = '<p class="text-muted" style="font-size:.82rem;grid-column:1/-1">Sin vehículos registrados.</p>';
    return;
  }
  grid.innerHTML = MonState.vehicles.map(v => `
    <div class="select-card" id="mvc-${v.id}" onclick="selectMonVehicle('${v.id}')">
      <div class="sc-icon">🚌</div>
      <div class="sc-label">${v.plate}</div>
      <div class="sc-sub">${[v.brand, v.model].filter(Boolean).join(' ') || v.type}</div>
    </div>`).join('');
}

function renderMonDriverCards() {
  const grid = document.getElementById('selDriverGrid');
  if (!grid) return;
  if (!MonState.drivers.length) {
    grid.innerHTML = '<p class="text-muted" style="font-size:.82rem;grid-column:1/-1">Sin conductores registrados.</p>';
    return;
  }
  grid.innerHTML = MonState.drivers.map(d => `
    <div class="select-card" id="mdc-${d.id}" onclick="selectMonDriver('${d.id}')">
      <div class="sc-icon">👤</div>
      <div class="sc-label">${d.name}</div>
      <div class="sc-sub">${d.license_number || 'Sin licencia'}</div>
    </div>`).join('');
}

function selectMonVehicle(id) {
  document.querySelectorAll('[id^="mvc-"]').forEach(c => c.classList.remove('selected'));
  document.getElementById('mvc-' + id)?.classList.add('selected');
  document.getElementById('selVehicle').value = id;
}

function selectMonDriver(id) {
  document.querySelectorAll('[id^="mdc-"]').forEach(c => c.classList.remove('selected'));
  document.getElementById('mdc-' + id)?.classList.add('selected');
  document.getElementById('selDriver').value = id;
}

// ── Grid de tipos de riesgo ────────────────────────────────────────────────
function buildRiskTypeGrid() {
  const types = Object.entries(RISK_CONFIG).slice(0, 18);
  const grid = document.getElementById('riskTypeGrid');
  grid.innerHTML = types.map(([key, rc]) => `
    <div class="rtype-btn" id="rt-${key}" onclick="selectRiskType('${key}')">
      <span class="icon">${rc.icon}</span>
      <span>${rc.label}</span>
    </div>
  `).join('');
}

function selectRiskType(type) {
  document.querySelectorAll('.rtype-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('rt-' + type)?.classList.add('selected');
  MonState.selectedRiskType = type;
}

// ── Sesión de monitoreo ────────────────────────────────────────────────────
async function startSession() {
  const vehicleId = document.getElementById('selVehicle').value;
  const driverId  = document.getElementById('selDriver').value;
  const origin    = document.getElementById('originName').value;
  const dest      = document.getElementById('destName').value;

  try {
    const res = await api('/monitoring/start', {
      method: 'POST',
      body: { vehicle_id: vehicleId || null, driver_id: driverId || null,
              origin_name: origin || null, destination_name: dest || null }
    });

    MonState.sessionId = res.id;
    MonState.sessionStartTime = new Date();
    MonState.pointsAdded = 0;

    // Actualizar UI
    document.getElementById('startPanel').style.display = 'none';
    document.getElementById('sessionBadge').classList.add('active');

    const veh = MonState.vehicles.find(v => v.id === vehicleId);
    const drv = MonState.drivers.find(d => d.id === driverId);
    document.getElementById('sessionInfo').textContent =
      `${veh ? veh.plate : 'Sin placa'} · ${drv ? drv.name : 'Sin conductor'}${origin ? ' · '+origin : ''}`;

    document.getElementById('fabAddRisk').classList.remove('hidden');
    document.getElementById('fabEndSession').classList.remove('hidden');
    document.getElementById('clickHint').classList.add('show');

    // Iniciar timer
    MonState.timerInterval = setInterval(updateTimer, 1000);

    // Iniciar GPS
    startGpsTracking();
    SoundAlert.beepShort();
    showToast('Sesión de monitoreo iniciada.', 'info');
  } catch (e) { showToast(e.message); }
}

function updateTimer() {
  if (!MonState.sessionStartTime) return;
  const diff = Math.floor((new Date() - MonState.sessionStartTime) / 1000);
  const h = String(Math.floor(diff / 3600)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');
  document.getElementById('sessionTimer').textContent = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function startGpsTracking() {
  if (!navigator.geolocation) return;
  MonState.watchId = navigator.geolocation.watchPosition(pos => {
    MonState.userLat = pos.coords.latitude;
    MonState.userLng = pos.coords.longitude;
    placeUserMarker(MonState.userLat, MonState.userLng);
  }, null, { enableHighAccuracy: true, maximumAge: 5000 });
}

// ── Clic en mapa ───────────────────────────────────────────────────────────
function onMapClick(e) {
  if (!MonState.sessionId) return;
  MonState.pendingLat = e.latlng.lat;
  MonState.pendingLng = e.latlng.lng;

  document.getElementById('coordsDisplay').textContent =
    `Coordenadas: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
  document.getElementById('riskDesc').value = '';
  document.getElementById('riskSeverity').value = 'medium';
  MonState.selectedRiskType = null;
  document.querySelectorAll('.rtype-btn').forEach(b => b.classList.remove('selected'));

  openAddRisk();
}

function openAddRisk() {
  if (!MonState.sessionId) { showToast('Inicie una sesión primero.', 'warning'); return; }
  if (!MonState.pendingLat) {
    // Si viene del FAB, usar posición actual
    if (MonState.userLat) {
      MonState.pendingLat = MonState.userLat;
      MonState.pendingLng = MonState.userLng;
      document.getElementById('coordsDisplay').textContent =
        `Mi posición: ${MonState.userLat.toFixed(5)}, ${MonState.userLng.toFixed(5)}`;
    } else {
      showToast('Toca el mapa para elegir ubicación.', 'info');
      return;
    }
  }
  document.getElementById('addRiskSheet').classList.add('open');
}

function closeAddRisk() {
  document.getElementById('addRiskSheet').classList.remove('open');
  MonState.pendingLat = null;
  MonState.pendingLng = null;
}

async function saveRiskPoint() {
  if (!MonState.selectedRiskType) { showToast('Seleccione el tipo de riesgo.', 'warning'); return; }
  if (!MonState.pendingLat)       { showToast('Seleccione una ubicación en el mapa.', 'warning'); return; }

  const btn = document.querySelector('#addRiskSheet .btn-danger');
  btn.textContent = 'Guardando...'; btn.disabled = true;

  try {
    await api('/riskpoints', {
      method: 'POST',
      body: {
        type: MonState.selectedRiskType,
        description: document.getElementById('riskDesc').value || null,
        lat: MonState.pendingLat,
        lng: MonState.pendingLng,
        severity: document.getElementById('riskSeverity').value,
        is_permanent: document.getElementById('riskPermanent').value === '1'
      }
    });

    // Marcador en el mapa
    const rc = getRiskConfig(MonState.selectedRiskType);
    const sev = document.getElementById('riskSeverity').value;
    const marker = L.marker([MonState.pendingLat, MonState.pendingLng], {
      icon: createRiskIcon(MonState.selectedRiskType, sev)
    }).bindPopup(`<b>${rc.icon} ${rc.label}</b><br>${document.getElementById('riskDesc').value || ''}`).addTo(MonState.map);
    MonState.riskMarkers.push(marker);

    MonState.pointsAdded++;
    document.getElementById('pointsCount').textContent = `${MonState.pointsAdded} punto${MonState.pointsAdded !== 1 ? 's' : ''}`;

    SoundAlert.beepShort();
    closeAddRisk();
    showToast('Punto de riesgo guardado.', 'info');
  } catch (e) { showToast(e.message); }

  btn.textContent = '💾 Guardar'; btn.disabled = false;
}

// ── Finalizar sesión ───────────────────────────────────────────────────────
async function endSession() {
  if (!MonState.sessionId) return;
  if (!confirm('¿Finalizar la sesión de monitoreo?')) return;

  const notes = prompt('Notas adicionales (opcional):') || '';

  try {
    const result = await api(`/monitoring/${MonState.sessionId}/end`, {
      method: 'POST',
      body: { notes }
    });

    clearInterval(MonState.timerInterval);
    if (MonState.watchId) navigator.geolocation.clearWatch(MonState.watchId);

    showSummary(result);

    // Reset UI
    document.getElementById('sessionBadge').classList.remove('active');
    document.getElementById('clickHint').classList.remove('show');
    document.getElementById('fabAddRisk').classList.add('hidden');
    document.getElementById('fabEndSession').classList.add('hidden');
    MonState.sessionId = null;
    MonState.sessionStartTime = null;
    MonState.pointsAdded = 0;

    document.getElementById('startPanel').style.display = 'block';
    SoundAlert.beepShort();
  } catch (e) { showToast(e.message); }
}

function showSummary(result) {
  const { session, risk_points = [] } = result;
  const duration = session.ended_at && session.started_at
    ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000)
    : 0;

  const byType = risk_points.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1; return acc;
  }, {});

  document.getElementById('summaryContent').innerHTML = `
    <div class="route-preview">
      <div class="route-stat">
        <div class="stat-item"><div class="stat-val">${fmtDuration(duration)}</div><div class="stat-label">Duración</div></div>
        <div class="stat-item"><div class="stat-val">${risk_points.length}</div><div class="stat-label">Puntos registrados</div></div>
      </div>
    </div>
    <p style="color:var(--text2);font-size:.82rem;margin-bottom:12px">
      Inicio: ${fmtDatetime(session.started_at)} · Fin: ${fmtDatetime(session.ended_at)}
    </p>
    ${session.driver_name ? `<p><strong>Conductor:</strong> ${session.driver_name}</p>` : ''}
    ${session.vehicle_plate ? `<p><strong>Placa:</strong> ${session.vehicle_plate}</p>` : ''}
    ${session.notes ? `<p><strong>Notas:</strong> ${session.notes}</p>` : ''}

    ${risk_points.length ? `
      <hr class="divider">
      <p style="font-weight:700;margin-bottom:10px">Puntos de Riesgo Registrados</p>
      ${Object.entries(byType).map(([type, count]) => {
        const rc = getRiskConfig(type);
        return `<div class="nearby-risk">
          <span style="font-size:1.3rem">${rc.icon}</span>
          <div><strong>${rc.label}</strong> <span class="badge badge-primary">${count}</span></div>
        </div>`;
      }).join('')}
      <hr class="divider">
      ${risk_points.map(r => {
        const rc = getRiskConfig(r.type);
        const sc = getSeverityConfig(r.severity);
        return `<div class="nearby-risk">
          <span style="font-size:1.1rem">${rc.icon}</span>
          <div style="flex:1">
            <div style="font-size:.85rem;font-weight:600">${rc.label}</div>
            ${r.description ? `<div style="font-size:.75rem;color:var(--text2)">${r.description}</div>` : ''}
            <div style="font-size:.75rem">
              <span style="color:${sc.color};font-weight:700">${sc.label}</span>
              · ${fmtTime(r.created_at)}
              · ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}
            </div>
          </div>
        </div>`;
      }).join('')}
    ` : '<p class="text-muted text-center">No se registraron puntos de riesgo.</p>'}
  `;
  document.getElementById('summaryOverlay').classList.add('show');
}

function closeSummary() {
  document.getElementById('summaryOverlay').classList.remove('show');
}

// ── Sesiones anteriores ────────────────────────────────────────────────────
async function toggleSessionList() {
  const drawer = document.getElementById('sessionsDrawer');
  if (drawer.classList.contains('open')) { drawer.classList.remove('open'); return; }
  drawer.classList.add('open');

  const body = document.getElementById('sessionsDrawerBody');
  body.innerHTML = '<div class="spinner"></div>';

  try {
    const sessions = await api('/monitoring');
    if (!sessions.length) { body.innerHTML = '<p class="text-muted text-center">Sin sesiones previas.</p>'; return; }
    body.innerHTML = sessions.map(s => `
      <div class="risk-list-item" onclick="viewSession('${s.id}')">
        <div class="risk-icon-badge medium">👁️</div>
        <div class="flex-1">
          <div style="font-weight:600">${s.vehicle_plate || 'Sin placa'} · ${s.driver_name || 'Sin conductor'}</div>
          <div style="font-size:.8rem;color:var(--text2)">${fmtDatetime(s.started_at)}</div>
          <div style="margin-top:4px">
            <span class="badge badge-primary">${s.risk_points_added} puntos</span>
            <span class="badge badge-${s.ended_at ? 'success' : 'warning'}">${s.ended_at ? 'Finalizada' : 'En curso'}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch { body.innerHTML = '<p class="text-muted text-center">Error cargando sesiones.</p>'; }
}

async function viewSession(id) {
  try {
    const data = await api(`/monitoring/${id}`);
    showSummary({ session: data, risk_points: data.risk_points || [] });
    document.getElementById('sessionsDrawer').classList.remove('open');
  } catch (e) { showToast(e.message); }
}

async function loadExistingRisks(lat, lng) {
  try {
    const risks = await api(`/riskpoints/nearby?lat=${lat}&lng=${lng}&radius_km=15&active_only=1`);
    risks.forEach(r => {
      const m = L.marker([r.lat, r.lng], { icon: createRiskIcon(r.type, r.severity) })
        .bindPopup(`<b>${getRiskConfig(r.type).icon} ${getRiskConfig(r.type).label}</b><br>${r.description || ''}`)
        .addTo(MonState.map);
      MonState.riskMarkers.push(m);
    });
  } catch {}
}
