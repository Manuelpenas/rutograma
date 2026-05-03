/**
 * setup.js — Script de configuración inicial
 * Ejecutar: node scripts/setup.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('\n═══════════════════════════════════════════');
console.log('   RUTOGRAMA — Configuración Inicial');
console.log('═══════════════════════════════════════════\n');

// Verificar .env
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(path.join(__dirname, '..', '.env.example'), envPath);
  console.log('✅ Archivo .env creado desde .env.example');
  console.log('   ⚠️  IMPORTANTE: Edita el archivo .env con tus valores antes de continuar.\n');
} else {
  console.log('✅ Archivo .env ya existe.');
}

// Crear directorios necesarios
const dirs = ['database', 'public/css', 'public/js', 'scripts'];
dirs.forEach(d => {
  const full = path.join(__dirname, '..', d);
  if (!fs.existsSync(full)) { fs.mkdirSync(full, { recursive: true }); console.log(`✅ Directorio creado: ${d}`); }
});

// Inicializar base de datos
const { initializeDatabase } = require('../database/db');
initializeDatabase();
console.log('✅ Base de datos inicializada correctamente.\n');

console.log('═══════════════════════════════════════════');
console.log('   Sistema listo. Para iniciar ejecute:');
console.log('   npm start');
console.log('═══════════════════════════════════════════\n');
