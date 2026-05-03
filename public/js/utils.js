/**
 * Utilidades compartidas — Rutograma
 */

const API_BASE = '/api';

// ── Autenticación ──────────────────────────────────────────────────────────
const Auth = {
  getToken() { return localStorage.getItem('rg_token'); },
  getUser()  { try { return JSON.parse(localStorage.getItem('rg_user')); } catch { return null; } },
  logout()   { localStorage.removeItem('rg_token'); localStorage.removeItem('rg_user'); location.href = '/'; },
  check()    {
    const token = this.getToken(), user = this.getUser();
    if (!token || !user) { location.href = '/'; return null; }
    applyBranding(user);
    return user;
  }
};

// ── Aplicar logo, favicon y color primario del tenant ──────────────────────
function applyBranding(user) {
  if (!user) return;

  // Logo en header de app/monitor
  const logoImg = document.getElementById('appLogo') || document.getElementById('monLogo');
  const logoText = document.getElementById('appLogoText') || document.getElementById('monLogoText');
  if (logoImg && user.logoUrl) {
    logoImg.src = user.logoUrl;
    logoImg.style.display = 'inline-block';
    if (logoText) logoText.style.display = 'none';
  }

  // Favicon
  if (user.faviconUrl) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = user.faviconUrl;
    link.type = 'image/x-icon';
  }

  // Color primario (CSS custom properties)
  if (user.primaryColor) {
    document.documentElement.style.setProperty('--primary', user.primaryColor);
    document.documentElement.style.setProperty('--primary-dark', adjustColor(user.primaryColor, -20));
  }
}

function adjustColor(hex, amount) {
  hex = hex.replace('#', '');
  const num = parseInt(hex, 16);
  if (isNaN(num)) return '#1a73e8';
  let r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + amount));
  let g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount));
  let b = Math.max(0, Math.min(255, ((num & 0xFF) + amount)));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ── API fetch wrapper ──────────────────────────────────────────────────────
async function api(path, options = {}) {
  const token = Auth.getToken();
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 401) { Auth.logout(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error desconocido.');
  return data;
}

// ── Haversine (distancia entre dos coordenadas en metros) ──────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Formateadores ──────────────────────────────────────────────────────────
function fmtDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

function fmtDistance(km) {
  if (!km) return '—';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function fmtDatetime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

// ── Íconos y etiquetas de tipos de riesgo ─────────────────────────────────
const RISK_CONFIG = {
  school:             { icon: '🏫', label: 'Escuela',              color: '#1565c0', severity_default: 'medium' },
  hospital:           { icon: '🏥', label: 'Hospital',             color: '#6a1b9a', severity_default: 'low' },
  curve:              { icon: '🔄', label: 'Curva Peligrosa',      color: '#e65100', severity_default: 'high' },
  animal_crossing:    { icon: '🐄', label: 'Cruce de Animales',    color: '#558b2f', severity_default: 'medium' },
  accident:           { icon: '🚨', label: 'Accidente',            color: '#c62828', severity_default: 'critical' },
  construction:       { icon: '🚧', label: 'Construcción/Obra',    color: '#f57f17', severity_default: 'medium' },
  traffic:            { icon: '🚦', label: 'Tráfico Intenso',      color: '#b71c1c', severity_default: 'medium' },
  weather_rain:       { icon: '🌧️', label: 'Lluvia Intensa',       color: '#1565c0', severity_default: 'high' },
  weather_fog:        { icon: '🌫️', label: 'Neblina',              color: '#546e7a', severity_default: 'high' },
  weather_ice:        { icon: '🧊', label: 'Hielo en la vía',      color: '#0277bd', severity_default: 'critical' },
  speed_bump:         { icon: '🔶', label: 'Reductor de Velocidad',color: '#f9a825', severity_default: 'low' },
  pedestrian_crossing:{ icon: '🚶', label: 'Cruce Peatonal',       color: '#1b5e20', severity_default: 'medium' },
  toll:               { icon: '💳', label: 'Peaje',                color: '#4a148c', severity_default: 'low' },
  police:             { icon: '👮', label: 'Control Policial',      color: '#1a237e', severity_default: 'low' },
  road_closed:        { icon: '🚫', label: 'Vía Cerrada',          color: '#b71c1c', severity_default: 'critical' },
  pothole:            { icon: '⚠️',  label: 'Hueco/Bache',          color: '#e65100', severity_default: 'medium' },
  flood:              { icon: '🌊', label: 'Inundación',           color: '#0277bd', severity_default: 'critical' },
  landslide:          { icon: '🪨', label: 'Derrumbe',             color: '#4e342e', severity_default: 'critical' },
  other:              { icon: '⚠️',  label: 'Otro Riesgo',          color: '#757575', severity_default: 'medium' }
};

const SEVERITY_CONFIG = {
  low:      { label: 'Bajo',     color: '#2e7d32', bg: '#e8f5e9' },
  medium:   { label: 'Medio',    color: '#e65100', bg: '#fff3e0' },
  high:     { label: 'Alto',     color: '#c62828', bg: '#ffebee' },
  critical: { label: 'Crítico',  color: '#fff',    bg: '#b71c1c' }
};

function getRiskConfig(type) { return RISK_CONFIG[type] || RISK_CONFIG.other; }
function getSeverityConfig(sev) { return SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.medium; }

// ── Crear marcador de riesgo en Leaflet ───────────────────────────────────
function createRiskIcon(type, severity = 'medium') {
  const rc = getRiskConfig(type);
  const sc = getSeverityConfig(severity);
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${rc.color};border:3px solid ${sc.bg};
      width:36px;height:36px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:1.1rem;box-shadow:0 2px 8px rgba(0,0,0,.3);
    ">${rc.icon}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20]
  });
}

// ── Toast notifications ───────────────────────────────────────────────────
function showToast(msg, type = 'danger', duration = 3500) {
  const existing = document.querySelector('.alert-toast');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = `alert-toast ${type !== 'danger' ? type : ''}`;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), duration);
}

// ── Waze alert type → risk type ───────────────────────────────────────────
function wazeToRiskType(wazeType, wazeSubtype = '') {
  const map = {
    'ACCIDENT':        'accident',
    'JAM':             'traffic',
    'ROAD_CLOSED':     'road_closed',
    'POLICE':          'police',
    'HAZARD':          'other',
    'WEATHERHAZARD':   'weather_rain',
  };
  if (wazeSubtype.includes('FOG'))    return 'weather_fog';
  if (wazeSubtype.includes('ICE'))    return 'weather_ice';
  if (wazeSubtype.includes('RAIN') || wazeSubtype.includes('WATER')) return 'weather_rain';
  if (wazeSubtype.includes('ANIMAL')) return 'animal_crossing';
  if (wazeSubtype.includes('CONSTRUCTION')) return 'construction';
  return map[wazeType] || 'other';
}

// ── Severidad Waze → sistema ──────────────────────────────────────────────
function wazeSeverity(reliability = 0) {
  if (reliability >= 8) return 'critical';
  if (reliability >= 6) return 'high';
  if (reliability >= 4) return 'medium';
  return 'low';
}
