# 🏛️ Prastab — Hyperlocal Problem Solver

> **Hackathon Project** · A Progressive Web Application that empowers citizens to identify, report, validate, track, and resolve community issues through multi-agent AI, real-time collaboration, and gamification.

---

## 🚀 Live Demo

| Service | URL |
|---------|-----|
| Frontend (Firebase Hosting) | _Deploy & update_ |
| Backend API (Cloud Run) | _Deploy & update_ |
| API Docs (Swagger) | `<backend-url>/docs` |

---

## 🎯 Problem Statement

Communities face fragmented, opaque, and unaccountable civic issue reporting — potholes go unfixed, water leaks persist, and citizens have no visibility into what happens after they complain.

**Prastab** closes this loop using:
- **AI-powered analysis** (Gemini Vision + multimodal reasoning)
- **Multi-agent orchestration** (LangGraph + Judge/HITL pattern)
- **Real-time civic transparency** (Firestore + live dashboards)
- **Community participation** (gamification, leaderboards, upvotes)

---

## 🛡️ Production Roadmaps & Operational Guardrails

To transition Prastab (Community Hero) from MVP to a production-ready civic tool, we designed and implemented four core operational guardrails:

*   **Graceful Degradation (Fallback Mechanism):** A fallback parser that catches JSON formatting errors and timeouts (10-second API limit) from the LLM, routing failed outputs to manual triage rather than breaking the application loop or freezing the citizen's screen.
*   **Token & Budget Protection (Rate Limiting):** Explicit rate-limiting decorators on our Cloud Run endpoints (max 5 reports per user/IP per hour) to prevent malicious API spamming and protect quotas.
*   **Privacy by Design (PII Masking):** Automatic visual masking and blurring of human faces and license plates. The Reporter Agent flags PII upon ingestion, applying a blur filter to the media prior to rendering on public feeds.
*   **Offline Syncing (Close-the-Loop):** Leverage Firestore's built-in IndexedDB offline persistence to allow ground workers to cache "Proof-of-Fix" photos locally and automatically sync them to the backend when cellular data is restored.

---

## 💡 Innovation & Impact

Prastab disrupts legacy civic technology by treating AI not as a text-summarization tool, but as an autonomous infrastructure coordinator. 

By replacing human forms with Zero-Form Multimodal Ingestion, enforcing accountability via AI Proof-of-Resolution image audits, protecting quotas via algorithmic Civic Trust Scores, and bridging digital engagement to Sponsor-Funded Local Improvements, Prastab shifts civic engagement from a passive complaint log into a highly efficient, self-sustaining community engine.

### The Four Innovative Pillars

1.  **The "Zero-Form" Interaction Model (No Cognitive Friction)**
    *   *The Legacy Standard:* Citizens must navigate tedious dropdowns, write descriptions, and manually classify categories, causing high dropout rates.
    *   *Prastab's Innovation:* The citizen simply uploads a photo or records a quick 5-second audio snippet. Gemini Vision + Multimodal backend automatically extracts coordinates, translates local dialects, categorizes the issue, and routes it. Zero manual form-filling.
2.  **The AI "Proof-of-Resolution" Referee (No False Closures)**
    *   *The Legacy Standard:* Contractors mark issues as "Resolved" from desk computers without actual site verification. Citizens lose trust.
    *   *Prastab's Innovation:* Closing a ticket requires an "After" photo. Gemini Pro Vision compares the original "Before" image to the "After" image. If it detects a partial fix or location mismatch, it rejects closure and logs the details in the audit trail.
3.  **Dynamic "Civic Trust Scores" (Algorithmic Anti-Spam)**
    *   *The Legacy Standard:* Platforms are flooded with duplicates and spam, requiring manual moderation teams or disabling features.
    *   *Prastab's Innovation:* Users possess dynamic trust scores in Firestore. High-quality verifications increase trust, allowing reports to bypass HITL. Spamming drops their score, automatically throttling future proposals.
4.  **Direct Sponsor-Funded Local Improvements (Economic Gamification)**
    *   *The Legacy Standard:* Digital badges or points with no real-world value, leading to user disengagement.
    *   *Prastab's Innovation:* Community XP is linked to corporate CSR or RWA sponsorships. Reaching monthly XP thresholds in a ward unlocks funding for real-world infrastructure (e.g., smart solar benches).

---

## 🧠 Architecture — Agentic System

```
Citizen submits photo + location
        │
        ▼
┌─────────────────────────────────┐
│  FastAPI (Cloud Run)            │
│  LangGraph Orchestrator         │
│                                 │
│  ① Reporter Agent               │ ← Gemini Vision (category/severity)
│  ② Memory Agent                 │ ← Mem0 (location history, user trust)
│  ③ Validator Agent              │ ← Google Maps + PixelRAG + haversine
│  ④ Judge Agent ───────────────► │ ← Review & Critique Loop (up to 3x)
│      │ pass                     │
│      ▼ hitl?                    │
│  ⑤ HITL (Human-in-the-Loop)    │ ← Authority Portal approve/reject
│      │ approved                 │
│      ▼                         │
│  ⑥ Resolver Agent              │ ← LlamaIndex RAG + dept routing + SLA
│                                 │
│  Pub/Sub events at every step   │
└─────────────────────────────────┘
        │
        ▼
 Firestore (shared state)
 Firebase FCM (push notifications)
```

### Agent Roles

| Agent | Purpose | Google Tech |
|-------|---------|-------------|
| **Reporter** | Vision analysis, severity scoring, safety detection | Gemini 1.5 Pro (Vision) |
| **Memory** | Location recall, user trust, auto-escalation | Mem0 + Firestore |
| **Validator** | Geo-verify, duplicate detection, spam filter | Google Maps API, PixelRAG, ChromaDB |
| **Judge** | Review & Critique — quality gate before routing | Gemini 1.5 Pro (text reasoning) |
| **HITL Bridge** | Human authority approval for borderline cases | Firestore + Pub/Sub |
| **Resolver** | Department routing, SLA, ticket generation | LlamaIndex RAG + Gemini |

### State Machine

```
DRAFT → TRIAGE → IN_REVIEW ──(HITL approve)──► VALIDATED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED
                     │ (HITL reject)                                   ↑
                     └──────────────────────────────────────────────► ESCALATED
```

---

## 🏗️ Tech Stack

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | **React 18** + Vite 8 |
| Styling | **Vanilla CSS** with CSS custom properties (dark mode) |
| State | **Zustand** + Firebase Realtime listeners |
| Maps | **Leaflet** + OpenStreetMap + Nominatim reverse geocoding |
| Charts | **Chart.js** (react-chartjs-2) |
| PWA | **vite-plugin-pwa** + Workbox (precaching + background sync) |
| Push | **Firebase Cloud Messaging** (service worker) |
| Auth | **Firebase Auth** (Email, Google OAuth, Anonymous) |

### Backend
| Layer | Technology |
|-------|-----------|
| API | **FastAPI** + Uvicorn |
| AI Orchestration | **LangGraph** (stateful multi-agent graph) |
| AI Model | **Gemini 1.5 Pro** (vision + text) via Google GenAI |
| Embeddings | **Vertex AI text-embedding-004** |
| RAG | **LlamaIndex** + **ChromaDB** (civic documents) |
| Memory | **Mem0** (persistent agent memory) |
| Visual Dedup | **PixelRAG** (multimodal image embeddings) |
| State | **Firestore** (serverless, real-time) |
| Messaging | **Cloud Pub/Sub** (async agent events) |
| Secrets | **Google Secret Manager** + .env fallback |
| Deployment | **Cloud Run** (scale-to-zero) |
| Storage | **Firebase Storage** (issue media) |

---

## 📱 Features

### 🔍 Issue Reporting (4-Step Wizard)
- Drag-and-drop image/video upload to Firebase Storage
- GPS auto-detect + click-to-pin location picker
- Live agent pipeline progress panel (5 animated steps)
- AI analysis result: category, severity, department, SLA

### 🗺️ Map Explorer
- Leaflet interactive map with severity-colored circle markers
- 3 tile styles (dark/light/satellite)
- Sidebar with issue list, severity legend, statistics
- Fly-to animation on selection

### 📊 Impact Dashboard
- Real-time KPI cards (total, resolved, critical, in-progress)
- 7-day trend line chart
- Status doughnut + category bar charts
- **Gemini AI Predictive Insights** (ward-level civic intelligence)

### 🏆 Leaderboard + Gamification
- 7-tier rank system: Newcomer → Helper → Advocate → Crusader → Champion → Hero → Legend
- 3-place visual podium
- Real-time Firestore rankings
- XP system: +10 report, +25 resolved, +15 verified, +2 upvote

### 🔐 Authority Portal (HITL)
- Real-time HITL queue (issues awaiting human review)
- One-click Approve / Reject / Escalate per issue card
- Active issues management table with status + SLA

### 🔔 Real-Time Notifications
- Firebase Cloud Messaging push notifications
- In-app notification center with unread badge
- Background service worker notification handling

---

## 📂 Project Structure

```
vibe2ship/
├── frontend/                    # React PWA
│   ├── src/
│   │   ├── pages/               # Route-level page components
│   │   │   ├── Landing.jsx      # Hero landing page
│   │   │   ├── Feed.jsx         # Real-time issue feed
│   │   │   ├── ReportIssue.jsx  # 4-step report wizard
│   │   │   ├── MapExplorer.jsx  # Interactive map
│   │   │   ├── IssueDetail.jsx  # Issue detail + HITL panel
│   │   │   ├── Dashboard.jsx    # Impact analytics
│   │   │   ├── Leaderboard.jsx  # Gamification rankings
│   │   │   ├── AuthorityPortal.jsx # HITL queue
│   │   │   ├── Profile.jsx      # User profile + XP
│   │   │   └── Notifications.jsx
│   │   ├── components/
│   │   │   ├── common/          # Nav, ErrorBoundary
│   │   │   └── map/             # LocationPicker
│   │   ├── store/               # Zustand stores (auth, issues)
│   │   ├── services/            # Firebase, agentApi
│   │   └── styles/              # Global CSS design system
│   ├── public/
│   │   ├── firebase-messaging-sw.js  # FCM service worker
│   │   └── manifest.webmanifest
│   └── vite.config.js
│
├── backend/                     # FastAPI + LangGraph
│   ├── agents/
│   │   ├── orchestrator.py      # LangGraph StateGraph
│   │   ├── reporter_agent.py    # Gemini Vision analysis
│   │   ├── validator_agent.py   # Geo + duplicate check
│   │   ├── memory_agent.py      # Mem0 context
│   │   ├── judge_agent.py       # Review & Critique loop
│   │   └── resolver_agent.py    # RAG routing + ticket
│   ├── services/
│   │   ├── state_machine.py     # Issue lifecycle FSM
│   │   ├── rag_pipeline.py      # LlamaIndex + ChromaDB
│   │   ├── pixel_rag.py         # Visual duplicate detection
│   │   ├── pubsub_service.py    # Async pub/sub events
│   │   └── secret_manager.py   # GCP Secret Manager
│   ├── api/
│   │   ├── routes.py            # FastAPI endpoints
│   │   └── models.py            # Pydantic schemas
│   ├── scripts/
│   │   └── ingest_docs.py       # RAG document ingestion
│   ├── main.py                  # Uvicorn entry point
│   └── Dockerfile
│
├── firestore.rules              # Security rules
└── cloudbuild.yaml              # CI/CD pipeline
```

---

## ⚡ Quick Start

### 1. Clone & Install
```bash
git clone <repo>
cd vibe2ship/frontend && npm install
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
```

### 3. Seed RAG Knowledge Base
```bash
cd backend
pip install -r requirements.txt
python scripts/ingest_docs.py
```

### 4. Run Locally
```bash
# Terminal 1 — Backend
cd backend && python main.py

# Terminal 2 — Frontend
cd frontend && npm run dev
```

App available at `http://localhost:5173`

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

### Firestore Rules
```bash
firebase deploy --only firestore:rules
```

---

## 📊 Evaluation Criteria Mapping

| Criterion | Implementation |
|-----------|---------------|
| **Problem Solving & Impact (20%)** | Transparent lifecycle tracking, HITL accountability, SLA enforcement, AI auto-routing to correct municipal dept |
| **Agentic Depth (20%)** | 6-node LangGraph graph · Judge agent with self-correction loop (3 retries) · HITL bridge · Pub/Sub decoupling · State machine transitions |
| **Innovation & Creativity (20%)** | PixelRAG visual dedup · Gemini predictive insights · 7-tier gamification · Rank progression · Community verification ring |
| **Google Technologies (15%)** | Gemini 1.5 Pro · Vertex AI embeddings · Firebase (Auth/Firestore/Storage/FCM/Hosting) · Cloud Run · Cloud Pub/Sub · Secret Manager · Google Maps API |
| **Product Design (10%)** | Dark glassmorphism UI · CSS animation system · Leaflet map explorer · Responsive PWA · Install banner |
| **Technical Implementation (10%)** | LangGraph TypedDict state · Pydantic validation · Firestore security rules · Workbox service worker · Zero-dependency build |
| **Completeness (5%)** | 10 fully working pages · E2E flow from report → HITL → resolve · Health check · Error boundary · 404 page |

---

## 🔮 Future Enhancements

- [ ] Cloud Function triggers for XP awards (real-time, server-side)
- [ ] Ward boundary GeoJSON overlay on map
- [ ] Browser Use integration for automated govt portal submission
- [ ] WhatsApp/SMS notification channel via Twilio
- [ ] Multi-language support (i18n)
- [ ] Offline report queue (IndexedDB + Background Sync)
- [ ] Computer Vision severity auto-detection confidence overlay

---

## 👥 Team

Built for **Hackathon — Prastab Challenge** 🏛️
