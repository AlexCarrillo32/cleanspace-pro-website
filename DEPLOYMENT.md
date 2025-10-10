# CleanSpace Pro - Production Deployment Guide

Complete guide for deploying CleanSpace Pro to production.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Detailed Setup](#detailed-setup)
4. [Deployment Options](#deployment-options)
5. [Configuration](#configuration)
6. [Security Checklist](#security-checklist)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

- **Node.js**: v18.0.0 or higher
- **npm**: v8.0.0 or higher
- **Groq API Key**: Get from https://console.groq.com
- **Linux Server**: Ubuntu 20.04+ or similar (recommended)
- **Domain Name**: For production use
- **SSL Certificate**: Let's Encrypt recommended

### Recommended

- **PM2**: Process manager (`npm install -g pm2`)
- **Nginx**: Reverse proxy
- **Firewall**: UFW or similar
- **Monitoring**: New Relic, Sentry, or similar

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/AlexCarrillo32/cleanspace-pro-website.git
cd cleanspace-pro-website
```

### 2. Configure Environment

```bash
# Copy production environment template
cp .env.production.example .env

# Edit configuration (set GROQ_API_KEY and other values)
nano .env
```

### 3. Install Dependencies

```bash
npm ci --production
```

### 4. Start Application

```bash
# With startup script (recommended)
./scripts/production-start.sh

# Or manually
NODE_ENV=production node server.js
```

### 5. Verify

```bash
# Check health
curl http://localhost:3000/api/health

# View dashboard
open http://localhost:3000/dashboard.html
```

---

## Detailed Setup

### Step 1: Server Preparation

#### Update System

```bash
sudo apt update && sudo apt upgrade -y
```

#### Install Node.js

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node -v  # Should be v18.0.0 or higher
npm -v
```

#### Create Application User

```bash
# Create dedicated user (recommended for security)
sudo useradd -r -s /bin/bash -m -d /opt/cleanspace-pro cleanspace
sudo usermod -aG sudo cleanspace  # Optional: if user needs sudo
```

#### Create Required Directories

```bash
# Application directory
sudo mkdir -p /opt/cleanspace-pro
sudo chown cleanspace:cleanspace /opt/cleanspace-pro

# Database directory
sudo mkdir -p /var/lib/cleanspace-pro
sudo chown cleanspace:cleanspace /var/lib/cleanspace-pro
sudo chmod 755 /var/lib/cleanspace-pro

# Log directory
sudo mkdir -p /var/log/cleanspace-pro
sudo chown cleanspace:cleanspace /var/log/cleanspace-pro
sudo chmod 755 /var/log/cleanspace-pro

# Backup directory
sudo mkdir -p /var/backups/cleanspace-pro
sudo chown cleanspace:cleanspace /var/backups/cleanspace-pro
sudo chmod 700 /var/backups/cleanspace-pro
```

---

### Step 2: Application Setup

#### Deploy Application

```bash
# Switch to application user
sudo su - cleanspace

# Clone repository
cd /opt/cleanspace-pro
git clone https://github.com/AlexCarrillo32/cleanspace-pro-website.git .

# Install production dependencies
npm ci --production
```

#### Configure Environment

```bash
# Copy production template
cp .env.production.example .env

# Edit configuration
nano .env
```

**Required Configuration**:
```env
# Set these values
GROQ_API_KEY=gsk_your_actual_groq_api_key
BUSINESS_EMAIL=your-actual-email@domain.com
BUSINESS_PHONE=(555) 123-4567
EMAIL_USER=your-smtp-user@gmail.com
EMAIL_PASSWORD=your-app-password
CORS_ORIGIN=https://yourdomain.com
```

---

### Step 3: Process Management with PM2

#### Install PM2

```bash
sudo npm install -g pm2
```

#### Start Application

```bash
# Using startup script (recommended)
./scripts/production-start.sh

# Or manually with PM2
pm2 start server.js --name cleanspace-pro \
    --max-memory-restart 500M \
    --time \
    --log /var/log/cleanspace-pro/pm2.log \
    --error /var/log/cleanspace-pro/pm2-error.log

# Save PM2 configuration
pm2 save
```

#### Setup PM2 Startup

```bash
# Generate startup script
pm2 startup

# Follow the instructions shown (run the sudo command)

# Save current process list
pm2 save
```

#### PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs cleanspace-pro

# Restart
pm2 restart cleanspace-pro

# Stop
pm2 stop cleanspace-pro

# Monitor
pm2 monit
```

---

### Step 4: Reverse Proxy with Nginx

#### Install Nginx

```bash
sudo apt install -y nginx
```

#### Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/cleanspace-pro
```

**Nginx Configuration**:
```nginx
# CleanSpace Pro - Nginx Configuration

upstream cleanspace_backend {
    server localhost:3000;
    keepalive 64;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/cleanspace-access.log;
    error_log /var/log/nginx/cleanspace-error.log;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;

    # Proxy to Node.js application
    location / {
        proxy_pass http://cleanspace_backend;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }

    # Static files (optional - for better performance)
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        proxy_pass http://cleanspace_backend;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /api/health {
        proxy_pass http://cleanspace_backend/api/health;
        access_log off;
    }
}
```

#### Enable Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/cleanspace-pro /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

### Step 5: SSL/TLS with Let's Encrypt

#### Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

#### Obtain Certificate

```bash
# Get certificate and configure Nginx automatically
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

#### Auto-renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically sets up a cron job for renewal
# Verify it's there
sudo systemctl status certbot.timer
```

---

### Step 6: Firewall Configuration

```bash
# Allow SSH
sudo ufw allow ssh

# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## Configuration

### Environment Variables

See `.env.production.example` for all available options.

**Critical Settings**:

| Variable | Description | Example |
|----------|-------------|---------|
| `GROQ_API_KEY` | Groq API key for AI | `gsk_...` |
| `NODE_ENV` | Environment | `production` |
| `PORT` | Application port | `3000` |
| `DB_PATH` | Database location | `/var/lib/cleanspace-pro/cleanspace.db` |
| `CORS_ORIGIN` | Allowed origin | `https://yourdomain.com` |

**Budget Limits**:

| Variable | Default | Description |
|----------|---------|-------------|
| `DAILY_BUDGET_LIMIT` | `10.00` | Max daily cost (USD) |
| `MONTHLY_BUDGET_LIMIT` | `300.00` | Max monthly cost (USD) |
| `PER_REQUEST_BUDGET_LIMIT` | `0.01` | Max per-request cost (USD) |

---

## Security Checklist

### Before Going Live

- [ ] Change all default passwords and secrets
- [ ] Set strong `SESSION_SECRET` (use: `openssl rand -base64 32`)
- [ ] Configure `CORS_ORIGIN` to your domain
- [ ] Enable SSL/TLS with valid certificate
- [ ] Configure firewall (only ports 22, 80, 443 open)
- [ ] Run as non-root user
- [ ] Set appropriate file permissions (755 for dirs, 644 for files)
- [ ] Enable security headers in Nginx
- [ ] Configure rate limiting
- [ ] Enable PII detection and redaction
- [ ] Enable jailbreak detection
- [ ] Review and test backup strategy
- [ ] Set up monitoring and alerting

### Regular Security Maintenance

- [ ] Update dependencies monthly (`npm update`)
- [ ] Review security alerts (`npm audit`)
- [ ] Rotate API keys quarterly
- [ ] Review access logs weekly
- [ ] Test backups monthly
- [ ] Update OS packages weekly
- [ ] Review user permissions quarterly

---

## Monitoring & Maintenance

### Health Checks

```bash
# Application health
curl https://yourdomain.com/api/health

# System dashboard
open https://yourdomain.com/dashboard.html

# Canary status
curl https://yourdomain.com/api/canary/status
```

### Logs

```bash
# Application logs (PM2)
pm2 logs cleanspace-pro

# Nginx access logs
sudo tail -f /var/log/nginx/cleanspace-access.log

# Nginx error logs
sudo tail -f /var/log/nginx/cleanspace-error.log

# System logs
sudo journalctl -u cleanspace-pro -f
```

### Database Backup

```bash
# Manual backup
sqlite3 /var/lib/cleanspace-pro/cleanspace.db ".backup '/var/backups/cleanspace-pro/backup-$(date +%Y%m%d-%H%M%S).db'"

# Automated backup (add to crontab)
0 2 * * * sqlite3 /var/lib/cleanspace-pro/cleanspace.db ".backup '/var/backups/cleanspace-pro/daily-backup.db'"
```

### Updates

```bash
# Update application
cd /opt/cleanspace-pro
git pull origin main
npm ci --production
pm2 restart cleanspace-pro

# Update dependencies
npm update
npm audit fix
pm2 restart cleanspace-pro
```

---

## Troubleshooting

### Application Won't Start

**Check logs**:
```bash
pm2 logs cleanspace-pro --lines 100
```

**Common issues**:
- Missing `.env` file → Copy from `.env.production.example`
- Invalid `GROQ_API_KEY` → Check key in Groq console
- Port already in use → Change `PORT` in `.env` or stop conflicting process
- Database permissions → Check `/var/lib/cleanspace-pro` permissions

### High Memory Usage

```bash
# Check memory usage
pm2 monit

# Restart with lower memory limit
pm2 restart cleanspace-pro --max-memory-restart 300M
```

### Performance Issues

**Enable caching**:
```env
ENABLE_RESPONSE_CACHE=true
CACHE_TTL=3600
```

**Check database size**:
```bash
du -h /var/lib/cleanspace-pro/cleanspace.db
```

**Optimize database**:
```bash
sqlite3 /var/lib/cleanspace-pro/cleanspace.db "VACUUM;"
```

### SSL Certificate Issues

```bash
# Renew certificate
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

---

## Support

- **Documentation**: See `/docs` directory
- **Issues**: https://github.com/AlexCarrillo32/cleanspace-pro-website/issues
- **Health Dashboard**: `/dashboard.html`
- **API Docs**: `/api/*`

---

## Quick Reference

```bash
# Start
./scripts/production-start.sh

# Stop
pm2 stop cleanspace-pro

# Restart
pm2 restart cleanspace-pro

# Logs
pm2 logs cleanspace-pro

# Status
pm2 status

# Monitor
pm2 monit

# Health check
curl http://localhost:3000/api/health
```

---

**Last Updated**: 2025-10-10
**Version**: 1.0.0
