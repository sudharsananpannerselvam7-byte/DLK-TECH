# SmartFlow Deployment Guide

## Overview

SmartFlow is designed for cloud-native, containerized, or PaaS deployments (Docker, Kubernetes, AWS ECS, Render, Replit, Railway).

---

## 1. Environment Variables

Create `.env` using `.env.example`:

```bash
# Flask Backend
FLASK_ENV=production
SECRET_KEY=generate-a-strong-random-key-here
JWT_SECRET_KEY=generate-a-strong-jwt-key-here
DATABASE_URL=postgresql://smartflow_user:password@localhost:5432/smartflow_db
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=https://your-frontend-domain.com

# Storage & Source Adapters
STORAGE_BACKEND=local
STORAGE_PATH=./uploads
S3_BUCKET_NAME=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=

# Next.js Frontend
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
```

---

## 2. Docker Deployment

A multi-stage `Dockerfile` and `docker-compose.yml` coordinate:
- PostgreSQL 16
- Redis 7
- Flask Backend (Gunicorn with Gevent/Eventlet for async byte-range streaming)
- Next.js Standalone Production Server
- Nginx Reverse Proxy (SSL termination and caching headers)

Run complete cluster:
```bash
docker compose up -d --build
```

---

## 3. Health & Readiness Endpoints

- Liveness check: `GET /api/v1/health`
- Readiness check: `GET /api/v1/health/live`
- Admin dashboard: `GET /api/v1/admin/dashboard`
