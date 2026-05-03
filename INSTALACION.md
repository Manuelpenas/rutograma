# 🚀 RUTOGRAMA — Guía de Instalación en Servidor

## Índice
1. [Requisitos del Servidor](#1-requisitos-del-servidor)
2. [Configuración inicial Ubuntu](#2-configuración-inicial-ubuntu)
3. [Instalar Node.js 22+](#3-instalar-nodejs-22)
4. [Subir el proyecto al servidor](#4-subir-el-proyecto-al-servidor)
5. [Configurar variables de entorno](#5-configurar-variables-de-entorno)
6. [Instalar dependencias y verificar](#6-instalar-dependencias-y-verificar)
7. [Configurar PM2 proceso permanente](#7-configurar-pm2-proceso-permanente)
8. [Configurar Nginx proxy reverso](#8-configurar-nginx-proxy-reverso)
9. [SSL con Lets Encrypt HTTPS](#9-ssl-con-lets-encrypt-https)
10. [Backup automático de la base de datos](#10-backup-automático-de-la-base-de-datos)
11. [Acceso inicial al sistema](#11-acceso-inicial-al-sistema)
12. [Gestión y actualizaciones](#12-gestión-y-actualizaciones)

---

## 1. Requisitos del Servidor

| Recurso | Mínimo recomendado |
|---------|-------------------|
| CPU | 1 vCore |
| RAM | 1 GB |
| Disco | 20 GB SSD |
| SO | Ubuntu 22.04 LTS o 24.04 LTS |
| Red | IP pública fija |
| Dominio | Apuntando a la IP del servidor (registro A en DNS) |

Proveedores recomendados: DigitalOcean ($6/mes), Vultr, Hetzner, AWS Lightsail, Contabo.

---

## 2. Configuración inicial Ubuntu

Conectarse via SSH:

```bash
ssh root@TU_IP_DEL_SERVIDOR
```

Actualizar el sistema:

```bash
apt update && apt upgrade -y
apt install -y git curl wget unzip nginx certbot python3-certbot-nginx ufw
```

Configurar firewall:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Crear usuario de aplicación:

```bash
adduser rutograma
usermod -aG sudo rutograma
su - rutograma
```

---

## 3. Instalar Node.js 22+

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # debe mostrar v22.x.x
npm --version
sudo npm install -g pm2
```

---

## 4. Subir el proyecto al servidor

### Desde tu PC con SCP

En tu PC local (PowerShell o terminal en la carpeta D:\Deyfor\Sistemas):

```powershell
# Comprimir proyecto sin node_modules ni base de datos
tar -czf rutograma.tar.gz Rutograma --exclude="Rutograma/node_modules" --exclude="Rutograma/database/*.db"

# Subir al servidor
scp rutograma.tar.gz rutograma@TU_IP:/home/rutograma/
```

En el servidor:

```bash
cd /home/rutograma
tar -xzf rutograma.tar.gz
sudo mv Rutograma /opt/rutograma
cd /opt/rutograma
```

---

## 5. Configurar variables de entorno

```bash
cd /opt/rutograma
nano .env
```

Contenido del archivo .env (cambia los valores):

```
PORT=3000
NODE_ENV=production

JWT_SECRET=pon_aqui_una_cadena_muy_larga_y_aleatoria_de_al_menos_64_caracteres

DB_PATH=/opt/rutograma/database/rutograma.db

SUPER_ADMIN_EMAIL=admin@tuempresa.com
SUPER_ADMIN_PASSWORD=TuPasswordSeguro123!
SUPER_ADMIN_NAME=Administrador Principal

OPENWEATHER_API_KEY=tu_clave_openweathermap_opcional
```

Generar un JWT_SECRET seguro:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Asegurar permisos:

```bash
chmod 600 .env
sudo chown -R rutograma:rutograma /opt/rutograma
```

---

## 6. Instalar dependencias y verificar

```bash
cd /opt/rutograma
npm install --production

# Probar arranque
node server.js
```

Debes ver:

```
RUTOGRAMA iniciado en http://localhost:3000
   Panel Admin: http://localhost:3000/admin
   App:         http://localhost:3000/app
   Monitor:     http://localhost:3000/monitor
```

Presiona Ctrl+C para detener.

---

## 7. Configurar PM2 (proceso permanente)

```bash
cd /opt/rutograma
pm2 start server.js --name rutograma
pm2 save
pm2 startup
# Ejecuta el comando que te indique pm2 startup (con sudo)
```

Comandos útiles:

```bash
pm2 status           # Ver estado de todos los procesos
pm2 logs rutograma   # Ver logs en tiempo real
pm2 restart rutograma
pm2 stop rutograma
pm2 monit            # Panel de monitoreo visual
```

---

## 8. Configurar Nginx (proxy reverso)

```bash
sudo nano /etc/nginx/sites-available/rutograma
```

Contenido (reemplaza tudominio.com por tu dominio):

```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;

    client_max_body_size 5M;

    access_log /var/log/nginx/rutograma.access.log;
    error_log  /var/log/nginx/rutograma.error.log;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
```

Activar y reiniciar:

```bash
sudo ln -s /etc/nginx/sites-available/rutograma /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 9. SSL con Let's Encrypt (HTTPS)

Requisito: el dominio debe apuntar a la IP del servidor (DNS propagado, espera hasta 5 minutos).

```bash
sudo certbot --nginx -d tudominio.com -d www.tudominio.com
```

- Ingresa tu email
- Acepta los términos
- Selecciona opción 2 (redirigir HTTP a HTTPS)

Verificar renovación automática:

```bash
sudo certbot renew --dry-run
```

El certificado se renueva automáticamente cada 90 días.

---

## 10. Backup automático de la base de datos

```bash
mkdir -p /opt/rutograma/backups
nano /opt/rutograma/backup.sh
```

Contenido:

```bash
#!/bin/bash
BACKUP_DIR="/opt/rutograma/backups"
DB_PATH="/opt/rutograma/database/rutograma.db"
DATE=$(date +%Y%m%d_%H%M%S)

cp "$DB_PATH" "$BACKUP_DIR/rutograma_$DATE.db"
gzip "$BACKUP_DIR/rutograma_$DATE.db"
find "$BACKUP_DIR" -name "*.db.gz" -mtime +30 -delete
echo "Backup: rutograma_$DATE.db.gz creado correctamente"
```

```bash
chmod +x /opt/rutograma/backup.sh

# Programar backup diario a las 2:00 AM
crontab -e
```

Añadir esta línea al crontab:

```
0 2 * * * /opt/rutograma/backup.sh >> /var/log/rutograma-backup.log 2>&1
```

---

## 11. Acceso inicial al sistema

Una vez instalado, accede desde cualquier navegador:

| Sección | URL |
|---------|-----|
| Login | https://tudominio.com/ |
| App rutas y alertas | https://tudominio.com/app |
| Módulo Monitor GPS | https://tudominio.com/monitor |
| Panel Administración SaaS | https://tudominio.com/admin |

### Credenciales del Super Admin

```
Email:    admin@tuempresa.com   (el que configuraste en .env)
Password: TuPasswordSeguro123!
```

### Primeros pasos después de instalar

1. Entra al Panel Admin: https://tudominio.com/admin
2. En Clientes, crea tu empresa (Nuevo Cliente)
3. En el modal de cliente ve a la pestaña APIs y Config y configura tu API key de OpenWeatherMap
4. Sube el logo de tu empresa en la pestaña Marca
5. En Usuarios, crea los operadores que usarán la app
6. Entra a https://tudominio.com/app con las credenciales del operador
7. Registra vehículos y conductores desde la app o el panel

---

## 12. Gestión y actualizaciones

### Ver logs en tiempo real

```bash
pm2 logs rutograma
tail -f /var/log/nginx/rutograma.access.log
```

### Actualizar el sistema

```bash
cd /opt/rutograma

# Subir archivos nuevos con SCP desde el PC:
scp -r public/ rutograma@TU_IP:/opt/rutograma/
scp routes/*.js rutograma@TU_IP:/opt/rutograma/routes/

# En el servidor:
pm2 restart rutograma
```

### Restaurar un backup

```bash
pm2 stop rutograma
cp /opt/rutograma/backups/rutograma_FECHA.db.gz /tmp/
gunzip /tmp/rutograma_FECHA.db.gz
cp /tmp/rutograma_FECHA.db /opt/rutograma/database/rutograma.db
pm2 start rutograma
```

### Verificar estado del sistema

```bash
pm2 status
df -h              # espacio en disco
free -h            # memoria RAM
systemctl status nginx
```

---

## Resolución de problemas

### Puerto 3000 ocupado

```bash
fuser -k 3000/tcp
pm2 restart rutograma
```

### Error 502 Bad Gateway en Nginx

```bash
pm2 status
pm2 restart rutograma
sudo systemctl restart nginx
pm2 logs rutograma --lines 30
```

### Permisos de base de datos

```bash
chown -R rutograma:rutograma /opt/rutograma/database/
chmod 755 /opt/rutograma/database/
pm2 restart rutograma
```

### GPS no funciona en la app

El GPS requiere HTTPS. Sin SSL el navegador bloquea el acceso al GPS.
Solución: completar el paso 9 (Let's Encrypt).

---

## Referencia rápida de variables .env

```
PORT=3000
NODE_ENV=production
JWT_SECRET=cadena_de_64_caracteres_aleatorios
DB_PATH=/opt/rutograma/database/rutograma.db
SUPER_ADMIN_EMAIL=admin@tuempresa.com
SUPER_ADMIN_PASSWORD=Password123!
SUPER_ADMIN_NAME=Administrador
OPENWEATHER_API_KEY=clave_opcional
```

---

Rutograma v1.0 — Sistema SaaS de Seguridad Vial
