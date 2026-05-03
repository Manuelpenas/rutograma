# Script de despliegue automático en Vercel
# 1. Ve a https://vercel.com/account/tokens y crea un token
# 2. Ejecuta: .\deploy-vercel.ps1

param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

Write-Host "Desplegando en Vercel..." -ForegroundColor Cyan

# Establecer token
$env:VERCEL_TOKEN = $Token

# Desplegar (asegúrate de estar en la carpeta del proyecto)
cd D:\DNAmic\DNAmic\claudecode\Rutograma
npx vercel --prod --yes --token $Token

Write-Host "¡Despliegue completado!" -ForegroundColor Green