# 🏛️ Prastab — Community Hero · Hyperlocal Problem Solver

> **Hackathon Project** · An AI-native Progressive Web Application that empowers citizens to **identify, report, validate, track, and resolve** hyperlocal community issues — through multi-agent AI, real-time civic transparency, and gamified participation.

[![Built with Gemini](https://img.shields.io/badge/AI-Gemini%201.5%20Pro-blue?logo=google)](https://deepmind.google/technologies/gemini/)
[![Firebase](https://img.shields.io/badge/Backend-Firebase-orange?logo=firebase)](https://firebase.google.com/)
[![LangGraph](https://img.shields.io/badge/Orchestration-LangGraph-purple)](https://github.com/langchain-ai/langgraph)
[![Cloud Run](https://img.shields.io/badge/Deploy-Cloud%20Run-green?logo=google-cloud)](https://cloud.google.com/run)
[![PWA](https://img.shields.io/badge/App-PWA-blueviolet)](https://web.dev/progressive-web-apps/)

---

## 🚀 Live Demo

| Service | URL |
|---------|-----|
| Frontend (Firebase Hosting) | _Deploy & share_ |
| Backend API (Cloud Run) | _Deploy & share_ |
| API Docs (Swagger UI) | `<backend-url>/docs` |
| API Docs (ReDoc) | `<backend-url>/redoc` |

---

## 🎯 Problem Statement

Communities across India and the world face a **systemic failure** in civic issue management:

| Gap | Real-World Impact |
|-----|-------------------|
| Reporting is fragmented (WhatsApp, phone calls) | Data is lost, duplicated, or never reaches authorities |
| No verification layer | Fake or spam reports flood the system |
| Zero transparency after submission | Citizens disengage; trust in governance erodes |
| "Resolved" is self-declared | Authorities close tickets without proof of actual fix |
| No intelligent prioritization | Critical safety issues treated the same as minor ones |

**Prastab** closes this loop entirely:

- 📸 **Zero-form reporting** — one photo + GPS, AI does the rest (Gemini Vision)
- 🤖 **Multi-agent pipeline** — 5 specialized AI agents validate, score, route, and resolve
- ✅ **AI-verified resolution** — "Resolved" only when Gemini Vision confirms before vs. after
- 🌍 **Real-time transparency** — every action publicly audited on Firestore
- 🎮 **Community participation** — gamification, leaderboards, and consensus voting

---

## 🧠 Agentic Architecture — LangGraph Multi-Agent Pipeline

Every citizen report triggers a **stateful, self-correcting 5-node LangGraph pipeline**:

```
Citizen submits photo + GPS (+ optional voice note)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              FastAPI (Cloud Run)                    │
│         LangGraph StateGraph Orchestrator           │
│                                                     │
│  ① Reporter Agent      ←── Gemini 1.5 Pro Vision   │
│     • Multimodal image analysis                     │
│     • Category, severity (1-5), confidence (0-1)   │
│     • Auto-fills: description, tags, dept, SLA     │
│     • PII detection (faces, plates → blur flags)   │
│     • Voice note transcription (Hindi/English)     │
│                                                     │
│  ② Memory Agent        ←── Mem0 + Firestore        │
│     • Recalls location history (past reports)       │
│     • Retrieves user Civic Trust Score              │
│     • Flags auto-escalation (3+ repeats at site)   │
│                                                     │
│  ③ Validator Agent     ←── Google Maps + PixelRAG  │
│     Layer 1:  Geo-verification (place types)        │
│     Layer 1.5: Semantic mismatch check (Flash)      │
│     Layer 2:  Haversine dedup (50m / 30 days)       │
│     Layer 3:  PixelRAG visual similarity            │
│     Layer 4:  Community confirm/dispute votes       │
│                                                     │
│  ④ Judge Agent         ←── Gemini 1.5 Pro          │
│     • Review & Critique loop (up to 3x)            │
│     • Quality score (0-1), routing decision        │
│     • PROCEED / HITL / ESCALATE / CLARIFY          │
│              │ pass                                 │
│              ▼ hitl?                               │
│  ⑤ HITL Bridge        ←── Authority Portal         │
│     • Human verifier: Approve / Reject / Escalate  │
│     • Pub/Sub event on decision                    │
│              │ approved                             │
│              ▼                                      │
│  ⑥ Resolver Agent     ←── LlamaIndex RAG + Gemini │
│     • Department routing via civic docs RAG        │
│     • SLA assignment, ticket generation            │
│     • Pub/Sub: notify reporter + downstream        │
│                                                     │
│  Pub/Sub events at every state transition           │
└─────────────────────────────────────────────────────┘
         │
         ▼
  Firestore (shared state + immutable audit trail)
  Firebase FCM (push notifications to citizens)
```

### Agent Roles

| Agent | Purpose | Core Google Tech |
|-------|---------|-----------------|
| **Reporter** | Vision analysis, severity scoring, PII detection, voice transcription | Gemini 1.5 Pro (Vision + Audio) |
| **Memory** | Location history recall, user trust, auto-escalation triggers | Mem0 + Cloud Firestore |
| **Validator** | Geo-verify, 4-layer duplicate defense, semantic mismatch | Google Maps API, Vertex AI Embeddings, PixelRAG |
| **Judge** | Self-correcting review loop, quality gate, HITL routing | Gemini 1.5 Pro (reasoning) |
| **HITL Bridge** | Human authority review for borderline/high-severity cases | Firestore + Cloud Pub/Sub |
| **Resolver** | RAG-based dept routing, SLA, ticket generation | LlamaIndex + ChromaDB + Gemini |

### Issue Lifecycle State Machine

```
DRAFT → TRIAGE → IN_REVIEW ──(HITL approve)──► VALIDATED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED
                     │                                                        ↑
                     │ (community disputes > confirms)                        │
                     ├──────────────────────────────────────────────► IN_REVIEW (re-enter)
                     │ (HITL reject)
                     └──────────────────────────────────────────────► ESCALATED
                     ↑
               SPAM_SUSPECTED / NEEDS_CLARIFICATION
```

Every transition is **atomically written** to Firestore's `audit_trail` subcollection with timestamp, actor UID, and reason — an **immutable public ledger**.

---

## 💡 Four Innovation Pillars

### 1. 📸 Zero-Form Multimodal Ingestion
**Problem:** Citizens abandon reports due to tedious dropdowns, manual category selection, and form fields.

**Solution:** Upload a photo (or record a 5-second voice note in Hindi/English/Marathi). Gemini Vision extracts coordinates, translates local dialects, categorizes the issue, and routes it to the right department. **Zero manual form-filling.**

### 2. ✅ AI "Proof-of-Resolution" Referee
**Problem:** Contractors mark issues "Resolved" from their desks without visiting the site. Citizens lose trust.

**Solution:** Closing a ticket **requires** an after-photo. Gemini 1.5 Pro Vision performs a side-by-side before/after comparison. If it detects a partial fix or location mismatch, the ticket stays open with specific AI feedback logged to the public audit trail.

### 3. 🎯 Dynamic Civic Trust Scores
**Problem:** Spam floods reporting platforms, requiring expensive manual moderation teams.

**Solution:** Every citizen has a dynamic `trustScore` (0.0–1.0) in Firestore. High-quality verifications increase trust, allowing reports to bypass HITL review. Spam drops scores automatically, throttling future submissions algorithmically.

| Event | Trust Delta |
|-------|-------------|
| Report validated ✅ | +0.05 |
| Issue AI-verified resolved 🎉 | +0.10 |
| Community co-verification ✓ | +0.03 |
| Duplicate spotted (same real issue) | +0.01 |
| Invalid report ❌ | −0.10 |
| Spam detected 🚫 | −0.20 |

### 4. 🏆 XP-Linked Civic Gamification
**Problem:** Digital badges with no real-world value → user disengagement.

**Solution:** Community XP is designed to be linked to real-world outcomes. The 7-tier rank system (Newcomer → Legend) and ward-level leaderboards drive healthy competition. XP thresholds unlock sponsor-funded local infrastructure improvements.

---

## 🏗️ Tech Stack

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | **React 19** + Vite 8 |
| Styling | **Vanilla CSS** — glassmorphism dark UI with CSS custom properties |
| State | **Zustand** + Firebase real-time Firestore listeners |
| Maps | **Leaflet.js** + OpenStreetMap + Nominatim reverse geocoding |
| Charts | **Chart.js** (react-chartjs-2) |
| PWA | **vite-plugin-pwa** + Workbox (offline-first, background sync) |
| Push | **Firebase Cloud Messaging** (service worker) |
| Auth | **Firebase Auth** (Email/Password, Google OAuth, Anonymous) |
| Routing | **React Router 7** |
| i18n | **i18next** (multi-language scaffold) |

### Backend
| Layer | Technology |
|-------|-----------|
| API | **FastAPI** + Uvicorn (async) |
| AI Orchestration | **LangGraph 0.1** (stateful multi-agent StateGraph) |
| AI Model | **Gemini 1.5 Pro** (vision + text) via `google-generativeai` |
| Embeddings | **Vertex AI `text-embedding-004`** |
| RAG | **LlamaIndex** + **ChromaDB** (civic department docs) |
| Memory | **Mem0** (persistent agent memory across sessions) |
| Visual Dedup | **PixelRAG** (multimodal image embeddings) |
| Database | **Cloud Firestore** (serverless, real-time, subcollections) |
| Messaging | **Cloud Pub/Sub** (decoupled async agent events) |
| Secrets | **Google Secret Manager** + `.env` fallback |
| Deployment | **Cloud Run** (containerized, scale-to-zero) |
| Storage | **Firebase Storage** (issue media) |
| Containerization | **Docker** |

### Google Technologies Integrated (16+)

| Google Technology | Specific Role in Prastab |
|-------------------|--------------------------|
| **Gemini 1.5 Pro Vision** | Reporter Agent: multimodal image → structured JSON (category, severity, PII) |
| **Gemini 1.5 Pro** | Judge Agent: self-correcting quality scoring + HITL routing |
| **Gemini 1.5 Pro Vision** | Proof-of-Resolution: before/after image comparison → RESOLVED/PARTIAL/UNRESOLVED verdict |
| **Gemini 1.5 Flash** | Semantic location mismatch: *is this category plausible at this location?* |
| **Gemini 1.5 Flash** | Predictive ward insights: RAG over historical issue patterns → 5 actionable insights |
| **Vertex AI Embeddings** | PixelRAG visual duplicate detection (multimodal embeddings) |
| **Google Maps Geocoding API** | GPS coordinates → human address + place types for semantic check |
| **Google Maps JavaScript API** | Interactive issue map tiles |
| **Firebase Authentication** | Every action tied to verified account (email / Google OAuth) |
| **Cloud Firestore** | Primary real-time database; subcollections: `audit_trail`, `community_votes`, `appeals` |
| **Firebase Cloud Messaging** | Push notifications: status changes, neighbor alerts, resolution events |
| **Firebase Storage** | Issue photo/video storage with PII-aware access |
| **Firebase Hosting** | PWA frontend CDN deployment |
| **Cloud Run** | Containerized FastAPI backend (scale-to-zero, zero cold-start config) |
| **Cloud Pub/Sub** | Decoupled async messaging between Resolver Agent and notification services |
| **Google Cloud Secret Manager** | Secure API key management in production |
| **Google Cloud Logging** | Agent decision audit trail for regulatory accountability |

---

## 📱 Feature Walkthrough

### 🔍 Issue Reporting — Zero Cognitive Friction
- Drag-and-drop image/video upload directly to Firebase Storage
- Optional **voice note** (base64) — Gemini transcribes Hindi/Marathi/Tamil/English
- GPS auto-detect + click-to-pin map location picker (Leaflet + Nominatim)
- Live **agent pipeline progress panel** (5 animated steps with real-time status)
- AI analysis result: category, severity (1-5), department, SLA, confidence %
- Rate limited: max 5 reports per user per hour (Firestore-backed + IP fallback)

### 🗺️ Live Map Explorer
- Leaflet interactive map with real-time severity-colored circle markers
- 3 tile styles (dark / light / satellite)
- Sidebar with issue list, category/status/ward filter, severity legend
- Fly-to animation on issue selection with popup quick actions
- Neighbor alert: FCM push to users within 500m for severity ≥ 3 issues

### 📊 Impact Dashboard
- Real-time KPI cards: Total Issues, Resolved, Critical, Resolution Rate %
- 7-day trend line chart, status doughnut, category bar chart
- **K-Means++ Regional Priority Zones** — pure-Python spatial clustering of issue hotspots
- **Gemini AI Predictive Insights** — ward-level analysis: recurring hotspots, seasonal patterns, urgent reds
- All data from live Firestore `onSnapshot` listeners — no polling

### 🏆 Leaderboard + Gamification
- **7-tier rank system:** Newcomer → Helper → Advocate → Crusader → Champion → Hero → Legend
- XP system: +10 report, +25 resolved, +15 verified, +2 upvote
- 3-place visual podium, real-time Firestore rankings by ward
- Dynamic Civic Trust Score (0.0–1.0) tied to report quality

### 🔐 Authority Portal (HITL Dashboard)
- Real-time HITL queue: issues awaiting human review, sorted by severity
- One-click **Approve / Reject / Escalate** with reason logging (all audited)
- **Proof-of-Resolution tab**: upload after-photo → Gemini Vision verifies → AI verdict + 1-5 quality stars
- All-issues management table with real-time filtering by status/department

### 🤝 Community Consensus Engine
- **Confirm / Dispute** buttons on every issue card (one immutable vote per citizen)
- Animated community confidence bar (% confirms vs. disputes)
- GPS proximity fence: must be within **100 meters** of issue to verify
- Auto-escalates to HITL when disputes ≥ 3 AND disputes > confirms

### 📣 Appeal Mechanism
- Citizens can appeal any AI-rejected report (visible only to them)
- Minimum 10-character reason enforced at Firestore security rules level
- Appeal bypasses AI → forces `in_review` → **mandatory HITL** (AI is never final arbiter)
- Stored in immutable `appeals` Firestore subcollection

### 🔔 Real-Time Notifications
- Firebase Cloud Messaging push notifications (foreground + background)
- In-app notification center with unread badge count
- Neighbor alerts: nearby users auto-notified for high-severity issues
- Resolution notifications with XP award confirmation

---

## 🛡️ Production Guardrails

Four operational safeguards for production readiness:

| Guardrail | Implementation |
|-----------|---------------|
| **Graceful Degradation** | Fallback parser catches JSON errors + 10s timeouts → routes to HITL instead of crashing |
| **Rate Limiting** | Max 5 reports/user/hour (Firestore-backed) + IP-based fallback (in-memory) |
| **Privacy by Design (PII Masking)** | Reporter Agent flags faces + license plates → `pii_flagged_details` for blur layer |
| **Offline Sync** | Firestore IndexedDB offline persistence for ground workers in low-connectivity areas |

---

## 📐 Urgency Scoring Formula

Custom weighted formula that prioritizes civic safety:

```
W = 0.40 × severity_norm          # Safety first
  + 0.25 × log(upvotes+1) / log(max+2)  # Community signal
  + 0.20 × verify_norm            # Quality verification ring
  + 0.15 × (1 / age_hours)        # Recency (doesn't overwhelm severity)
  × credibility_multiplier(trust_score)  # Reporter reputation weight
```

Feed supports 3 sort modes: **Recent**, **AI Urgency**, **Most Voted**

---

## 📂 Project Structure

```
vibe2ship/
├── frontend/                     # React 19 PWA
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.jsx       # Hero landing page
│   │   │   ├── Feed.jsx          # Real-time issue feed (3 sort modes)
│   │   │   ├── ReportIssue.jsx   # 4-step report wizard + agent progress
│   │   │   ├── MapExplorer.jsx   # Interactive Leaflet map
│   │   │   ├── IssueDetail.jsx   # Issue detail + community verify + appeal
│   │   │   ├── Dashboard.jsx     # Impact analytics + K-Means zones
│   │   │   ├── Leaderboard.jsx   # Gamification rankings
│   │   │   ├── AuthorityPortal.jsx # HITL queue + Proof-of-Resolution
│   │   │   ├── Profile.jsx       # User profile + XP + trust score
│   │   │   └── Notifications.jsx # FCM notification center
│   │   ├── components/
│   │   │   ├── common/           # Nav (glassmorphism), ErrorBoundary
│   │   │   └── map/              # LocationPicker (Leaflet + Nominatim)
│   │   ├── store/
│   │   │   ├── authStore.js      # Firebase Auth + Firestore user profile
│   │   │   └── issueStore.js     # Firestore onSnapshot subscriptions
│   │   ├── services/
│   │   │   ├── firebase.js       # Firebase app init (auth, db, storage)
│   │   │   └── agentApi.js       # FastAPI client + pipeline polling
│   │   ├── styles/index.css      # CSS design tokens (dark glassmorphism)
│   │   └── locales/              # i18n translation files
│   ├── public/
│   │   ├── firebase-messaging-sw.js  # FCM background service worker
│   │   └── manifest.webmanifest
│   └── vite.config.js
│
├── backend/                      # FastAPI + LangGraph
│   ├── agents/
│   │   ├── orchestrator.py       # LangGraph StateGraph definition
│   │   ├── reporter_agent.py     # Gemini Vision: category/severity/PII/voice
│   │   ├── memory_agent.py       # Mem0: location history + trust recall
│   │   ├── validator_agent.py    # Google Maps + Haversine + PixelRAG dedup
│   │   ├── judge_agent.py        # Review & Critique loop (up to 3x) + HITL gate
│   │   └── resolver_agent.py     # LlamaIndex RAG → dept routing + SLA
│   ├── services/
│   │   ├── state_machine.py      # FSM: IssueStatus enum + valid transitions
│   │   ├── rag_pipeline.py       # LlamaIndex + ChromaDB civic document index
│   │   ├── pixel_rag.py          # Visual duplicate detection (Vertex AI)
│   │   ├── proof_of_resolution.py # Gemini before/after image comparison
│   │   ├── scoring_engine.py     # Urgency formula + K-Means++ + trust deltas
│   │   ├── pubsub_service.py     # Cloud Pub/Sub typed event publishers
│   │   ├── secret_manager.py     # GCP Secret Manager with .env fallback
│   │   └── firestore_client.py   # Firebase Admin singleton client
│   ├── api/
│   │   ├── routes.py             # All FastAPI endpoints (report, HITL, verify, appeal)
│   │   └── models.py             # Pydantic request/response schemas
│   ├── scripts/
│   │   └── ingest_docs.py        # Seeds civic dept docs into ChromaDB (run once)
│   ├── main.py                   # Uvicorn entry point
│   ├── config.py                 # Pydantic settings (env + Secret Manager)
│   └── Dockerfile
│
├── firestore.rules               # Role-based security rules for all collections
└── cloudbuild.yaml               # Cloud Build CI/CD pipeline
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+
- Firebase project with Firestore, Auth, Storage, FCM enabled
- Google Cloud project with Gemini API, Vertex AI, Maps API enabled

### 1. Clone & Install

```bash
git clone <repo>
cd vibe2ship

# Frontend
cd frontend && npm install

# Backend
cd ../backend && pip install -r requirements.txt
```

### 2. Configure Environment

**Frontend** — `frontend/.env`:
```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXX
VITE_GOOGLE_MAPS_API_KEY=your_maps_key
VITE_BACKEND_URL=http://localhost:8080
VITE_VAPID_KEY=your_vapid_key
```

**Backend** — `backend/.env`:
```env
GOOGLE_CLOUD_PROJECT=your_project_id
GEMINI_API_KEY=your_gemini_key
GOOGLE_MAPS_API_KEY=your_maps_key
FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
VERTEX_AI_LOCATION=us-central1
MEM0_API_KEY=your_mem0_key
BACKEND_CORS_ORIGINS=http://localhost:5173,https://your-app.web.app
CHROMA_PERSIST_DIR=./chroma_db
```

### 3. Seed RAG Knowledge Base

```bash
cd backend
python scripts/ingest_docs.py
```

### 4. Run Locally

```bash
# Terminal 1 — Backend
cd backend && python main.py

# Terminal 2 — Frontend
cd frontend && npm run dev
```

App available at `http://localhost:5173` · API docs at `http://localhost:8080/docs`

---

## 🚀 Deploy to Production

### Firebase Hosting (Frontend)
```bash
cd frontend
npm run build
firebase deploy --only hosting
```

### Cloud Run (Backend)
```bash
gcloud builds submit --config cloudbuild.yaml
```

### Firestore Security Rules
```bash
firebase deploy --only firestore:rules
```

---

## 📊 Platform Metrics Tracked

- **Resolution Rate** — % issues resolved vs. total reported
- **SLA Adherence** — average SLA compliance by department
- **Civic Trust Distribution** — trust score histogram across citizens
- **K-Means Hotspot Zones** — severity map by ward cluster
- **Duplicate Compression Ratio** — reports merged vs. created
- **HITL Override Rate** — % of AI decisions reversed by humans
- **Community Consensus Accuracy** — verifier correctness vs. AI verdicts

---

## 🆚 Prastab vs. Existing Solutions

| Existing Solutions | Prastab |
|-------------------|---------|
| Submit-and-forget complaint apps | Real-time status updates + push notifications at every step |
| WhatsApp groups — fragmented, unstructured | AI-structured, geo-tagged, deduplicated, routed |
| Self-declared "Resolved" status | Gemini Vision before/after comparison **required** to close |
| No verification → spam floods system | 4-layer automated defense + community GPS-proximity consensus |
| One-size-fits-all priority | Urgency scoring formula + K-Means++ zone clustering |
| AI as final arbiter — citizens have no recourse | Appeal mechanism forces human review on every AI rejection |

---

## 🔮 Roadmap

- [ ] Cloud Function triggers for real-time server-side XP awards
- [ ] Ward boundary GeoJSON overlay on map explorer
- [ ] Browser Use automation for govt portal submission
- [ ] WhatsApp / SMS notification channel via Twilio
- [ ] Full i18n: Hindi, Tamil, Kannada, Bengali
- [ ] Offline report queue (IndexedDB + Background Sync API)
- [ ] Computer Vision severity confidence overlay on issue images
- [ ] LLM-generated department SLA prediction model

---

## 👥 Team

Built with ❤️ for **Community Hero — Hyperlocal Problem Solver** Hackathon 🏛️

**Team:** [dayananddarpan.in](https://www.dayananddarpan.in/)

> *"We don't just accept reports — we interrogate them through three automated defense layers before a single ticket is created. And we don't just mark things 'Resolved' — our Gemini Vision agent compares before and after photos, keeping tickets open if the fix is unverifiable. 'Resolved' means AI-verified."*
