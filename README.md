# Zoom Clone - Video Conferencing Platform

A fullstack **Zoom Web Application Clone** replicating Zoom's design, user experience, and core meeting workflows.

![Zoom Clone](https://zoom.us/favicon.ico)

---

## 🌟 Key Features

* **Authentic Zoom UI & Experience**:
  * **Light Theme Dashboard**: Date/time clock, Quick Action Cards (*New Meeting*, *Join*, *Schedule*, *Share Screen*), and tabbed *Upcoming Meetings* and *Recent Meetings* lists.
  * **Signature Dark Theme Meeting Room**: 2x2 responsive grid layout (capped at 4 participants), audio visualizer wave indicators, and avatar fallbacks when video is turned off.
  * **Bottom Meeting Control Bar**: Mic toggle, Video toggle, Security/Host controls, Participants side drawer (live badge count), In-meeting Chat side drawer, Emoji Reactions, and End/Leave Meeting modal.

* **Core Meeting Workflows**:
  1. **Instant Meeting Creation**: Generates a 10-digit meeting ID (`XXX-XXX-XXXX`), shareable invite link, and redirects host immediately to the live room.
  2. **Join Meeting**: Join via 10-digit Meeting ID or direct URL with pre-join camera/mic options and display name validation.
  3. **Schedule Meetings**: Modal form with topic, host name, date & time picker, duration, optional passcode protection, stored in SQLite and listed under *Upcoming Meetings*.
  4. **Passcode Protection**: Optional passcode generated during scheduling and verified end-to-end (`POST /api/meetings/validate-passcode`).

* **Real-time Engine & Host Controls**:
  * **FastAPI WebSocket Manager**: Real-time signaling, participant state sync (Mute/Unmute, Video On/Off), and in-meeting text chat.
  * **WebRTC Multi-Peer Mesh & Metered TURN**: Configured with Google STUN (`stun:stun.l.google.com:19302`) + OpenRelay Metered TURN (`turn:openrelay.metered.ca:80/443`) for traversal across symmetric NATs and firewalls.
  * **Host Controls**: Host can *Mute All Participants* or *Remove (Kick) Participant*. Kicked participants have their `client_token` banned server-side to prevent rejoining.
  * **Host Disconnect 30s Grace Period**: If a host unexpectedly drops, a 30-second grace period banner is displayed; if unhandled, the server safely ends the meeting for all participants.
  * **Session Reconnect (`client_token`)**: Uses client-side UUID stored in `sessionStorage` to allow browser refresh re-attachment without inflating participant slot count.

---

## 🏗️ Architecture & Technical Stack

```
   ┌─────────────────────────────────────────────────────────────┐
   │                     Next.js (Frontend)                       │
   │  ┌───────────────────────┐       ┌───────────────────────┐  │
   │  │   Zoom Dashboard      │       │  Zoom Meeting Room    │  │
   │  │ (Light Mode Theme)    │       │ (Signature Dark Room) │  │
   │  └───────────┬───────────┘       └───────────┬───────────┘  │
   └──────────────┼───────────────────────────────┼──────────────┘
                  │ REST APIs                     │ WebSockets & WebRTC
                  ▼                               ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                    FastAPI (Backend)                         │
   │  ┌───────────────────────┐       ┌───────────────────────┐  │
   │  │   REST & Validation   │       │ WebSocket & Signaling │  │
   │  │ (Passcode & Lifecycle)│       │ (Mute/Kick & WebRTC)  │  │
   │  └───────────┬───────────┘       └───────────┬───────────┘  │
   └──────────────┼───────────────────────────────┼──────────────┘
                  │ SQLAlchemy ORM
                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │          SQLite Database (Normalized with 1 Denorm)         │
   │             (meetings, participants)                        │
   └─────────────────────────────────────────────────────────────┘
```

* **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, Lucide Icons
* **Backend**: Python 3.11+, FastAPI, Uvicorn, SQLAlchemy, WebSockets
* **Database**: SQLite (`zoom_clone.db`)
* **Package Management**: `uv` (Python), `npm` (Node.js)

---

## 🗄️ Database Design (Normalized 3NF Schema)

### `meetings` Table
* `id` (PK, VARCHAR(12)): Strictly 10-digit numeric string formatted as `XXX-XXX-XXXX` (e.g. `845-912-3401`).
* `title` (VARCHAR(255)): Meeting topic.
* `description` (TEXT): Optional agenda.
* `passcode` (VARCHAR(64)): Optional passcode.
* `meeting_type` (VARCHAR(20)): `INSTANT` or `SCHEDULED`.
* `status` (VARCHAR(20)): `UPCOMING`, `LIVE`, or `ENDED`.
* `scheduled_start_time` (DATETIME): Scheduled start time.
* `duration_minutes` (INTEGER): Default 40 mins.
* `created_at`, `started_at`, `ended_at` (DATETIME).
* `host_name` (VARCHAR(255)): Intentional denormalization for fast O(1) dashboard queries.

### `participants` Table
* `id` (PK, INTEGER): Auto-increment ID.
* `meeting_id` (FK -> `meetings.id`): Associated meeting.
* `client_token` (VARCHAR(64)): Browser `sessionStorage` UUID for session re-attachment.
* `display_name` (VARCHAR(255)): User display name.
* `is_host` (BOOLEAN): Authoritative source of truth for host privileges.
* `is_muted`, `is_video_off` (BOOLEAN): Real-time media states.
* `is_kicked` (BOOLEAN): Server-enforced ban flag.
* `joined_at`, `left_at` (DATETIME).
* *Constraint*: `UniqueConstraint('meeting_id', 'client_token')`.

---

## ⚡ Quick Start & Local Setup

### 1. Prerequisites
* Python 3.11+
* Node.js 18+ and `npm`
* `uv` (Fast Python package manager)

### 🚀 Quick Start (Launch Both Frontend & Backend)

From the root project directory, simply run:

```bash
# Run both FastAPI backend (port 8000) and Next.js frontend (port 3000) concurrently
npm start
```

* **Frontend App**: `http://localhost:3000`
* **FastAPI Backend**: `http://127.0.0.1:8000` (API Docs at `http://127.0.0.1:8000/docs`)

---

### Manual Individual Setup (Optional)

#### Backend:
```bash
cd backend
uv venv .venv
.venv\Scripts\activate
uv pip install -r requirements.txt
python seed.py
uvicorn main:app --port 8000 --reload
```

#### Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## 🌐 Free-Tier Cloud Deployment Guide

* **Frontend (Vercel)**:
  * Connect your public GitHub repository to Vercel.
  * Set `Root Directory` to `frontend`.
  * Set environment variable `NEXT_PUBLIC_API_URL` to your Render backend URL.

* **Backend (Render / Railway)**:
  * Connect GitHub repository to Render (Web Service).
  * Set `Root Directory` to `backend`.
  * Build Command: `pip install -r requirements.txt`
  * Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
  * Note: FastAPI `lifespan` handler automatically seeds the SQLite DB on startup if empty.

---

## 📝 License
This project is submitted for the Scaler SDE Fullstack Assignment.
