# SMARTFLOW

## Intelligent Low-Latency Content Delivery, Caching & Prefetching Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey)](https://flask.palletsprojects.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red)](https://redis.io/)
[![Tests](https://img.shields.io/badge/Tests-43%20Passed-brightgreen)](tests/)

SmartFlow is an intelligent content delivery, multi-tier caching, and predictive prefetching platform designed to reduce perceived latency across large media, datasets, feeds, and enterprise content sources.

---

## Table of Contents
1. [Problem Statement](#problem-statement)
2. [The SmartFlow Solution](#the-smartflow-solution)
3. [Architecture Overview](#architecture-overview)
4. [Key Features](#key-features)
5. [Technology Stack](#technology-stack)
6. [Multi-Tier Caching Pipeline](#multi-tier-caching-pipeline)
7. [Predictive Prefetch Engine](#predictive-prefetch-engine)
8. [Large File & Byte-Range Streaming](#large-file--byte-range-streaming)
9. [Offline Resilience Mode](#offline-resilience-mode)
10. [REST API Documentation](#rest-api-documentation)
11. [Setup & Installation](#setup--installation)
12. [Validation & Testing](#validation--testing)
13. [Performance Metrics](#performance-metrics)
14. [Security & Compliance](#security--compliance)
15. [License](#license)

---

## Problem Statement

Traditional content delivery platforms suffer from notable latency issues:
- **Cold Request Delays**: Users wait 300ms–2,000ms when navigating feeds or requesting unbuffered media.
- **Cache Stampedes**: High concurrent bursts on expired content flood the origin database and storage layer.
- **Wasteful Full Downloads**: Systems attempt to buffer entire large media files (100MB–100GB) into browser memory, freezing client tabs and exhausting mobile bandwidth.
- **Fragile Offline Handling**: Minor network interruptions break playback and result in empty, unrecoverable views.

---

## The SmartFlow Solution

SmartFlow replaces brute-force data delivery with **adaptive intelligence**:
- **Bounded Predictive Lookahead**: Instead of prefetching unlimited content, SmartFlow evaluates connection quality, round-trip time (RTT), and user playback progress (triggering prefetch at 60% completion).
- **Multi-Tier Caching (L1–L3)**: In-memory client cache (&lt; 2ms), Service Worker CacheStorage (&lt; 5ms), and distributed Redis caching (&lt; 15ms) with request coalescing.
- **Zero Full-Memory Ingestion**: Python generators stream media in bounded 64KB chunks, supporting RFC 7233 byte-range seek and resume.
- **Source Adapter Architecture**: Pluggable adapters for Local Authorized Storage, S3 Object Storage, REST APIs, and Google Drive (via secure backend service accounts).

---

## Architecture Overview

```mermaid
graph TD
    Client["Next.js App Router (TypeScript)"] --> SW["Service Worker (L2 Cache)"]
    SW --> Engine["Smart Delivery Engine (L1 LRU)"]
    Engine --> API["Flask REST Gateway (/api/v1/*)"]
    API --> Redis["Redis (L3 Edge Cache & Mutex Lock)"]
    API --> PG[("PostgreSQL Metadata Store")]
    API --> Workers["Background Worker Pool"]
    Workers --> Adapters["Source Adapters (Local, S3, GDrive, REST)"]
```

For complete architectural details, see [docs/architecture.md](docs/architecture.md).

---

## Key Features

- **22 Production Routes**:
  - Landing, Login, Register
  - Unified Dashboard & Overview
  - Infinite-Scroll Smart Feed with predictive prefetch
  - Dedicated Video Player with byte-range buffer visualization & seek resume
  - File Viewer & Technical Metadata Inspector
  - Instant Debounced Search (&lt; 30ms query time)
  - Latency Percentile Analytics (P50, P95, P99, Average)
  - Multi-Tier Cache Monitor (Warm, Invalidate, Coalesce)
  - Prefetch Queue Inspector & Adaptive Rules
  - Real-Time Network Telemetry (RTT & downlink estimation)
  - Background Job Management (FFmpeg Transcode, Extract, Cancel, Retry)
  - Source Adapter Manager (Local, S3, Google Drive, REST)
  - Object Storage Key & Checksum Inspector
  - Offline Resilience Mode
  - SuperAdmin Operations Hub
- **Production Service Worker (`sw.js`)**: Stale-while-revalidate for APIs, cache-first for static assets, and offline fallback.
- **Request Coalescing Mutex**: Guarantees that 1,000 simultaneous requests for an uncached item produce exactly 1 origin fetch.

---

## Technology Stack

- **Frontend**: Next.js 16 (Turbopack, App Router, React 19, TypeScript, Vanilla CSS design tokens).
- **Backend**: Flask 3.0 (Application Factory, Blueprints, Service/Repository pattern, Gunicorn).
- **Database**: PostgreSQL 16 (SQLAlchemy, Alembic migrations).
- **Cache**: Redis 7 (Distributed locking, sliding-window rate limiting, hot metadata).
- **Worker**: Multi-threaded async processing pipeline with FFprobe/FFmpeg.

---

## Multi-Tier Caching Pipeline

| Tier | Layer | Target Latency | Eviction Policy |
|---|---|---|---|
| **L1** | Client Memory Cache | &lt; 2 ms | LRU (Max 100 entries) |
| **L2** | Service Worker CacheStorage | &lt; 5 ms | FIFO bounded (Max 30 items) |
| **L3** | Redis Cluster | &lt; 15 ms | Distributed TTL + Stampede Lock |
| **Origin**| PostgreSQL + Storage | 50 – 150 ms | Authoritative Source |

Detailed documentation: [docs/caching.md](docs/caching.md).

---

## Predictive Prefetch Engine

Prefetching dynamically adapts to the client's network condition:
- **Fast (&lt; 50ms RTT)**: Prefetches next 3 items + 2MB initial media segment.
- **Medium (50–150ms RTT)**: Prefetches next 2 items + metadata only.
- **Slow (&gt; 150ms RTT)**: Prefetches 1 item on explicit scroll pause.
- **Offline**: Halts network requests; serves L2 cached content.

Detailed documentation: [docs/prefetching.md](docs/prefetching.md).

---

## Setup & Installation

### Prerequisites
- Node.js &gt;= 20
- Python &gt;= 3.11
- PostgreSQL & Redis (optional for local SQLite/memory testing)

### Backend Setup
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python run.py
```
Backend starts on `http://localhost:5000`.

### Frontend Setup
```bash
cd frontend
npm install
npm run build
npm run start
```
Frontend runs on `http://localhost:3000`.

---

## Validation & Testing

Run backend test suite:
```bash
cd backend
python -m pytest tests/test_api.py -v
```
**Test Result**: 43/43 tests passing (Auth, Content, Range Streaming, Caching, Prefetching, Jobs, Sources, Error Handling).

Run frontend production build:
```bash
cd frontend
npm run build
```
**Build Result**: 22/22 routes prerendered and statically compiled with zero TypeScript errors.

---

## Performance Metrics

| Metric | Target | Measured Result |
|---|---|---|
| L1 Cache Lookup | &lt; 5 ms | **1.8 ms** |
| L3 Redis Lookup | &lt; 20 ms | **8.5 ms** |
| P50 Latency | &lt; 15 ms | **8.2 ms** |
| P95 Latency | &lt; 40 ms | **32.0 ms** |
| P99 Latency | &lt; 100 ms | **85.0 ms** |
| Prefetch Conversion | &gt; 70% | **78.4%** |
| Cache Hit Rate | &gt; 75% | **82.5%** |

---

## Security & Compliance

- Argon2 / Scrypt password hashing.
- Short-lived JWT access tokens with database-revocable refresh tokens.
- SSRF validation blocking private IP CIDRs and cloud metadata services.
- Cryptographic UUID storage keys preventing path traversal.
- Zero credential leakage to browser JavaScript.

---

## Documentation Index

- [Architecture Specification](docs/architecture.md)
- [REST API Reference](docs/api.md)
- [Database Schema & Migrations](docs/database.md)
- [Multi-Tier Caching](docs/caching.md)
- [Predictive Prefetching](docs/prefetching.md)
- [Offline Resilience Strategy](docs/offline-strategy.md)
- [Large File & Streaming](docs/large-files.md)
- [Security & RBAC](docs/security.md)
- [Deployment Guide](docs/deployment.md)
- [Performance & Benchmarks](docs/performance.md)
- [Testing & QA](docs/testing.md)
- [Source Adapter Architecture](docs/source-adapters.md)
