#!/bin/bash

# ============================================
# CleanSpace Pro - Production Startup Script
# ============================================
# This script prepares and starts the application in production mode

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  CleanSpace Pro - Production Start${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Check if running as root (not recommended)
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Warning: Running as root is not recommended${NC}"
    echo -e "${YELLOW}   Consider using a dedicated user account${NC}"
    echo ""
fi

# Check Node.js version
echo -e "${BLUE}Checking Node.js version...${NC}"
NODE_VERSION=$(node -v)
echo -e "  Node.js version: ${GREEN}$NODE_VERSION${NC}"

REQUIRED_VERSION="v18.0.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo -e "${RED}❌ Node.js version must be >= $REQUIRED_VERSION${NC}"
    exit 1
fi

# Check if .env file exists
echo ""
echo -e "${BLUE}Checking environment configuration...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo -e "${YELLOW}   Copy .env.production.example to .env and configure it:${NC}"
    echo -e "${YELLOW}   cp .env.production.example .env${NC}"
    exit 1
fi
echo -e "  ${GREEN}✅ .env file found${NC}"

# Check critical environment variables
if [ -z "$GROQ_API_KEY" ] || [ "$GROQ_API_KEY" = "gsk_your_groq_api_key_here" ]; then
    echo -e "${RED}❌ GROQ_API_KEY not configured${NC}"
    echo -e "${YELLOW}   Set GROQ_API_KEY in .env file${NC}"
    exit 1
fi
echo -e "  ${GREEN}✅ GROQ_API_KEY configured${NC}"

# Check database directory
echo ""
echo -e "${BLUE}Checking database directory...${NC}"
DB_DIR=$(dirname "${DB_PATH:-./database/cleanspace.db}")
if [ ! -d "$DB_DIR" ]; then
    echo -e "${YELLOW}⚠️  Database directory doesn't exist, creating...${NC}"
    mkdir -p "$DB_DIR"
    chmod 755 "$DB_DIR"
fi
echo -e "  ${GREEN}✅ Database directory ready${NC}"

# Install dependencies
echo ""
echo -e "${BLUE}Installing dependencies...${NC}"
npm ci --production
echo -e "  ${GREEN}✅ Dependencies installed${NC}"

# Run database migrations (if any)
echo ""
echo -e "${BLUE}Initializing database...${NC}"
# Database initialization happens automatically on first start
echo -e "  ${GREEN}✅ Database will initialize on startup${NC}"

# Create log directory
echo ""
echo -e "${BLUE}Checking log directory...${NC}"
LOG_DIR=$(dirname "${LOG_FILE_PATH:-/var/log/cleanspace-pro/app.log}")
if [ ! -d "$LOG_DIR" ]; then
    echo -e "${YELLOW}⚠️  Log directory doesn't exist, creating...${NC}"
    mkdir -p "$LOG_DIR"
    chmod 755 "$LOG_DIR"
fi
echo -e "  ${GREEN}✅ Log directory ready${NC}"

# Run tests (optional, comment out for faster startup)
echo ""
echo -e "${BLUE}Running tests...${NC}"
if npm test > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ All tests passed${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests failed (continuing anyway)${NC}"
fi

# Check port availability
echo ""
echo -e "${BLUE}Checking port availability...${NC}"
PORT=${PORT:-3000}
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}❌ Port $PORT is already in use${NC}"
    echo -e "${YELLOW}   Stop the existing process or change PORT in .env${NC}"
    exit 1
fi
echo -e "  ${GREEN}✅ Port $PORT is available${NC}"

# Pre-flight checks complete
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  ✅ Pre-flight checks complete${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""

# Start the application
echo -e "${BLUE}Starting CleanSpace Pro...${NC}"
echo ""
echo -e "  🚀 Server starting on port ${GREEN}$PORT${NC}"
echo -e "  📊 Dashboard: ${GREEN}http://localhost:$PORT/dashboard.html${NC}"
echo -e "  🏥 Health: ${GREEN}http://localhost:$PORT/api/health${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""

# Set NODE_ENV to production
export NODE_ENV=production

# Start with PM2 if available, otherwise use node directly
if command -v pm2 &> /dev/null; then
    echo -e "${BLUE}Starting with PM2...${NC}"
    pm2 start server.js --name cleanspace-pro \
        --max-memory-restart 500M \
        --time \
        --log /var/log/cleanspace-pro/pm2.log \
        --error /var/log/cleanspace-pro/pm2-error.log \
        --merge-logs
    pm2 save
    echo ""
    echo -e "${GREEN}✅ Server started with PM2${NC}"
    echo -e "${BLUE}   View logs: ${NC}pm2 logs cleanspace-pro"
    echo -e "${BLUE}   Stop server: ${NC}pm2 stop cleanspace-pro"
    echo -e "${BLUE}   Restart: ${NC}pm2 restart cleanspace-pro"
else
    echo -e "${YELLOW}⚠️  PM2 not found, starting with Node.js directly${NC}"
    echo -e "${YELLOW}   For production, consider installing PM2: npm install -g pm2${NC}"
    echo ""
    node server.js
fi
