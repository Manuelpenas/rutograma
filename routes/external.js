const express = require('express');
const axios = require('axios');
const { authMiddleware, checkTenantActive } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, checkTenantActive);

// Proxy Waze feed — evita CORS desde el browser
// GET /api/external/waze?lat=X&lng=Y&radius=10
router.get('/waze', async (req, res) => {
  const { lat, lng, radius = 0.1 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat y lng requeridos.' });

  const top    = parseFloat(lat) + parseFloat(radius);
  const bottom = parseFloat(lat) - parseFloat(radius);
  const left   = parseFloat(lng) - parseFloat(radius);
  const right  = parseFloat(lng) + parseFloat(radius);

  try {
    const response = await axios.get('https://www.waze.com/live-map/api/georss', {
      params: { top, bottom, left, right, env: 'row', types: 'alerts,jams' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Rutograma/1.0)',
        'Accept': 'application/json'
      },
      timeout: 5000
    });
    res.json(response.data);
  } catch {
    // Si Waze falla, devolver array vacío sin romper la app
    res.json({ alerts: [], jams: [] });
  }
});

// Proxy OpenWeatherMap — usa la key del tenant o la global
// GET /api/external/weather?lat=X&lng=Y
router.get('/weather', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat y lng requeridos.' });

  const apiKey = req.user.openweatherKey || process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'API key de OpenWeatherMap no configurada.' });

  try {
    const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: { lat, lon: lng, appid: apiKey, units: 'metric', lang: 'es' },
      timeout: 5000
    });
    const d = response.data;
    res.json({
      temp: d.main.temp,
      feels_like: d.main.feels_like,
      humidity: d.main.humidity,
      description: d.weather[0].description,
      icon: d.weather[0].icon,
      wind_speed: d.wind.speed,
      visibility: d.visibility,
      weather_id: d.weather[0].id,
      city: d.name
    });
  } catch (err) {
    res.status(503).json({ error: 'No se pudo obtener el clima.' });
  }
});

// Proxy Nominatim geocodificación — búsqueda de lugares
// GET /api/external/geocode?q=texto
router.get('/geocode', async (req, res) => {
  const { q, lat, lng } = req.query;

  try {
    let url, params;
    if (lat && lng) {
      // Reverse geocoding
      url = 'https://nominatim.openstreetmap.org/reverse';
      params = { lat, lon: lng, format: 'json', 'accept-language': 'es' };
    } else if (q) {
      url = 'https://nominatim.openstreetmap.org/search';
      params = { q, format: 'json', limit: 8, 'accept-language': 'es', addressdetails: 1 };
    } else {
      return res.status(400).json({ error: 'q o lat/lng requeridos.' });
    }

    const response = await axios.get(url, {
      params,
      headers: { 'User-Agent': 'Rutograma/1.0 (contacto@rutograma.com)' },
      timeout: 5000
    });
    res.json(response.data);
  } catch {
    res.status(503).json({ error: 'Error al geocodificar.' });
  }
});

// Proxy OSRM routing — 100% gratuito, sin API key
// GET /api/external/route?from_lat=X&from_lng=X&to_lat=Y&to_lng=Y
router.get('/route', async (req, res) => {
  const { from_lat, from_lng, to_lat, to_lng } = req.query;
  if (!from_lat || !from_lng || !to_lat || !to_lng) {
    return res.status(400).json({ error: 'Coordenadas de origen y destino requeridas.' });
  }

  try {
    const coords = `${from_lng},${from_lat};${to_lng},${to_lat}`;
    const response = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${coords}`,
      {
        params: { overview: 'full', geometries: 'geojson', steps: true, annotations: false, alternatives: true },
        headers: { 'User-Agent': 'Rutograma/1.0' },
        timeout: 10000
      }
    );

    if (response.data.code !== 'Ok') {
      return res.status(400).json({ error: 'No se encontró ruta.' });
    }

    const routes = response.data.routes.map((route, idx) => ({
      id: idx,
      distance_km: Math.round(route.distance / 100) / 10,
      duration_min: Math.round(route.duration / 60),
      geometry: route.geometry,
      legs: route.legs,
      is_primary: idx === 0
    }));

    res.json({
      routes,
      primary: routes[0]
    });
  } catch {
    res.status(503).json({ error: 'No se pudo calcular la ruta. Intente nuevamente.' });
  }
});

// Proxy Overpass API — POIs de OpenStreetMap (escuelas, hospitales, etc.)
// GET /api/external/pois?lat=X&lng=Y&radius_m=5000
router.get('/pois', async (req, res) => {
  const { lat, lng, radius_m = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat y lng requeridos.' });

  const query = `
    [out:json][timeout:15];
    (
      node["amenity"="school"](around:${radius_m},${lat},${lng});
      node["amenity"="hospital"](around:${radius_m},${lat},${lng});
      node["amenity"="police"](around:${radius_m},${lat},${lng});
      node["highway"="crossing"](around:${radius_m},${lat},${lng});
      node["crossing"="traffic_signals"](around:${radius_m},${lat},${lng});
      node["highway"="speed_camera"](around:${radius_m},${lat},${lng});
      way["highway"="construction"](around:${radius_m},${lat},${lng});
    );
    out body;
  `;

  try {
    const response = await axios.post('https://overpass-api.de/api/interpreter',
      `data=${encodeURIComponent(query)}`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Rutograma/1.0' },
        timeout: 15000
      }
    );

    const mapped = (response.data.elements || []).map(el => ({
      id: el.id,
      lat: el.lat,
      lng: el.lon,
      type: mapOsmType(el.tags),
      name: el.tags?.name || el.tags?.amenity || 'Sin nombre'
    }));

    res.json(mapped);
  } catch {
    res.json([]);
  }
});

function mapOsmType(tags = {}) {
  if (tags.amenity === 'school')       return 'school';
  if (tags.amenity === 'hospital')     return 'hospital';
  if (tags.amenity === 'police')       return 'police';
  if (tags.highway === 'crossing')     return 'pedestrian_crossing';
  if (tags.crossing === 'traffic_signals') return 'pedestrian_crossing';
  if (tags.highway === 'speed_camera') return 'speed_camera';
  if (tags.highway === 'construction') return 'construction';
  return 'other';
}

module.exports = router;
