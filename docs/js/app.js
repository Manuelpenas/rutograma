/**
 * app.js — Version limpia para GitHub Pages
 */
const State = {
  map: null,
  userLat: null, userLng: null,
  vehicles: [], drivers: [],
  alertedPoints: new Set()
};

window.addEventListener('DOMContentLoaded', () => {
  const user = localStorage.getItem('rutograma_user');
  if (!user) {
    document.body.innerHTML = '<h2>Acceso restringido. Usa el backend en <a href="https://rutograma.onrender.com">rutograma.onrender.com</a></h2>';
    return;
  }
  initMap();
  getCurrentPosition();
});

function initMap() {
  if (State.map) return;
  State.map = L.map('map').setView([-12.046, -77.042], 12); // Lima
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
  }).addTo(State.map);
}

function getCurrentPosition() {
  if (!navigator.geolocation) {
    alert('GPS no disponible');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      State.userLat = pos.coords.latitude;
      State.userLng = pos.coords.longitude;
      placeUserMarker(State.userLat, State.userLng);
      State.map.setView([State.userLat, State.userLng], 15);
    },
    err => {
      console.error('GPS error:', err);
      alert('No se pudo obtener GPS. Usa ubicacion manual.');
    }
  );
}

function placeUserMarker(lat, lng) {
  if (State.userMarker) State.map.removeLayer(State.userMarker);
  State.userMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: 'user-location-marker', html: '📍', iconSize: [30,30] })
  }).addTo(State.map);
}

// API helper (se conecta al backend en Render)
async function api(path, opts = {}) {
  const BASE = 'https://rutograma.onrender.com';
  const token = localStorage.getItem('rutograma_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, { ...opts, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

// Cargar riesgos (ejemplo con datos publicos)
async function loadExistingRisks() {
  try {
    const risks = await api('/riskpoints');
    (risks || []).forEach(r => {
      const color = getRiskColor(r.severity);
      const marker = L.circleMarker([r.lat, r.lng], {
        radius: 16, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9
      }).addTo(State.map);
      marker.bindPopup(`<b>${r.name || r.type}</b><br>Severidad: ${r.severity}`);
    });
  } catch (e) {
    console.error('Error cargando riesgos:', e);
  }
}

function getRiskColor(severity) {
  const colors = { high: '#e74c3c', medium: '#f39c12', low: '#2ecc71' };
  return colors[severity] || '#3498db';
}
