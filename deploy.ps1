# Script de despliegue para Rutograma en Render (gratis)
# Ejecutar en PowerShell: .\deploy.ps1

Write-Host "=== Desplegando Rutograma en Render (Gratis) ===" -ForegroundColor Cyan

# 1. Verificar que Git esté inicializado
if (-not (Test-Path .git)) {
    Write-Host "Inicializando Git..." -ForegroundColor Yellow
    git init
}

# 2. Agregar archivos y hacer commit
Write-Host "Preparando código..." -ForegroundColor Yellow
git add .
git commit -m "Versión inicial Rutograma - Listo para despliegue"

# 3. Instrucciones para GitHub
Write-Host "`n=== PASOS PARA SUBIR A GITHUB ===" -ForegroundColor Green
Write-Host "1. Ve a https://github.com/new" -ForegroundColor White
Write-Host "2. Nombre del repositorio: rutograma" -ForegroundColor White
Write-Host "3. NO marques 'Initialize with README'" -ForegroundColor White
Write-Host "4. Copia la URL del repo (ej: https://github.com/TU_USUARIO/rutograma.git)" -ForegroundColor White
Write-Host "`nPresiona Enter cuando hayas creado el repo..." -ForegroundColor Yellow
Read-Host

$repoUrl = Read-Host "Pega la URL de tu repositorio GitHub (https://github.com/TU_USUARIO/rutograma.git)"

# 4. Subir a GitHub
Write-Host "Subiendo a GitHub..." -ForegroundColor Yellow
git remote remove origin -ErrorAction SilentlyContinue
git remote add origin $repoUrl
git push -u origin master

# 5. Instrucciones para Render
Write-Host "`n=== PASOS PARA DESPLEGAR EN RENDER ===" -ForegroundColor Green
Write-Host "1. Ve a https://render.com" -ForegroundColor White
Write-Host "2. Regístrate/Inicia sesión (gratis)" -ForegroundColor White
Write-Host "3. Haz clic en 'New +' -> 'Web Service'" -ForegroundColor White
Write-Host "4. Conecta tu cuenta de GitHub" -ForegroundColor White
Write-Host "5. Selecciona el repositorio 'rutograma'" -ForegroundColor White
Write-Host "6. Configuración:" -ForegroundColor Yellow
Write-Host "   - Runtime: Node" -ForegroundColor White
Write-Host "   - Build Command: npm install" -ForegroundColor White
Write-Host "   - Start Command: node server.js" -ForegroundColor White
Write-Host "7. Haz clic en 'Create Web Service'" -ForegroundColor Yellow
Write-Host "`nObtendrás una URL como: https://rutograma.onrender.com" -ForegroundColor Cyan

Write-Host "`n=== DESPLIEGUE COMPLETADO ===" -ForegroundColor Green