# SmartFlow Setup and Quickstart Guide

This guide walks you through setting up and running SmartFlow locally or in production.

---

## 1. System Requirements

- **Operating System:** Windows 10/11, macOS 12+, or Ubuntu 20.04+ LTS
- **Node.js:** v18.18+ or v20+ LTS
- **Python:** v3.10+ or v3.11+
- **Redis:** v6.0+ (optional: memory-backed fallback included)
- **Database:** PostgreSQL v14+ or SQLite (built-in default for development)
- **FFmpeg:** (Optional, required for adaptive video segment transcoding)

---

## 2. Fast Local Setup (Development)

### Step 2.1: Clone and Configure Environment
```bash
git clone https://github.com/sudharsananpannerselvam7-byte/DLK-TECH.git
cd DLK-TECH
cp .env.example .env
```

### Step 2.2: Start Backend (Flask API)
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python run.py
```
*Backend runs on `http://localhost:5000` with automated health checks at `/api/v1/health`.*

### Step 2.3: Start Frontend (Next.js 16)
```bash
cd ../frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:3000`.*

### Step 2.4: Launch Desktop Local Agent
```bash
cd ../desktop
python desktop_app.py
```
*The native Tkinter desktop dashboard launches, allowing directory indexing, device registration, and cache inspection.*

---

## 3. Docker Compose Setup (Production-Ready)

To launch all 5 containerized services (Web, Flask API, Celery Worker, PostgreSQL, Redis):
```bash
docker compose up -d --build
```
Verify container health:
```bash
docker compose ps
```
