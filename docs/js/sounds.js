/**
 * Sistema de alertas sonoras — Web Audio API (sin dependencias)
 *
 * Tres niveles según proximidad y severidad:
 *  beepShort  — pitido corto y suave  → riesgo próximo (300–500 m)
 *  beepMedium — pitido medio           → riesgo cercano (150–300 m)
 *  beepLong   — pitido largo y grave   → peligro inmediato (<150 m)
 */

const SoundAlert = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq = 880, duration = 0.15, volume = 0.3, type = 'sine', decay = 0.1 } = {}) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);

      gain.gain.setValueAtTime(volume, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration + decay);

      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration + decay);
    } catch (e) {
      console.warn('[Sound] No se pudo reproducir:', e);
    }
  }

  /**
   * Pitido corto y suave — riesgo en 300–500 m
   * Escuela, cruce peatonal, velocidad reducida, cámara
   */
  function beepShort() {
    tone({ freq: 880, duration: 0.12, volume: 0.25, type: 'sine', decay: 0.08 });
  }

  /**
   * Pitido medio — riesgo en 150–300 m
   * Curva peligrosa, tráfico, construcción, cruce de animales
   */
  function beepMedium() {
    tone({ freq: 660, duration: 0.30, volume: 0.50, type: 'triangle', decay: 0.15 });
    setTimeout(() => tone({ freq: 660, duration: 0.30, volume: 0.50, type: 'triangle', decay: 0.15 }), 400);
  }

  /**
   * Pitido largo y grave — peligro inmediato (<150 m)
   * Accidente, derrumbe, vía cerrada, neblina densa, lluvia intensa
   */
  function beepLong() {
    tone({ freq: 220, duration: 0.7, volume: 0.8, type: 'sawtooth', decay: 0.3 });
    setTimeout(() => tone({ freq: 180, duration: 0.9, volume: 0.9, type: 'sawtooth', decay: 0.4 }), 900);
    setTimeout(() => tone({ freq: 200, duration: 1.0, volume: 1.0, type: 'sawtooth', decay: 0.5 }), 1900);
  }

  /**
   * Decide qué pitido emitir según tipo de riesgo y distancia
   * @param {string} riskType  - tipo del punto de riesgo
   * @param {string} severity  - low / medium / high / critical
   * @param {number} distanceM - distancia en metros
   */
  function alertForRisk(riskType, severity, distanceM) {
    const critical = ['accident', 'road_closed', 'landslide', 'flood', 'weather_fog'];
    const high     = ['curve', 'animal_crossing', 'construction', 'pothole', 'weather_rain', 'weather_ice'];
    const medium   = ['school', 'hospital', 'pedestrian_crossing', 'traffic', 'toll'];
    const low      = ['speed_bump', 'speed_camera', 'police', 'other'];

    if (severity === 'critical' || (distanceM < 150 && critical.includes(riskType))) {
      beepLong();
    } else if (severity === 'high' || (distanceM < 300 && high.includes(riskType))) {
      beepMedium();
    } else if (medium.includes(riskType) && distanceM < 300) {
      beepMedium();
    } else if (distanceM < 500) {
      beepShort();
    }
  }

  // Desbloqueo de AudioContext al primer toque (requerido en móviles)
  document.addEventListener('touchstart', () => getCtx(), { once: true });
  document.addEventListener('click', () => getCtx(), { once: true });

  return { beepShort, beepMedium, beepLong, alertForRisk };
})();
