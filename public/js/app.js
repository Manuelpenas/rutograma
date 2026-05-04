/**
 * app.js ? L?gica principal de la aplicaci?n de rutograma
 */

const State = {
  map: null,
  userLat: null, userLng: null,
  destLat: null, destLng: null, destName: '',
  originLat: null, originLng: null, originName: '',
  routeLayer: null, destMarker: null,
  userMarker: null,
  riskMarkers: [], wazeMarkers: [], osmMarkers: [],
  activeTrip: null,
  vehicles: [], drivers: [],
  selVehicleId: null, selDriverId: null,
  watchId: null,
  alertedPoints: new Set(),
  routeData: null,
  alternativeRoutes: [],
  selectedRouteIndex: 0,
  step: 1
};

// ?? Inicializaci?n ?????????????????????????????????????????????????????????
window.addEventListener('DOMContentLoaded', async () => {
  const user = Auth.check();
  if (!user) return;
  document.getElementById('userBadge').textContent = user.name;
  initMap();
  getCurrentPosition();
  await loadActiveTrip();
  loadExistingRisks(); // Cargar riesgos existentes
});



// ?? GPS ????????????????????????????????????????????????????????????????????
function getCurrentPosition() {
  const gpsBtn = document.getElementById('gpsStatusBtn');
  if (gpsBtn) gpsBtn.textContent = '?? Buscando GPS...';

  if (!navigator.geolocation) {
    showToast('GPS no disponible en este dispositivo.', 'warning');
    showManualLocationOption();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => onGpsSuccess(pos),
    err => onGpsError(err),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}

function onGpsSuccess(pos) {
  State.userLat = pos.coords.latitude;
  State.userLng = pos.coords.longitude;
  State.originLat = State.userLat;
  State.originLng = State.userLng;

  placeUserMarker(State.userLat, State.userLng);
  State.map.setView([State.userLat, State.userLng], 15);

  const btn = document.getElementById('gpsStatusBtn');
  if (btn) { btn.textContent = '?? GPS Activo'; btn.style.background = 'var(--success)'; }

  reverseGeocode(State.userLat, State.userLng);
  loadNearbyRisks(State.userLat, State.userLng);
  fetchWeather(State.userLat, State.userLng);
}

function onGpsError(err) {
  const msgs = {
    1: '?? Permiso de GPS denegado. Active la ubicaci?n en su navegador.',
    2: '?? No se pudo determinar la ubicaci?n.',
    3: '?? Tiempo de espera del GPS agotado.'
  };
  const msg = msgs[err.code] || '?? Error al obtener GPS.';
  showToast(msg, 'warning', 5000);

  const btn = document.getElementById('gpsStatusBtn');
  if (btn) { btn.textContent = '?? Sin GPS'; btn.style.background = 'var(--warning)'; btn.style.color = '#333'; }
  showManualLocationOption();
}

function showManualLocationOption() {
  const el = document.getElementById('manualGpsWrap');
  if (el) el.style.display = 'block';
}

function retryGps() {
  const wrap = document.getElementById('manualGpsWrap');
  if (wrap) wrap.style.display = 'none';
  const btn = document.getElementById('gpsStatusBtn');
  if (btn) { btn.textContent = '?? GPS...'; btn.style.background = ''; btn.style.color = ''; }
  getCurrentPosition();
}

// B?squeda de sugerencias para el input manual (debounced)
let manualSuggTimer = null;
function searchManualSugg(q) {
  clearTimeout(manualSuggTimer);
  const box = document.getElementById('manualGpsSugg');
  if (!box) return;
  if (q.length < 3) { box.innerHTML = ''; return; }
  manualSuggTimer = setTimeout(async () => {
    box.innerHTML = '<div class="suggestion-item text-muted">?? Buscando...</div>';
    try {
      const results = await api(`/external/geocode?q=${encodeURIComponent(q)}`);
      if (!results.length) { box.innerHTML = '<div class="suggestion-item text-muted">Sin resultados</div>'; return; }
      box.innerHTML = results.slice(0, 5).map(r => `
        <div class="suggestion-item" onclick="pickManualSugg(${r.lat},${r.lon},'${escHtml(r.display_name)}')">
          <span class="suggestion-icon">??</span>
          <span style="font-size:.85rem">${r.display_name}</span>
        </div>`).join('');
    } catch { box.innerHTML = ''; }
  }, 400);
}

function pickManualSugg(lat, lon, name) {
  document.getElementById('manualGpsInput').value = name.split(',').slice(0, 2).join(',');
  document.getElementById('manualGpsSugg').innerHTML = '';
  State.userLat = parseFloat(lat);
  State.userLng = parseFloat(lon);
  State.originLat = State.userLat;
  State.originLng = State.userLng;
  State.originName = name.split(',').slice(0, 2).join(',');
  placeUserMarker(State.userLat, State.userLng);
  State.map.setView([State.userLat, State.userLng], 15);
  const el = document.getElementById('originDisplay');
  if (el) el.value = State.originName;
  document.getElementById('manualGpsWrap').style.display = 'none';
  loadNearbyRisks(State.userLat, State.userLng);
  fetchWeather(State.userLat, State.userLng);
  showToast('?? Origen: ' + State.originName, 'info', 2500);
}

function setManualLocation() {
  const input = document.getElementById('manualGpsInput').value.trim();
  if (!input) return;
  searchAndSetOrigin(input);
}

async function searchAndSetOrigin(q) {
  try {
    const results = await api(`/external/geocode?q=${encodeURIComponent(q)}`);
    if (results && results.length) {
      const r = results[0];
      State.userLat = parseFloat(r.lat);
      State.userLng = parseFloat(r.lon);
      State.originLat = State.userLat;
      State.originLng = State.userLng;
      State.originName = r.display_name.split(',').slice(0, 2).join(',');
      placeUserMarker(State.userLat, State.userLng);
      State.map.setView([State.userLat, State.userLng], 15);
      const el = document.getElementById('originDisplay');
      if (el) el.value = State.originName;
      document.getElementById('manualGpsWrap').style.display = 'none';
      loadNearbyRisks(State.userLat, State.userLng);
      fetchWeather(State.userLat, State.userLng);
      showToast('Ubicaci?n establecida: ' + State.originName, 'info');
    } else {
      showToast('No se encontr? esa ubicaci?n.', 'warning');
    }
  } catch (e) { showToast('Error al buscar ubicaci?n.', 'warning'); }
}

function placeUserMarker(lat, lng) {
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;background:#1a73e8;border:3px solid #fff;
      border-radius:50%;box-shadow:0 0 0 5px rgba(26,115,232,.25)"></div>`,
    iconSize: [22, 22], iconAnchor: [11, 11]
  });
  if (State.userMarker) State.userMarker.setLatLng([lat, lng]);
  else State.userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(State.map);
}

async function reverseGeocode(lat, lng) {
  try {
    const data = await api(`/external/geocode?lat=${lat}&lng=${lng}`);
    State.originName = data.display_name?.split(',').slice(0, 2).join(',') || 'Mi ubicaci?n';
    const el = document.getElementById('originDisplay');
    if (el) el.value = State.originName;
  } catch {}
}

// ?? Viaje activo ?????????????????????????????????????????????????????????
async function loadActiveTrip() {
  try {
    const trip = await api('/trips/active');
    if (trip) {
      State.activeTrip = trip;
      showTripHUD(trip);
      startTracking();
      document.getElementById('fabBtns').style.display = 'none';
    }
  } catch {}
}

// ?? Pre-viaje ?????????????????????????????????????????????????????????????
async function openPreTrip() {
  if (State.activeTrip) { showToast('Ya hay un viaje activo. Final?celo primero.', 'warning'); return; }
  document.getElementById('preTripOverlay').classList.remove('hidden');
  goStep1();
  await loadVehiclesAndDrivers();
}

function closePreTrip() {
  document.getElementById('preTripOverlay').classList.add('hidden');
}

async function loadVehiclesAndDrivers() {
  try {
    [State.vehicles, State.drivers] = await Promise.all([api('/vehicles'), api('/drivers')]);
    renderVehicleCards();
    renderDriverCards();
  } catch (e) { showToast('Error cargando flota. Verifique la conexi?n.'); }
}

function renderVehicleCards() {
  const grid = document.getElementById('vehicleGrid');
  if (!grid) return;
  if (!State.vehicles.length) {
    grid.innerHTML = `<p class="text-muted text-center" style="grid-column:1/-1">
      No hay veh?culos registrados. <a href="/admin" style="color:var(--primary)">Registrar veh?culo</a>
    </p>`;
    return;
  }
  grid.innerHTML = State.vehicles.map(v => `
    <div class="select-card" id="vc-${v.id}" onclick="selectVehicle('${v.id}')">
      <div class="sc-icon">??</div>
      <div class="sc-label">${v.plate}</div>
      <div class="sc-sub">${[v.brand, v.model].filter(Boolean).join(' ') || v.type}</div>
    </div>`).join('');
}

function renderDriverCards() {
  const grid = document.getElementById('driverGrid');
  if (!grid) return;
  if (!State.drivers.length) {
    grid.innerHTML = `<p class="text-muted text-center" style="grid-column:1/-1">
      No hay conductores registrados. <a href="/admin" style="color:var(--primary)">Registrar conductor</a>
    </p>`;
    return;
  }
  grid.innerHTML = State.drivers.map(d => `
    <div class="select-card" id="dc-${d.id}" onclick="selectDriver('${d.id}')">
      <div class="sc-icon">??</div>
      <div class="sc-label">${d.name}</div>
      <div class="sc-sub">${d.license_number || 'Sin licencia registrada'}</div>
    </div>`).join('');
}

function selectVehicle(id) {
  document.querySelectorAll('[id^="vc-"]').forEach(c => c.classList.remove('selected'));
  document.getElementById('vc-' + id)?.classList.add('selected');
  State.selVehicleId = id;
}

function selectDriver(id) {
  document.querySelectorAll('[id^="dc-"]').forEach(c => c.classList.remove('selected'));
  document.getElementById('dc-' + id)?.classList.add('selected');
  State.selDriverId = id;
}

function goStep1() {
  State.step = 1;
  show('step1'); hide('step2'); hide('step3');
  updateStepIndicator();
}

function goStep2() {
  if (State.step === 1) {
    if (!State.selVehicleId) { showToast('Seleccione un veh?culo.', 'warning'); return; }
    if (!State.selDriverId)  { showToast('Seleccione un conductor.', 'warning'); return; }
  }
  State.step = 2;
  hide('step1'); show('step2'); hide('step3');
  const el = document.getElementById('originDisplay');
  if (el) el.value = State.originName || 'Obteniendo ubicaci?n...';
  updateStepIndicator();
}

function updateStepIndicator() {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('s' + i);
    if (!el) continue;
    el.className = 'step' + (i < State.step ? ' done' : i === State.step ? ' active' : '');
  }
}

// ?? B?squeda de destino ???????????????????????????????????????????????????
let sugg2Timer = null;
function searchDest2(q) {
  clearTimeout(sugg2Timer);
  const box = document.getElementById('sugg2');
  document.getElementById('btnCalculate').disabled = true;
  State.destLat = null;
  if (q.length < 3) { box.innerHTML = ''; return; }

  sugg2Timer = setTimeout(async () => {
    box.innerHTML = '<div class="suggestion-item text-muted">?? Buscando...</div>';
    try {
      const results = await api(`/external/geocode?q=${encodeURIComponent(q)}`);
      if (!results.length) { box.innerHTML = '<div class="suggestion-item text-muted">Sin resultados</div>'; return; }
      box.innerHTML = results.map(r => `
        <div class="suggestion-item" onclick="selectDest2(${r.lat},${r.lon},'${escHtml(r.display_name)}')">
          <span class="suggestion-icon">??</span>
          <span>${r.display_name}</span>
        </div>`).join('');
    } catch { box.innerHTML = '<div class="suggestion-item text-muted">Error al buscar</div>'; }
  }, 400);
}

function selectDest2(lat, lng, name) {
  State.destLat = parseFloat(lat);
  State.destLng = parseFloat(lng);
  State.destName = name.split(',').slice(0, 2).join(',');
  document.getElementById('destSearch2').value = State.destName;
  document.getElementById('sugg2').innerHTML = '';
  document.getElementById('btnCalculate').disabled = false;

  // Marcador de destino en mapa
  if (State.destMarker) State.map.removeLayer(State.destMarker);
  const dIcon = L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:#ea4335;border:3px solid #fff;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>`,
    iconSize: [28, 28], iconAnchor: [14, 28]
  });
  State.destMarker = L.marker([State.destLat, State.destLng], { icon: dIcon })
    .bindPopup(`<b>?? Destino:</b><br>${State.destName}`)
    .addTo(State.map);
  State.map.panTo([State.destLat, State.destLng]);
}

async function calculateRoute() {
  if (!State.originLat)  { showToast('No se detect? su ubicaci?n de origen.', 'warning'); return; }
  if (!State.destLat)    { showToast('Seleccione un destino de la lista.', 'warning'); return; }

  const btn = document.getElementById('btnCalculate');
  btn.textContent = '? Calculando...'; btn.disabled = true;

  try {
    const data = await api(`/external/route?from_lat=${State.originLat}&from_lng=${State.originLng}&to_lat=${State.destLat}&to_lng=${State.destLng}`);
    State.routeData = data;
    State.alternativeRoutes = data.routes || [data.primary];
    State.selectedRouteIndex = 0;

    document.getElementById('riDist').textContent = fmtDistance(data.primary?.distance_km || data.distance_km);
    document.getElementById('riTime').textContent = fmtDuration(data.primary?.duration_min || data.duration_min);
    document.getElementById('routeInfo').classList.remove('hidden');

    showAlternativeRoutes();
    displayRoute(0);

    btn.textContent = '? Ruta calculada';
    showToast('Ruta calculada correctamente.', 'info', 2000);
    setTimeout(() => goStep3(), 800);
  } catch (e) {
    showToast(e.message || 'Error al calcular la ruta.', 'warning');
    btn.textContent = '?? Calcular Ruta'; btn.disabled = false;
  }
}

async function goStep3() {
  State.step = 3;
  hide('step2'); show('step3');
  updateStepIndicator();
  await buildRiskSummary();
}

async function buildRiskSummary() {
  const lat = State.originLat, lng = State.originLng;
  if (!lat) return;

  document.getElementById('summaryLoading').style.display = 'block';
  document.getElementById('summaryContent').style.display = 'none';

  const [wData, weatherData, risksData, osmData] = await Promise.allSettled([
    api(`/external/waze?lat=${lat}&lng=${lng}&radius=0.15`),
    api(`/external/weather?lat=${lat}&lng=${lng}`),
    api(`/riskpoints/nearby?lat=${lat}&lng=${lng}&radius_km=20`),
    api(`/external/pois?lat=${lat}&lng=${lng}&radius_m=10000`)
  ]);

  document.getElementById('summaryLoading').style.display = 'none';
  document.getElementById('summaryContent').style.display = 'block';

  // ?? Clima ??????????????????????????????????????????????????????????????
  const wEl = document.getElementById('weatherInfo');
  if (weatherData.status === 'fulfilled') {
    const w = weatherData.value;
    const id = w.weather_id || 0;
    let alertBadge = '';
    if (id >= 200 && id < 300) alertBadge = `<span class="risk-chip high">? Tormenta el?ctrica ? conduzca con precauci?n</span>`;
    else if (id >= 300 && id < 600) alertBadge = `<span class="risk-chip medium">??? Lluvia ? visibilidad reducida</span>`;
    else if (id >= 700 && id < 760) alertBadge = `<span class="risk-chip high">??? Niebla ? reduzca velocidad</span>`;
    else if (id >= 600 && id < 700) alertBadge = `<span class="risk-chip critical">?? Nieve/hielo en v?a ? peligro</span>`;
    wEl.innerHTML = `
      <div class="weather-widget">
        <img src="https://openweathermap.org/img/wn/${w.icon}@2x.png" width="52" height="52" alt="clima">
        <div style="flex:1">
          <div class="temp">${Math.round(w.temp)}?C</div>
          <div class="desc">${capitalize(w.description)} ? ${w.city}</div>
          ${alertBadge}
        </div>
        <div style="font-size:.82rem;opacity:.9;text-align:right;line-height:1.8">
          ?? Humedad: ${w.humidity}%<br>?? Viento: ${w.wind_speed} m/s<br>??? Visib: ${(w.visibility/1000).toFixed(1)} km
        </div>
      </div>`;
  } else {
    wEl.innerHTML = `<div class="card text-muted" style="font-size:.85rem">?? No se pudo obtener el clima. Configure su API key de OpenWeatherMap en el panel admin.</div>`;
  }

  // ?? Alertas Waze ??????????????????????????????????????????????????????
  const wazEl = document.getElementById('wazeAlertsInfo');
  if (wData.status === 'fulfilled' && wData.value.alerts?.length) {
    const alerts = wData.value.alerts.slice(0, 8);
    const grouped = {};
    alerts.forEach(a => {
      const type = wazeToRiskType(a.type, a.subtype || '');
      grouped[type] = (grouped[type] || 0) + 1;
    });
    wazEl.innerHTML = `
      <div class="card mb-1">
        <div class="card-title">?? Alertas de Tr?fico en Tiempo Real (Waze)</div>
        ${Object.entries(grouped).map(([type, cnt]) => {
          const rc = getRiskConfig(type);
          return `<span class="waze-chip">${rc.icon} ${rc.label} <strong>(${cnt})</strong></span>`;
        }).join('')}
      </div>`;
  } else { wazEl.innerHTML = ''; }

  // ?? Puntos del sistema ????????????????????????????????????????????????
  const rsEl = document.getElementById('riskSummary');
  const ownRisks = risksData.status === 'fulfilled' ? risksData.value : [];
  const osmPois  = osmData.status  === 'fulfilled' ? osmData.value  : [];
  const allRisks = [...ownRisks, ...osmPois.map(p => ({ ...p, source: 'osm', severity: 'medium' }))];

  if (allRisks.length) {
    const sorted = allRisks.sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sev[a.severity] || 2) - (sev[b.severity] || 2);
    });
    rsEl.innerHTML = `
      <div class="card">
        <div class="card-title">?? Puntos de Riesgo en la Ruta (${sorted.length})</div>
        ${sorted.slice(0, 10).map(r => {
          const rc = getRiskConfig(r.type);
          const sc = getSeverityConfig(r.severity);
          return `<div class="nearby-risk" onclick="flyToRisk(${r.lat},${r.lng})" style="cursor:pointer">
            <div class="risk-icon-badge ${r.severity}">${rc.icon}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:.9rem">${rc.label}</div>
              ${r.description || r.name ? `<div style="font-size:.78rem;color:var(--text2)">${r.description || r.name}</div>` : ''}
              <div style="margin-top:3px;display:flex;gap:6px;align-items:center">
                <span class="badge badge-${r.severity==='low'?'success':r.severity==='medium'?'warning':'danger'}">${sc.label}</span>
                ${r.distance_km ? `<span class="badge badge-primary">${Math.round(r.distance_km*1000)} m</span>` : ''}
                ${r.source === 'osm' ? `<span class="badge badge-secondary">OSM</span>` : ''}
              </div>
            </div>
          </div>`;
        }).join('')}
        ${sorted.length > 10 ? `<p class="text-muted text-center mt-1" style="font-size:.8rem">...y ${sorted.length - 10} m?s en la ruta</p>` : ''}
      </div>`;
  } else {
    rsEl.innerHTML = `<div class="card text-muted text-center">? No se encontraron puntos de riesgo registrados en esta ?rea.</div>`;
  }
}

// ?? Iniciar viaje ?????????????????????????????????????????????????????????
async function startTrip() {
  const btn = document.querySelector('#step3 .btn-success');
  btn.textContent = '? Iniciando...'; btn.disabled = true;

  try {
    const trip = await api('/trips', {
      method: 'POST',
      body: {
        vehicle_id: State.selVehicleId,
        driver_id: State.selDriverId,
        origin_name: State.originName,
        origin_lat: State.originLat,
        origin_lng: State.originLng,
        destination_name: State.destName,
        destination_lat: State.destLat,
        destination_lng: State.destLng,
        route_geometry: JSON.stringify(State.routeData?.geometry),
        distance_km: State.routeData?.distance_km,
        estimated_duration: State.routeData?.duration_min
      }
    });

    await api(`/trips/${trip.id}/start`, { method: 'POST' });
    State.activeTrip = {
      id: trip.id,
      destination_name: State.destName,
      distance_km: State.routeData?.distance_km,
      estimated_duration: State.routeData?.duration_min
    };

    closePreTrip();
    showTripHUD(State.activeTrip);
    startTracking();
    document.getElementById('fabBtns').style.display = 'none';
    SoundAlert.beepShort();
    showToast('?? ?Ruta iniciada! Conduzca con precauci?n.', 'info', 4000);
  } catch (e) {
    showToast(e.message);
    btn.textContent = '?? INICIAR RUTA'; btn.disabled = false;
  }
}

// ?? HUD viaje activo ??????????????????????????????????????????????????????
function showTripHUD(trip) {
  document.getElementById('tripHud').classList.add('active');
  document.getElementById('hudDist').textContent = fmtDistance(trip.distance_km);
  document.getElementById('hudEta').textContent  = fmtDuration(trip.estimated_duration);
  document.getElementById('hudDest').textContent = trip.destination_name || '?';
}

// ?? Tracking GPS ??????????????????????????????????????????????????????????
function startTracking() {
  if (State.watchId) navigator.geolocation.clearWatch(State.watchId);
  if (!navigator.geolocation) return;

  State.watchId = navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lng, speed, heading } = pos.coords;
    State.userLat = lat; State.userLng = lng;
    placeUserMarker(lat, lng);
    State.map.panTo([lat, lng], { animate: true });
    if (speed !== null) document.getElementById('hudSpeed').textContent = Math.round(speed * 3.6);

    if (State.activeTrip) {
      api(`/trips/${State.activeTrip.id}/track`, {
        method: 'POST', body: { lat, lng, speed: speed ? speed * 3.6 : null, heading }
      }).catch(() => {});
      checkNearbyRisks(lat, lng);
    }
  }, err => console.warn('GPS watch error:', err.message),
     { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
}

// ?? Verificar riesgos cercanos ????????????????????????????????????????????
async function checkNearbyRisks(lat, lng) {
  try {
    const risks = await api(`/riskpoints/nearby?lat=${lat}&lng=${lng}&radius_km=0.6&active_only=1`);
    risks.forEach(r => {
      const distM = r.distance_km * 1000;
      const alertKey = `${r.id}-${distM < 150 ? 'c' : distM < 300 ? 'm' : 'f'}`;
      if (State.alertedPoints.has(alertKey)) return;
      State.alertedPoints.add(alertKey);

      const rc = getRiskConfig(r.type);
      const sc = getSeverityConfig(r.severity);
      SoundAlert.alertForRisk(r.type, r.severity, distM);

      const emojis = { low: '??', medium: '??', high: '??', critical: '??' };
      showToast(`${emojis[r.severity] || '??'} ${rc.label} a ${Math.round(distM)} m ? ${sc.label}`, 'danger', 4500);

      api(`/trips/${State.activeTrip.id}/alert`, {
        method: 'POST',
        body: { risk_point_id: r.id, alert_type: r.type, severity: r.severity,
                lat: r.lat, lng: r.lng, description: r.name || rc.label, distance_m: distM }
      }).catch(() => {});
    });
  } catch {}
}

// ?? Finalizar viaje ???????????????????????????????????????????????????????
async function endTrip() {
  if (!State.activeTrip) return;
  if (!confirm('?Desea finalizar el viaje y ver el resumen?')) return;

  try {
    const summary = await api(`/trips/${State.activeTrip.id}/complete`, { method: 'POST' });
    if (State.watchId) navigator.geolocation.clearWatch(State.watchId);
    document.getElementById('tripHud').classList.remove('active');
    document.getElementById('fabBtns').style.display = 'flex';
    State.activeTrip = null;
    State.alertedPoints.clear();
    SoundAlert.beepShort();
    showSummaryModal(summary);
  } catch (e) { showToast(e.message); }
}

function showSummaryModal(summary) {
  const alerts = summary.alerts || [];
  const bySev = { high: 0, medium: 0, low: 0 };
  alerts.forEach(a => { bySev[a.severity] = (bySev[a.severity] || 0) + 1; });

  const html = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:440px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.3)">
        <h2 style="margin-bottom:4px">? Viaje Completado</h2>
        <p class="text-muted mb-2" style="font-size:.85rem">${summary.trip?.origin_name || ''} ? ${summary.trip?.destination_name || ''}</p>
        <div class="route-preview">
          <div class="route-stat">
            <div class="stat-item"><div class="stat-val">${fmtDistance(summary.trip?.distance_km)}</div><div class="stat-label">Distancia</div></div>
            <div class="stat-item"><div class="stat-val">${alerts.length}</div><div class="stat-label">Alertas totales</div></div>
            <div class="stat-item"><div class="stat-val">${bySev.high || 0}</div><div class="stat-label">Alta severidad</div></div>
          </div>
        </div>
        ${alerts.length ? `
          <p style="font-weight:700;margin:12px 0 8px">?? Alertas registradas:</p>
          ${alerts.slice(0, 8).map(a => {
            const rc = getRiskConfig(a.alert_type);
            const sc = getSeverityConfig(a.severity);
            return `<div class="nearby-risk">
              <span style="font-size:1.4rem">${rc.icon}</span>
              <div>
                <div style="font-weight:600">${rc.label}</div>
                <div style="font-size:.78rem;color:var(--text2)">${fmtDatetime(a.triggered_at)} ? <span style="color:${sc.color}">${sc.label}</span></div>
              </div>
            </div>`;
          }).join('')}
        ` : '<p class="text-muted text-center mt-1">? Sin alertas en este recorrido.</p>'}
        <button class="btn btn-primary btn-block mt-2" onclick="this.closest('div[style*=inset]').remove()">Cerrar</button>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// ?? Mapa ??????????????????????????????????????????????????????????????????
function centerOnMe() {
  if (State.userLat) State.map.setView([State.userLat, State.userLng], 16);
  else { showToast('GPS no disponible.', 'warning'); getCurrentPosition(); }
}

function flyToRisk(lat, lng) {
  closePreTrip();
  State.map.flyTo([lat, lng], 17);
}

async function openRisksDrawer() {
  document.getElementById('risksDrawer').classList.add('open');
  const body = document.getElementById('risksDrawerBody');
  body.innerHTML = '<div class="spinner"></div>';
  try {
    const lat = State.userLat || 4.6097, lng = State.userLng || -74.0817;
    const risks = await api(`/riskpoints/nearby?lat=${lat}&lng=${lng}&radius_km=15&active_only=1`);
    loadNearbyRisks(lat, lng);
    if (!risks.length) {
      body.innerHTML = '<p class="text-muted text-center mt-2">No hay puntos de riesgo registrados en 15 km.</p>';
      return;
    }
    body.innerHTML = risks.map(r => {
      const rc = getRiskConfig(r.type);
      const sc = getSeverityConfig(r.severity);
      return `<div class="risk-list-item" onclick="flyToRisk(${r.lat},${r.lng})">
        <div class="risk-icon-badge ${r.severity}">${rc.icon}</div>
        <div class="flex-1">
          <div style="font-weight:700">${rc.label}</div>
          <div style="font-size:.8rem;color:var(--text2)">${r.description || '?'}</div>
          <div style="margin-top:4px">
            <span class="badge badge-${r.severity==='low'?'success':r.severity==='medium'?'warning':'danger'}">${sc.label}</span>
            ${r.distance_km ? `<span class="badge badge-primary" style="margin-left:4px">${Math.round(r.distance_km*1000)} m</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  } catch { body.innerHTML = '<p class="text-muted text-center">Error cargando puntos de riesgo.</p>'; }
}

function closeRisksDrawer() { document.getElementById('risksDrawer').classList.remove('open'); }

async function loadNearbyRisks(lat, lng) {
  State.riskMarkers.forEach(m => State.map.removeLayer(m));
  State.riskMarkers = [];
  try {
    const risks = await api(`/riskpoints/nearby?lat=${lat}&lng=${lng}&radius_km=20&active_only=1`);
    risks.forEach(r => {
      const rc = getRiskConfig(r.type);
      const sc = getSeverityConfig(r.severity);
      const m = L.marker([r.lat, r.lng], { icon: createRiskIcon(r.type, r.severity) })
        .bindPopup(`<div class="risk-popup">
          <div class="rp-type">${rc.icon} ${rc.label}</div>
          <div class="rp-desc">${r.description || ''}</div>
          <span class="rp-severity" style="background:${sc.bg};color:${sc.color}">${sc.label}</span>
          ${r.radius_meters ? `<div style="font-size:.75rem;margin-top:4px;color:#888">Radio de alerta: ${r.radius_meters} m</div>` : ''}
        </div>`).addTo(State.map);
      State.riskMarkers.push(m);
    });
  } catch {}
}

async function fetchWeather(lat, lng) {
  try {
    const w = await api(`/external/weather?lat=${lat}&lng=${lng}`);
    const id = w.weather_id || 0;
    if ((id >= 200 && id < 600) || (id >= 700 && id < 760)) {
      const type = id >= 700 ? 'weather_fog' : id >= 500 ? 'weather_rain' : 'weather_rain';
      L.marker([lat + 0.001, lng], { icon: createRiskIcon(type, 'high') })
        .bindPopup(`<b>${getRiskConfig(type).icon} ${w.description}</b><br>${Math.round(w.temp)}?C ? ${w.city}`)
        .addTo(State.map);
    }
  } catch {}
}

// ?? Utilidades UI ?????????????????????????????????????????????????????????
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function escHtml(s) { return String(s).replace(/'/g,"&#39;").replace(/"/g,"&quot;"); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// ?? Rutas alternativas ??????????????????????????????????????????????????????
function showAlternativeRoutes() {
  const wrap = document.getElementById('altRoutesWrap');
  const list = document.getElementById('altRoutesList');
  if (!wrap || !list) return;

  if (!State.alternativeRoutes || State.alternativeRoutes.length <= 1) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  list.innerHTML = State.alternativeRoutes.map((route, idx) => `
    <div class="alt-route-card ${idx === State.selectedRouteIndex ? 'selected' : ''}"
         onclick="selectRoute(${idx})"
         style="min-width:180px;padding:10px 14px;border-radius:8px;cursor:pointer;
                border:2px solid ${idx === State.selectedRouteIndex ? 'var(--primary)' : '#ddd'};
                background:${idx === State.selectedRouteIndex ? '#e3f2fd' : '#fff'};
                flex-shrink:0">
      <div style="font-weight:700;font-size:.85rem">Ruta ${idx + 1}</div>
      <div style="font-size:.78rem;color:#666;margin-top:4px">
        ${fmtDistance(route.distance_km)} ? ${fmtDuration(route.duration_min)}
      </div>
      ${idx === 0 ? '<div style="font-size:.7rem;color:var(--primary);font-weight:600">RECOMENDADA</div>' : ''}
    </div>
  `).join('');
}

function selectRoute(idx) {
  State.selectedRouteIndex = idx;
  displayRoute(idx);
  showAlternativeRoutes();
  showToast(`Ruta ${idx + 1} seleccionada.`, 'info', 1500);
}

function displayRoute(idx) {
  const route = State.alternativeRoutes[idx];
  if (!route) return;

  if (State.routeLayer) State.map.removeLayer(State.routeLayer);
  State.routeLayer = L.geoJSON(route.geometry, {
    style: {
      color: idx === 0 ? '#1a73e8' : '#f57c00',
      weight: idx === 0 ? 6 : 4,
      opacity: idx === 0 ? 0.85 : 0.6,
      dashArray: idx === 0 ? null : '10, 10'
    }
  }).addTo(State.map);
  State.map.fitBounds(State.routeLayer.getBounds(), { padding: [70, 70] });

  document.getElementById('riDist').textContent = fmtDistance(route.distance_km);
  document.getElementById('riTime').textContent = fmtDuration(route.duration_min);
}

// ?? Cambio de estilo de mapa ?????????????????????????????????????????????
const MAP_STYLES = {
  openstreet: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { attribution: '? OpenStreetMap', maxZoom: 19 }
  },
  carto: {
    name: 'CartoDB Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: { attribution: '? OSM ? CARTO', subdomains: 'abcd', maxZoom: 19 }
  },
  satellite: {
    name: 'Google Sat?lite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    options: { attribution: '? Google', maxZoom: 20 }
  }
};

let currentTileLayer = null;

function initMap() {
  State.map = L.map('map', { zoomControl: false }).setView([4.6097, -74.0817], 13);

  // CartoDB Voyager ? 100% gratuito, sin restricci?n de Referer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '? <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ? <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(State.map);

  L.control.zoom({ position: 'bottomleft' }).addTo(State.map);

  // Evento de clic para agregar riesgos - UNO SOLO Y DEFINITIVO
  State.map.off('click');
  State.map.on('click', function(e) {
    if (!State.addRiskMode) return;
    console.log('CLIC EN MAPA', e.latlng);
    State.clickLatLng = e.latlng;
    var modal = document.getElementById('addRiskModal');
    if (modal) {
      modal.classList.add('show');
      State.addRiskMode = false;
      console.log('Modal abierto');
    } else {
      console.error('ERROR: addRiskModal no encontrado');
    }
  });

  // Cargar puntos de riesgo existentes
  loadExistingRisks();
}

function switchMapStyle(styleKey) {
  const style = MAP_STYLES[styleKey];
  if (!style) return;

  if (currentTileLayer) State.map.removeLayer(currentTileLayer);
  currentTileLayer = L.tileLayer(style.url, style.options).addTo(State.map);

  // Guardar preferencia
  localStorage.setItem('rg_map_style', styleKey);
}

function loadMapStylePreference() {
  const saved = localStorage.getItem('rg_map_style');
  if (saved && MAP_STYLES[saved]) switchMapStyle(saved);
}

// ?? Men? lateral app ??????????????????????????????????????????????????????
function toggleAppMenu() {
  const menu = document.getElementById('appMenu');
  const overlay = document.getElementById('appMenuOverlay');
  if (menu) menu.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
  // Cargar datos del usuario/tenant
  const user = Auth.getUser();
  if (user) {
    const tenantEl = document.getElementById('menuTenantName');
    const userEl = document.getElementById('menuUserName');
    const logo = document.getElementById('menuLogo');
    if (tenantEl) tenantEl.textContent = user.tenantName || 'Rutograma';
    if (userEl) userEl.textContent = user.name || '';
    if (logo && user.logoUrl) { logo.src = user.logoUrl; logo.style.display = 'block'; }
  }
}

function openVehicleModal() {
  ['vPlaca','vBrand','vModel','vYear','vCapacity'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const typeEl = document.getElementById('vType');
  if (typeEl) typeEl.value = 'bus';
  document.getElementById('vehicleModal').classList.add('show');
  toggleAppMenu();
}
function closeVehicleModal() { document.getElementById('vehicleModal').classList.remove('show'); }

async function saveVehicle() {
  const plateEl = document.getElementById('vPlaca');
  if (!plateEl) { alert('Error: No se encontro el campo placa.'); return; }
  const body = {
    plate:      plateEl.value.trim().toUpperCase(),
    type:       document.getElementById('vType')?.value || 'bus',
    brand:      document.getElementById('vBrand')?.value.trim() || null,
    model:      document.getElementById('vModel')?.value.trim() || null,
    year:       parseInt(document.getElementById('vYear')?.value) || null,
    capacity:   parseInt(document.getElementById('vCapacity')?.value) || null,
  };
  console.log('Enviando veh?culo:', body);
  if (!body.plate) { showToast('La placa es requerida.', 'warning'); return; }
  try {
    const result = await api('/vehicles', { method:'POST', body });
    console.log('Veh?culo creado:', result);
    closeVehicleModal();
    showToast('?? Veh?culo registrado.', 'info');
  } catch (e) { 
    console.error('Error al guardar veh?culo:', e);
    showToast(e.message || 'Error al registrar.', 'warning'); 
  }
}

function openDriverModal() {
  ['dName','dLicense','dLicenseType','dPhone','dEmail'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('driverModal').classList.add('show');
  toggleAppMenu();
}
function closeDriverModal() { document.getElementById('driverModal').classList.remove('show'); }

async function saveDriver() {
  const nameEl = document.getElementById('dName');
  if (!nameEl) { alert('Error: No se encontro el campo nombre.'); return; }
  const body = {
    name:           nameEl.value.trim(),
    license_number:  document.getElementById('dLicense')?.value.trim() || null,
    license_type:   document.getElementById('dLicenseType')?.value.trim() || null,
    phone:          document.getElementById('dPhone')?.value.trim() || null,
    email:          document.getElementById('dEmail')?.value.trim() || null,
  };
  console.log('Enviando conductor:', body);
  if (!body.name) { showToast('El nombre es requerido.', 'warning'); return; }
  try {
    const result = await api('/drivers', { method:'POST', body });
    console.log('Conductor creado:', result);
    closeDriverModal();
    showToast('?? Conductor registrado.', 'info');
  } catch (e) { 
    console.error('Error al guardar conductor:', e);
    showToast(e.message || 'Error al registrar.', 'warning'); 
  }
}

function openChangePassModal() {
  ['currentPass','newPass','confirmPass'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('changePassModal').classList.add('show');
  toggleAppMenu();
}
function closeChangePassModal() { document.getElementById('changePassModal').classList.remove('show'); }

async function changePassword() {
  const current = document.getElementById('currentPass').value;
  const newP    = document.getElementById('newPass').value;
  const confirm  = document.getElementById('confirmPass').value;
  if (!current || !newP || !confirm) { showToast('Todos los campos son requeridos.', 'warning'); return; }
  if (newP.length < 6) { showToast('La nueva contrase?a debe tener al menos 6 caracteres.', 'warning'); return; }
  if (newP !== confirm) { showToast('Las contrase?as no coinciden.', 'warning'); return; }
  try {
    await api('/auth/change-password', { method:'POST', body:{ currentPassword: current, newPassword: newP }});
    closeChangePassModal();
    showToast('?? Contrase?a actualizada correctamente.', 'info');
  } catch (e) { showToast(e.message, 'warning'); }
}

// -- Emergencia / Bot?n de P?nico ------------------------------
function getLocationString() {
  if (State.userLat && State.userLng) {
    return 'Ubicaci?n: https://maps.google.com/?q=' + State.userLat + ',' + State.userLng;
  }
  return 'Ubicaci?n no disponible';
}

function panicButton() {
  const loc = getLocationString();
  const msg = '?? EMERGENCIA en ruta\r\n' + loc + '\r\nPor favor comunicarse con nosotros';
  const phones = ['974328000', '948340370'];
  const url = 'https://wa.me/' + phones[0] + '?text=' + encodeURIComponent(msg);
  window.open(url, '_blank');

  phones.forEach((phone, idx) => {
    if (idx === 0) return;
    setTimeout(() => {
      const u = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
      window.open(u, '_blank');
    }, idx * 500);
  });

  showToast('?? Enviando emergencia por WhatsApp...', 'warning', 3000);
}

function openEmergencyModal() {
  document.getElementById('emergencyModal').classList.add('show');
  toggleAppMenu();
}
function closeEmergencyModal() { document.getElementById('emergencyModal').classList.remove('show'); }

function callNow(phone) {
  window.location.href = 'tel:' + phone;
}
// -- Emergencia / Boton de Panico -----------------------------
function getLocationString() {
  if (State.userLat && State.userLng) {
    return "Ubicacion: https://maps.google.com/?q=" + State.userLat + "," + State.userLng;
  }
  return "Ubicacion no disponible";
}

function panicButton() {
  const loc = getLocationString();
  const msg = "EMERGENCIA en ruta\\n" + loc + "\\nPor favor comunicarse con nosotros";
  const phones = ["974328000", "948340370"];
  const url = "https://wa.me/" + phones[0] + "?text=" + encodeURIComponent(msg);
  window.location.href = url;

  phones.forEach((phone, idx) => {
    if (idx === 0) return;
    setTimeout(() => {
      const u = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
      window.open(u, "_blank");
    }, idx * 500);
  });

  showToast("Enviando emergencia por WhatsApp...", "warning", 3000);
}

function openEmergencyModal() {
  document.getElementById("emergencyModal").classList.add("show");
  toggleAppMenu();
}
function closeEmergencyModal() { document.getElementById("emergencyModal").classList.remove("show"); }

function callNow(phone) {
  window.location.href = "tel:" + phone;
}

function sendWhatsApp(phone) {
  const loc = State.userLat && State.userLng ?
    `Ubicaci?n: https://maps.google.com/?q=${State.userLat},${State.userLng}` :
    'Ubicaci?n no disponible';
  const msg = `Emergencia Rutograma\n${loc}\nPor favor comunicarse.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function openUrgencyModal() {
  document.getElementById('urgencyModal').classList.add('show');
  toggleAppMenu();
}
function closeUrgencyModal() { document.getElementById('urgencyModal').classList.remove('show'); }

async function uploadLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Selecciona una imagen v?lida', 'warning'); return; }

  const formData = new FormData();
  formData.append('logo', file);
  formData.append('type', 'logo');

  try {
    const token = Auth.getToken();
    const res = await fetch('/api/saas/upload-logo', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al subir');
    showToast('? Logo actualizado correctamente', 'info');
    setTimeout(() => location.reload(), 1000);
  } catch (e) {
    showToast(e.message || 'Error al subir logo', 'warning');
  }
  event.target.value = '';
}



function getRiskColor(severity) {
  const colors = { low: '#34a853', medium: '#f57c00', high: '#e65100', critical: '#c62828' };
  return colors[severity] || '#ea4335';
}

async function deleteRisk(id, lat, lng) {
  if (!confirm('?Eliminar este punto de riesgo?')) return;
  try {
    await api(`/riskpoints/${id}`, { method: 'DELETE' });
    loadNearbyRisks(State.userLat, State.userLng);
    showToast('Riesgo eliminado', 'info');
  } catch (e) {
    showToast(e.message || 'Error al eliminar', 'warning');
  }
}

// ?? IA: EVALUACI?N DE RUTA ????????????????????????????????????
function toggleAiPanel() {
  const panel = document.getElementById('aiPanel');
  panel.classList.toggle('open');
  const btn = document.getElementById('fabAi');
  if (panel.classList.contains('open') && State.routeData) {
    evaluateRouteAI();
  }
}

async function evaluateRouteAI() {
  if (!State.routeData || !State.routeData.riskAnalysis) {
    document.getElementById('aiPanelBody').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2)">No hay ruta calculada</div>';
    return;
  }

  const rd = State.routeData;
  const risks = rd.riskAnalysis.nearby_risks || [];
  const wazeAlerts = rd.wazeAlerts || [];
  const weather = rd.weather || {};

  // Calcular score base (0-100)
  let score = 100;
  let factors = [];

  // Riesgos cercanos
  if (risks.length > 0) {
    const highRisks = risks.filter(r => r.severity === 'high' || r.severity === 'critical').length;
    const medRisks = risks.filter(r => r.severity === 'medium').length;
    score -= highRisks * 15;
    score -= medRisks * 8;
    factors.push({ icon: '??', text: `${risks.length} puntos de riesgo en la ruta`, impact: highRisks > 0 ? 'high' : 'medium' });
  }

  // Alertas Waze
  if (wazeAlerts.length > 0) {
    score -= wazeAlerts.length * 5;
    factors.push({ icon: '??', text: `${wazeAlerts.length} alertas Waze activas`, impact: wazeAlerts.length > 3 ? 'high' : 'medium' });
  }

  // Clima
  if (weather.rain) {
    score -= 20;
    factors.push({ icon: '???', text: `Lluvia: ${weather.rain} mm`, impact: 'high' });
  }
  if (weather.fog) {
    score -= 15;
    factors.push({ icon: '???', text: 'Niebla reportada', impact: 'medium' });
  }

  // Tiempo de viaje (noche = m?s riesgo)
  const hour = new Date().getHours();
  if (hour < 6 || hour > 20) {
    score -= 10;
    factors.push({ icon: '??', text: 'Viaje en horario nocturno', impact: 'medium' });
  }

  score = Math.max(0, Math.min(100, score));

  let scoreClass = 'excellent';
  let scoreText = 'Excelente';
  if (score < 40) { scoreClass = 'danger'; scoreText = 'Riesgosa'; }
  else if (score < 60) { scoreClass = 'warning'; scoreText = 'Precauci?n'; }
  else if (score < 80) { scoreClass = 'good'; scoreText = 'Buena'; }

  let html = `
    <div class="ai-score ${scoreClass}">
      <div class="ai-score-val">${score}</div>
      <div class="ai-score-label">${scoreText}</div>
    </div>
    <div style="font-weight:600;margin-bottom:8px;color:var(--text)">Factores evaluados:</div>
  `;

  if (factors.length === 0) {
    html += '<div style="color:var(--text2);font-size:.85rem;padding:8px 0">? No se detectaron factores de riesgo</div>';
  } else {
    factors.forEach(f => {
      html += `
        <div class="ai-factor">
          <span class="a-icon">${f.icon}</span>
          <span class="a-text">${f.text}</span>
          <span class="a-impact ${f.impact}">${f.impact === 'high' ? 'Alto' : f.impact === 'medium' ? 'Medio' : 'Bajo'}</span>
        </div>
      `;
    });
  }

  html += `
    <div style="margin-top:16px;padding:12px;background:var(--surface2);border-radius:var(--radius-sm);font-size:.82rem;color:var(--text2)">
      ?? Evaluaci?n generada por IA basada en riesgos detectados, tr?fico Waze y condiciones clim?ticas.
    </div>
  `;

  document.getElementById('aiPanelBody').innerHTML = html;
}

// ?? CARGAR ALERTAS WAZE EN MAPA ????????????????????????????????
async function loadWazeAlerts(lat, lng) {
  try {
    const data = await api(`/external/waze?lat=${lat}&lng=${lng}&radius=10`);
    State.wazeMarkers.forEach(m => State.map.removeLayer(m));
    State.wazeMarkers = [];

    (data || []).forEach(alert => {
      if (!alert.location) return;
      const marker = L.marker([alert.location.y, alert.location.x], {
        icon: L.divIcon({
          className: 'waze-alert-marker',
          html: '??',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
      }).addTo(State.map);

      const popup = `<div class="waze-alert-popup"><div class="w-type">${alert.type || 'Alerta'}</div><div class="w-desc">${alert.reportDescription || 'Sin descripci?n'}</div></div>`;
      marker.bindPopup(popup);
      State.wazeMarkers.push(marker);
    });
  } catch (e) {
    console.error('Error cargando Waze:', e);
  }
}

// ?? ACTIVAR MODO AGREGAR RIESGO ????????????????????????????????
function enableAddRiskMode() {
  State.addRiskMode = true;
  showToast('Toca el mapa para registrar un riesgo', 'info', 3000);
}

function closeRiskTypeModal() { document.getElementById('riskTypeModal').classList.remove('show'); }
function closeAddRiskModal() { document.getElementById('addRiskModal').classList.remove('show'); }

function selectRiskType(type) {
  closeRiskTypeModal();
  if (State.clickLatLng) {
    document.getElementById('addRiskModal').classList.add('show');
  } else {
    showToast('No hay coordenadas seleccionadas', 'warning');
    State.addRiskMode = false;
  }
}

async function saveRiskPoint() {
  const { clickLatLng } = State;
  if (!clickLatLng) return;

  const type = document.getElementById('riskTypeSelect').value;
  const name = document.getElementById('riskName').value.trim() || type;
  const severity = document.getElementById('riskSeverity').value;

  const body = {
    type,
    name,
    lat: clickLatLng.lat,
    lng: clickLatLng.lng,
    severity,
    is_permanent: true,
    radius_meters: 200
  };

  try {
    const result = await api('/riskpoints', { method: 'POST', body });
    const color = getRiskColor(severity);
    const marker = L.circleMarker([clickLatLng.lat, clickLatLng.lng], {
      radius: 16, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9
    }).addTo(State.map);

    const popupContent = `<b>${name}</b><br>Severidad: ${severity}<br>Tipo: ${type}<br>
      <button onclick="deleteRisk('${result.id}',${clickLatLng.lat},${clickLatLng.lng})">??? Eliminar</button>`;
    marker.bindPopup(popupContent);

    showToast('?? Riesgo registrado en el mapa', 'warning');
    closeAddRiskModal();
  } catch (e) {
    showToast(e.message || 'Error al guardar riesgo', 'warning');
  }

  State.clickLatLng = null;
}

function deleteRisk(id, lat, lng) {
  if (!confirm('?Eliminar este punto de riesgo?')) return;
  try {
    api(`/riskpoints/${id}`, { method: 'DELETE' });
    // Remover marcador del mapa (simplificado: recargar)
    location.reload();
  } catch (e) {
    showToast(e.message || 'Error al eliminar', 'warning');
  }
}

// ?? MODIFICAR CALCULAR RUTA PARA INCLUIR WAZE E IA ???????????
const originalCalculateRoute = calculateRoute;
calculateRoute = async function() {
  await originalCalculateRoute();
  if (State.destLat && State.destLng) {
    loadWazeAlerts(State.destLat, State.destLng);
    if (State.routeData) {
      evaluateRouteAI();
      const aiPanel = document.getElementById('aiPanel');
      if (aiPanel.classList.contains('open')) {
        evaluateRouteAI();
      }
    }
  }
};

// ?? AGREGAR BOT?N DE RIESGO EN EL MEN? ????????????????????????
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.app-sidebar-nav');
  if (nav) {
    const riskItem = document.createElement('div');
    riskItem.className = 'nav-item';
    riskItem.onclick = () => { enableAddRiskMode(); toggleAppMenu(); };
    riskItem.innerHTML = '<span>??</span> Agregar Riesgo en Mapa';
    nav.appendChild(riskItem);
  }

  // Cargar n?meros de p?nico guardados
  const saved = localStorage.getItem('panicPhones');
  if (saved) {
    try { State.panicPhones = JSON.parse(saved); } catch(e) {}
  }
});

// ?? CONFIGURACI?N BOT?N DE P?NICO ??????????????????????????????
function openPanicConfigModal() {
  const phones = State.panicPhones || ['974328000', '948340370'];
  document.getElementById('panicPhone1').value = phones[0] || '';
  document.getElementById('panicPhone2').value = phones[1] || '';
  document.getElementById('panicPhone3').value = phones[2] || '';
  document.getElementById('panicConfigModal').classList.add('show');
  toggleAppMenu();
}
function closePanicConfigModal() { document.getElementById('panicConfigModal').classList.remove('show'); }

function savePanicNumbers() {
  const p1 = document.getElementById('panicPhone1').value.trim();
  const p2 = document.getElementById('panicPhone2').value.trim();
  const p3 = document.getElementById('panicPhone3').value.trim();

  if (!p1) { showToast('El n?meno 1 es requerido', 'warning'); return; }

  const phones = [p1];
  if (p2) phones.push(p2);
  if (p3) phones.push(p3);

  State.panicPhones = phones;
  localStorage.setItem('panicPhones', JSON.stringify(phones));
  closePanicConfigModal();
  showToast('? N?meros de p?nico actualizados', 'info');
}

// ?? MODIFICAR BOT?N DE P?NICO PARA USAR N?MEROS GUARDADOS ?????
const originalPanicButton = panicButton;
panicButton = function() {
  const phones = (State.panicPhones && State.panicPhones.length > 0) ?
    State.panicPhones : ['974328000', '948340370'];

  const loc = getLocationString();
  const msg = "EMERGENCIA en ruta\n" + loc + "\nPor favor comunicarse con nosotros";

  const url = "https://wa.me/" + phones[0] + "?text=" + encodeURIComponent(msg);
  window.location.href = url;

  phones.forEach((phone, idx) => {
    if (idx === 0) return;
    setTimeout(() => {
      const u = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
      window.open(u, "_blank");
    }, idx * 500);
  });

  showToast("Enviando emergencia por WhatsApp...", "warning", 3000);
};

// ?? CARGAR RIESGOS EXISTENTES ????????????????????????
async function loadExistingRisks() {
  try {
    const risks = await api('/riskpoints');
    (risks || []).forEach(r => {
      const color = getRiskColor(r.severity);
      const marker = L.circleMarker([r.lat, r.lng], {
        radius: 16, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9
      }).addTo(State.map);

      const popup = `<b>${r.name || r.type}</b><br>Severidad: ${r.severity}<br>
        <button onclick="deleteRisk('${r.id}')">??? Eliminar</button>`;
      marker.bindPopup(popup);
    });
  } catch (e) {
    console.error('Error cargando riesgos:', e);
  }
}

// ?? ELIMINAR RIESGO ???????????????????????????????????
function deleteRisk(id) {
  if (!confirm('?Eliminar este punto de riesgo?')) return;
  try {
    api(`/riskpoints/${id}`, { method: 'DELETE' });
    showToast('Riesgo eliminado', 'info');
    loadExistingRisks(); // Recargar
  } catch (e) {
    showToast(e.message || 'Error al eliminar', 'warning');
  }
};
