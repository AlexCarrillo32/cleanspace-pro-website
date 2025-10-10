# Production Deployment Checklist

**Date**: October 10, 2025
**Status**: Ready for Deployment 🚀

---

## Pre-Deployment Checklist

### 1. Server Preparation ✅

- [ ] Server provisioned (Ubuntu 20.04+ or equivalent)
- [ ] Domain name configured and DNS pointing to server IP
- [ ] Firewall configured (ports 80, 443, 22 open)
- [ ] Non-root user created for running the application
- [ ] SSH key authentication enabled

### 2. Software Requirements ✅

- [ ] Node.js 18+ installed (`node -v`)
- [ ] npm installed (`npm -v`)
- [ ] PM2 installed globally (`npm install -g pm2`)
- [ ] Nginx installed (`nginx -v`)
- [ ] Certbot installed for Let's Encrypt (`certbot --version`)
- [ ] Git installed (`git --version`)

### 3. Application Setup ✅

- [ ] Repository cloned to `/opt/cleanspace-pro` or preferred directory
- [ ] `.env` file created from `.env.production.example`
- [ ] All environment variables configured (especially `GROQ_API_KEY`)
- [ ] Dependencies installed (`npm run deploy:install`)
- [ ] Database directory created with correct permissions
- [ ] Log directory created with correct permissions

### 4. Environment Configuration ✅

Required environment variables in `.env`:

- [ ] `GROQ_API_KEY` - Your Groq API key
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `DB_PATH` - Database file path
- [ ] `CORS_ORIGIN` - Your domain URL
- [ ] `DAILY_BUDGET_LIMIT` - Cost limit (e.g., 10.00)
- [ ] `MONTHLY_BUDGET_LIMIT` - Cost limit (e.g., 300.00)

### 5. Pre-Flight Tests ✅

- [ ] Linting passes (`npm run lint`)
- [ ] All tests pass (`npm test`)
- [ ] Production startup script is executable (`chmod +x scripts/production-start.sh`)
- [ ] Database initializes correctly
- [ ] Server starts without errors (`npm start`)

---

## Deployment Steps

### Step 1: Clone and Setup

```bash
# On production server
cd /opt
sudo git clone https://github.com/AlexCarrillo32/cleanspace-pro-website.git cleanspace-pro
sudo chown -R cleanspace:cleanspace /opt/cleanspace-pro
cd /opt/cleanspace-pro

# Create .env file
cp .env.production.example .env
nano .env  # Edit with production values
```

### Step 2: Install Dependencies

```bash
npm run deploy:install
```

### Step 3: Create Required Directories

```bash
sudo mkdir -p /var/lib/cleanspace-pro
sudo mkdir -p /var/log/cleanspace-pro
sudo chown -R cleanspace:cleanspace /var/lib/cleanspace-pro
sudo chown -R cleanspace:cleanspace /var/log/cleanspace-pro
```

### Step 4: Configure Systemd Service

```bash
sudo cp deploy/cleanspace-pro.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cleanspace-pro
```

### Step 5: Configure Nginx

```bash
# Update nginx.conf with your domain
sed -i 's/yourdomain.com/your-actual-domain.com/g' deploy/nginx.conf

# Copy configuration
sudo cp deploy/nginx.conf /etc/nginx/sites-available/cleanspace-pro
sudo ln -s /etc/nginx/sites-available/cleanspace-pro /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t
```

### Step 6: Obtain SSL Certificate

```bash
# Stop nginx temporarily
sudo systemctl stop nginx

# Get certificate
sudo certbot certonly --standalone -d your-actual-domain.com -d www.your-actual-domain.com

# Start nginx
sudo systemctl start nginx
```

### Step 7: Start Application

```bash
# Option A: Using systemd service
sudo systemctl start cleanspace-pro
sudo systemctl status cleanspace-pro

# Option B: Using PM2 directly
npm run prod
```

### Step 8: Verify Deployment

```bash
# Check application health
curl http://localhost:3000/api/health

# Check via Nginx (HTTPS)
curl https://your-domain.com/api/health

# View logs
sudo journalctl -u cleanspace-pro -f
# OR
pm2 logs cleanspace-pro
```

---

## Post-Deployment Verification

### Health Checks ✅

- [ ] Server responds at `https://your-domain.com`
- [ ] API health endpoint returns 200: `https://your-domain.com/api/health`
- [ ] Dashboard loads: `https://your-domain.com/dashboard.html`
- [ ] SSL certificate is valid (green padlock)
- [ ] All metrics show healthy status

### Functional Tests ✅

- [ ] Can create a new booking via API
- [ ] Chat endpoint responds correctly
- [ ] Cost optimization is working (check `/api/optimization/metrics`)
- [ ] Safety systems active (check `/api/safety/metrics`)
- [ ] Reliability systems active (check `/api/reliability/metrics`)

### Performance Tests ✅

- [ ] Response time < 500ms for chat endpoint
- [ ] Dashboard loads in < 2 seconds
- [ ] Database queries perform well
- [ ] No memory leaks (monitor with `pm2 monit`)

### Security Verification ✅

- [ ] HTTPS enforced (HTTP redirects to HTTPS)
- [ ] Security headers present (check with `curl -I`)
- [ ] Rate limiting works (test by making rapid requests)
- [ ] Sensitive files blocked (try accessing `.env` via browser)
- [ ] CORS configured correctly

---

## Monitoring Setup

### PM2 Monitoring ✅

```bash
# View logs
pm2 logs cleanspace-pro

# Monitor resources
pm2 monit

# View process info
pm2 show cleanspace-pro
```

### Log Monitoring ✅

```bash
# Application logs
tail -f /var/log/cleanspace-pro/app.log

# Nginx access logs
tail -f /var/log/nginx/cleanspace-access.log

# Nginx error logs
tail -f /var/log/nginx/cleanspace-error.log

# System service logs
sudo journalctl -u cleanspace-pro -f
```

### Metrics Dashboard ✅

- [ ] Access monitoring dashboard: `https://your-domain.com/dashboard.html`
- [ ] Verify auto-refresh is working (every 10 seconds)
- [ ] Check all metric cards show data

---

## Rollback Plan

### If deployment fails:

```bash
# Stop the service
sudo systemctl stop cleanspace-pro
# OR
pm2 stop cleanspace-pro

# Restore previous version
git checkout <previous-commit-hash>
npm run deploy:install

# Restart
sudo systemctl start cleanspace-pro
# OR
pm2 restart cleanspace-pro
```

---

## Common Issues & Solutions

### Issue: Port 3000 already in use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

### Issue: Database permissions error

```bash
sudo chown -R cleanspace:cleanspace /var/lib/cleanspace-pro
chmod 755 /var/lib/cleanspace-pro
```

### Issue: Nginx 502 Bad Gateway

```bash
# Check if app is running
sudo systemctl status cleanspace-pro
pm2 status

# Check app logs
pm2 logs cleanspace-pro
```

### Issue: SSL certificate errors

```bash
# Renew certificate
sudo certbot renew

# Restart nginx
sudo systemctl restart nginx
```

---

## Maintenance Commands

### Update Application

```bash
cd /opt/cleanspace-pro
git pull origin main
npm run deploy:install
pm2 restart cleanspace-pro
```

### View Metrics

```bash
# Cost metrics
curl http://localhost:3000/api/optimization/metrics | jq

# Safety metrics
curl http://localhost:3000/api/safety/metrics | jq

# Reliability metrics
curl http://localhost:3000/api/reliability/metrics | jq
```

### Database Backup

```bash
# Backup database
cp /var/lib/cleanspace-pro/cleanspace.db \
   /var/lib/cleanspace-pro/backups/cleanspace-$(date +%Y%m%d).db
```

### SSL Certificate Renewal

```bash
# Auto-renewal is configured, but to manually renew:
sudo certbot renew
sudo systemctl reload nginx
```

---

## Success Criteria

### ✅ Deployment Complete When:

1. Application is running via PM2 or systemd
2. Nginx is serving the app over HTTPS
3. All health checks pass
4. Dashboard shows healthy metrics
5. Can successfully create bookings
6. Logs show no errors
7. SSL certificate is valid
8. Monitoring is active

---

## Next Steps After Deployment

1. **Set up automated backups** - Database and logs
2. **Configure monitoring alerts** - Email/Slack notifications
3. **Enable log rotation** - Prevent disk space issues
4. **Performance testing** - Load test with realistic traffic
5. **Documentation** - Update internal docs with production URLs
6. **Team training** - Show team how to monitor and troubleshoot

---

## Contact & Support

- **Server Logs**: `/var/log/cleanspace-pro/`
- **Nginx Logs**: `/var/log/nginx/`
- **PM2 Logs**: `pm2 logs cleanspace-pro`
- **Health Check**: `https://your-domain.com/api/health`
- **Dashboard**: `https://your-domain.com/dashboard.html`

---

**Deployment Package Version**: 1.0
**Last Updated**: October 10, 2025
**Status**: Production Ready ✅
