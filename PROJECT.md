# 🏛️ Prastab (प्रस्ताव) — Civic Empowerment System

> **Hackathon Submission · Problem Statement: Community Hero — Hyperlocal Problem Solver**
> **Category:** AI-Powered Civic Technology / Progressive Web Application

---

## 📋 Problem Statement

Communities across India and the world face persistent infrastructure challenges — potholes, broken streetlights, water leakages, overflowing garbage, and damaged roads. The core failure is not a lack of concern; it is a **systemic governance failure**:

| Gap | Impact |
|-----|--------|
| Reporting is fragmented (WhatsApp groups, phone calls) | Data is lost, duplicated, or never reaches authorities |
| No automated verification layer | Fake or spam reports flood the system |
| Zero transparency after submission | Citizens lose trust; no one knows if the city is acting |
| "Resolved" is self-declared by authorities | Tickets closed without proof of actual fix |
| No intelligent prioritization | Critical safety issues treated the same as minor ones |
| Digital divide | Complex forms exclude low-literacy citizens |

The result: civic issues linger for months, trust in local governance erodes, and communities disengage.

---

## 💡 Solution Overview

**Prastab** is an AI-native, mobile-first Progressive Web Application (PWA) that transforms how communities report, verify, track, and resolve local infrastructure issues.

Instead of a simple ticketing tool, Prastab is a **Governance Platform** built on three explicit pillars:

```
┌──────────────────┬──────────────────────┬───────────────────────┐
│  I. REPORTING    │  II. VERIFICATION    │  III. RESOLUTION      │
├──────────────────┼──────────────────────┼───────────────────────┤
│ Photo + GPS      │ AI image forensics   │ Before/After Gemini   │
│ Gemini Vision    │ Haversine dedup      │ Vision comparison     │
│ Voice note       │ Semantic location    │ Quality score 1-5     │
│ Auto-category    │   mismatch check     │ Reporter rewarded     │
│ Severity score   │ PixelRAG visual dup  │   on verified fix     │
│ Dept routing     │ Community Confirm/   │ Audit trail entry     │
│ SLA assignment   │   Dispute votes      │   for every action    │
│ PII masking      │ HITL for edge cases  │ Immutable public log  │
│                  │ Appeal mechanism     │                       │
└──────────────────┴──────────────────────┴───────────────────────┘
```

**The core promise:** *"Reporting is as easy as a photo. Resolved means AI-verified."*

---

## 🤖 Multi-Agent Architecture (LangGraph)

Prastab runs a **LangGraph-orchestrated multi-agent pipeline** where every issue submission is processed by 6 specialized AI agents in sequence:

```
Citizen Submits Photo + GPS (+ optional voice note)
          │
          ▼
 ┌─────────────────┐
 │  Reporter Agent │  Gemini 1.5 Pro Vision + Audio
 │                 │  Extracts: category, severity (1-5),
 │                 │  confidence (0-1), description, tags,
 │                 │  routing dept, SLA, PII detection,
 │                 │  voice note transcription (multilingual)
 └────────┬────────┘
          │ High confidence → proceed
          │ Medium → flag_and_proceed
          │ Low confidence → request clarification
          │ Error → fallback_triage (HITL)
          ▼
 ┌─────────────────┐
 │  Memory Agent   │  Mem0 + Firestore
 │                 │  Recalls: location history, user
 │                 │  trust score, past patterns at site
 │                 │  Auto-escalates if 3+ past reports
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │ Validator Agent │  Google Maps API + Gemini Flash + PixelRAG
 │  (4 sub-layers) │
 │                 │  Layer 1:   Geo-verification + place types
 │                 │  Layer 1.5: Semantic mismatch check
 │                 │  Layer 2:   Haversine dedup (50m/30 days)
 │                 │  Layer 3:   PixelRAG visual similarity
 └────────┬────────┘
          │ VALID / DUPLICATE / INVALID / SPAM
          ▼
 ┌─────────────────┐
 │   Judge Agent   │  Gemini 1.5 Pro (Review & Critique Gate)
 │                 │  Quality score, critique, routing decision
 │   (loops ≤3x)  │  PROCEED / HITL / ESCALATE / CLARIFY
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │  HITL Bridge    │  Authority Portal (human verifier)
 │  (if required)  │  Approve / Reject / Escalate with audit log
 └────────┬────────┘
          │ approved
          ▼
 ┌─────────────────┐
 │ Resolver Agent  │  LlamaIndex RAG + Cloud Pub/Sub + Firestore
 │                 │  SLA assignment, dept notification,
 │                 │  ticket generation, status tracking,
 │                 │  reporter XP award, citizen notification
 └─────────────────┘
```

### State Machine (Typed FSM — `state_machine.py`)

```
DRAFT → TRIAGE → IN_REVIEW → VALIDATED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED
                     ↑                                                    │
                     └── HITL (Human-in-the-Loop) ──────────────────────┘
                     ↑
               ESCALATED / SPAM_SUSPECTED / NEEDS_CLARIFICATION
```

Every transition is recorded in Firestore's `audit_trail` subcollection with timestamp + actor UID + reason — an **immutable public ledger**. Direct Firestore writes are prohibited; all transitions go through `apply_transition_to_firestore()`.

---

## ✨ Key Features

### 1. 📸 AI-Powered Issue Reporting (Zero-Form)
- **One-step photo submission** — photo + GPS = AI does the rest
- **Voice note support** — 5-second clip in Hindi/Marathi/Tamil/English → Gemini transcribes + incorporates
- Gemini 1.5 Pro analyzes image: auto-fills category, severity (1-5), description, department, SLA
- Real-time GPS geolocation with Google Maps reverse geocoding + address verification
- **PII Detection**: Reporter Agent flags human faces and license plates with `pii_flagged_details` for blur layer
- Structured JSON output (Pydantic-validated) ensures data consistency across every report
- Rate limited: **max 5 reports per user per hour** (Firestore-backed + IP fallback)

### 2. 🔍 Multi-Layer Verification System (4-Layer Defense)

| Layer | Method | Technology |
|-------|--------|-----------|
| 1. Image Forensics | Multimodal: image content vs. location metadata | Gemini 1.5 Pro Vision |
| 1.5 Semantic Check | Category plausibility for location type (e.g., water leak on highway?) | Gemini Flash + Google Maps Places |
| 2. Geo-Dedup | Haversine formula: 50m radius / 30-day window deduplication | Pure Python math |
| 3. Visual Dedup | Image embedding similarity — same issue, different photos | PixelRAG + Vertex AI Embeddings |
| 4. Community | Confirm / Dispute votes from GPS-fenced nearby citizens | Firestore real-time |
| 5. HITL | High-severity / flagged issues → human authority review | LangGraph Judge node |
| 6. Appeal | Rejected reporters trigger mandatory human review | State machine bypass |

### 3. 🤝 Community Consensus Engine
- **Confirm / Dispute** buttons on every issue (one immutable vote per citizen per issue)
- **GPS proximity fence**: must be within **100 meters** of issue to verify — prevents armchair voting
- Animated community confidence bar (% confirms vs. disputes)
- Auto-escalates to HITL when: `disputes ≥ 3 AND disputes > confirms`
- Verifiers earn Civic Trust Score bonuses for accurate confirmations (+0.03)

### 4. 📐 Urgency Scoring & Feed Ranking

Custom weighted formula optimized for civic safety:

```
W = 0.40 × severity_norm
  + 0.25 × log(upvotes + 1) / log(max_upvotes + 2)
  + 0.20 × verify_norm
  + 0.15 × (1 / age_hours + 1)
  × credibility_multiplier(reporter_trust_score)
```

- α = 0.40 (severity dominates — safety first)
- β = 0.25 (community votes signal real issues)
- γ = 0.20 (verified count is a quality ring)
- δ = 0.15 (recency — doesn't overwhelm severity)
- Feed supports 3 sort modes: **Recent**, **AI Urgency**, **Most Voted**
- Animated urgency bar on each issue card

### 5. 🗺️ K-Means++ Regional Priority Zones (Hotspot Detection)

- **Pure-Python K-Means++ clustering** of active issues by lat/lng coordinates
- Auto-determines optimal k = `min(√n, 8)` for civic context
- Labels zones: `CRITICAL → HIGH → MODERATE → LOW` based on cluster severity statistics
- Results cached in Firestore `ward_insights` collection for dashboard performance
- Displayed on Impact Dashboard as color-coded Regional Priority Zones

### 6. ✅ Proof-of-Resolution (AI Accountability)

- Authorities **must** upload an after-photo to close any ticket
- Gemini 1.5 Pro Vision performs before/after image comparison
- Returns: `RESOLVED | PARTIAL | UNRESOLVED` with confidence % and quality score (1-5)
- `PARTIAL` or `UNRESOLVED` → ticket stays open with specific AI feedback in audit trail
- Reporter earns trust bonus (+0.10) when their report is AI-verified resolved
- Before/After images shown side-by-side on the public issue detail page
- Verification note auto-appended to the immutable audit trail

### 7. 📊 Impact Dashboard
- Real-time KPI cards: Total Issues, Resolved, Critical, Resolution Rate %
- 7-day trend line chart, category doughnut, status bar chart
- Regional Priority Zones panel (K-Means++ hotspot clusters with severity labels)
- **Gemini AI Predictive Insights**: RAG over ward history → 5 actionable insights per ward
- All data from Firestore `onSnapshot` real-time listeners — zero polling

### 8. 🗺️ Live Map Explorer
- Leaflet.js interactive map with real-time issue markers
- Color-coded by severity (1-5), filterable by category/status/ward
- 3 tile styles (dark/light/satellite)
- Clickable popups with issue preview + quick actions
- Fly-to animation on issue selection

### 9. 🎮 Gamification & Civic Trust Score
- **XP points:** +10 report, +25 resolved, +15 verified, +2 upvote
- **Civic Trust Score** (0.0–1.0) dynamically adjusts report weight in urgency formula
- Trust deltas: VALID +0.05, RESOLVED +0.10, SPAM −0.20, VERIFIED +0.03, INVALID −0.10
- **7-tier rank system:** Newcomer → Helper → Advocate → Crusader → Champion → Hero → Legend
- Ward-level leaderboard with real-time rankings
- Profile badge system visible to community

### 10. 🔐 Authority Portal (HITL Dashboard)
- **HITL Queue**: issues flagged for review, sorted by severity with AI reasoning
- **Approve / Reject / Escalate** with reason logging — all audited in Firestore
- **Proof-of-Resolution tab**: upload after-photo → Gemini Vision verifies → AI verdict + quality stars (1-5)
- All Issues management table with real-time filtering and status tracking
- Full audit trail visible per issue — every action logged with actor + timestamp

### 11. 📣 Appeal Mechanism (AI is Not Final Arbiter)
- Reporter can appeal any AI-rejected report (visible only to them on rejected issues)
- Minimum 10-character reason enforced at Firestore security rules level
- Appeal bypasses AI → forces `in_review` → **mandatory HITL review**
- Stored in immutable `appeals` Firestore subcollection (clients cannot delete)
- Prevents AI bias from silently blocking legitimate civic reports

### 12. 📱 Progressive Web Application (PWA)
- Installable on Android, iOS, desktop — no app store required
- Service Worker + Workbox offline-first caching strategy
- Web App Manifest, optimized Lighthouse score
- Background sync for Proof-of-Fix photos in low connectivity areas
- Real-time push notifications via Firebase Cloud Messaging

---

## 🛠️ Technologies Used

### Frontend Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| Vite + vite-plugin-pwa | 8 | Build tooling + PWA capabilities |
| Leaflet.js | latest | Interactive issue map |
| Chart.js + react-chartjs-2 | latest | Data visualization |
| Zustand | latest | Lightweight global state management |
| React Router | 7 | Client-side routing |
| Vanilla CSS | — | Glassmorphism dark UI (CSS custom properties) |
| i18next | latest | Internationalization scaffold |

### Backend Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| FastAPI | 0.111 | REST API (async, auto-docs) |
| LangGraph | 0.1.5 | Multi-agent state orchestration |
| LangChain | 0.2.5 | LLM integration layer |
| Python | 3.11 | Runtime |
| Pydantic | v2 | Schema validation (request/response) |
| LlamaIndex | ≥0.10 | RAG pipeline over civic documents |
| ChromaDB | ≥0.5 | Vector store for civic knowledge base |
| Mem0 | ≥0.0.1 | Persistent agent memory |
| Uvicorn | 0.30.1 | ASGI production server |
| Docker | — | Containerization |
| httpx | 0.27 | Async HTTP client |

---

## 🟡 Google Technologies Utilized (17)

| Google Technology | Specific Usage in Prastab |
|-------------------|--------------------------|
| **Gemini 1.5 Pro Vision** | Reporter Agent: multimodal image + voice → structured JSON report (category, severity, PII) |
| **Gemini 1.5 Pro** | Judge Agent: quality scoring + self-correcting HITL/PROCEED routing |
| **Gemini 1.5 Pro Vision** | Proof-of-Resolution: before/after image comparison → RESOLVED/PARTIAL/UNRESOLVED verdict |
| **Gemini 1.5 Flash** | Semantic location mismatch: *is this issue category plausible here?* |
| **Gemini 1.5 Flash** | Predictive ward insights: RAG over historical issue patterns → 5 actionable insights |
| **Vertex AI Embeddings** | PixelRAG visual duplicate detection (multimodal image embeddings) |
| **Google Maps Geocoding API** | GPS coordinates → human address + place types for semantic check |
| **Google Maps JavaScript API** | Interactive embedded map tiles |
| **Firebase Authentication** | Every action tied to verified account (email/Google OAuth/Anonymous) |
| **Cloud Firestore** | Primary real-time database; subcollections: `audit_trail`, `community_votes`, `appeals` |
| **Firebase Cloud Messaging** | Push notifications: status changes, neighbor alerts, XP awards |
| **Firebase Storage** | Issue photo/video storage + Proof-of-Resolution media |
| **Firebase Hosting** | PWA frontend CDN deployment |
| **Cloud Run** | Containerized FastAPI backend (scale-to-zero, Dockerfile included) |
| **Cloud Pub/Sub** | Decoupled async messaging between agents and notification services |
| **Google Cloud Secret Manager** | Secure API key management in production |
| **Google Cloud Logging** | Agent decision audit trail for regulatory accountability |

---

## 🎯 Evaluation Criteria Mapping

| Criterion | Weight | How Prastab Addresses It |
|-----------|--------|--------------------------|
| **Problem Solving & Impact** | 20% | Complete end-to-end governance loop: report → 4-layer verify → track → AI-verified resolve → public audit. Directly addresses fragmented reporting, fake data, lack of transparency, and unverifiable resolutions |
| **Agentic Depth** | 20% | 6-node LangGraph StateGraph with self-correcting Judge loop (≤3x), HITL gate, stateful Mem0 memory, community consensus auto-escalation, credibility feedback loops, Pub/Sub decoupled events |
| **Innovation & Creativity** | 20% | Proof-of-Resolution (AI won't let you fake "fixed"), GPS-fenced community verification, semantic location mismatch detection, K-Means++ priority zones, dynamic Civic Trust Score anti-spam |
| **Usage of Google Technologies** | 15% | 17 Google technologies: Gemini 1.5 Pro/Flash (5 distinct tasks), Google Maps, Firebase full suite (Auth + Firestore + Storage + FCM + Hosting), Cloud Run, Pub/Sub, Vertex AI, Secret Manager, Cloud Logging |
| **Product Experience & Design** | 10% | Installable PWA, dark glassmorphism UI with CSS custom properties, real-time Firestore updates, before/after proof panel, animated urgency bars, 10 feature-complete pages, responsive layout |
| **Technical Implementation** | 10% | Typed `IssueState` TypedDict schema, Pydantic v2 validation, Firestore security rules (role-based + immutable subcollections), Haversine + PixelRAG dedup, pure-Python K-Means++, FSM with typed transitions |
| **Completeness & Usability** | 5% | Full citizen flow: Report → AI analysis → Community validation → Authority HITL → AI-verified resolution → Public audit trail + Appeal mechanism + Push notifications |

---

## 🔐 Security & Accountability Model

### Firestore Security Rules
- `community_votes`: **one write per user per issue, immutable** (no updates or deletes)
- `appeals`: minimum 10-char reason, reporter-only creation, immutable after write
- `audit_trail`: **backend Admin SDK only** — client SDK cannot forge state transitions
- Trust-sensitive fields (`role`, `trustScore`, `points`) are backend-controlled exclusively
- `issues`: status can only be updated by authorized backend service account

### Accountability Guarantees
- **Google Cloud Logging** records all HITL decisions for regulatory auditability
- Every status transition: logged with actor UID + timestamp + reason in `audit_trail`
- Rate limiting prevents abuse: 5 reports/user/hour (Firestore-backed + IP-based fallback)
- PII detected by Reporter Agent is flagged immediately — not stored in plaintext
- Community votes are GPS-fenced (100m radius) to prevent remote manipulation

---

## 📊 Platform Metrics Tracked

| Metric | Purpose |
|--------|---------|
| Resolution Rate (%) | % issues resolved vs. total reported |
| Average SLA Adherence | Departmental performance by category |
| Civic Trust Distribution | Histogram of trustScore across citizens |
| K-Means Hotspot Zones | Severity clustering by ward/geography |
| Duplicate Compression Ratio | Reports merged vs. new records created |
| HITL Override Rate | % of AI decisions reversed by human reviewers |
| Community Consensus Accuracy | Verifier correctness vs. final AI verdicts |
| Proof-of-Resolution Quality Score | Average 1-5 rating across verified closures |

---

## 🚀 Key Differentiators vs. Existing Solutions

| Existing Solutions | Prastab |
|-------------------|---------|
| "My Complaint" apps — submit and forget | Real-time status + push notifications at every step |
| WhatsApp groups — fragmented, unstructured | AI-structured, geo-tagged, deduplicated, dept-routed |
| Self-declared "Resolved" status | Gemini Vision before/after comparison required to close |
| No verification → spam floods system | 4-layer automated defense + GPS-fenced community consensus |
| One-size-fits-all priority | Urgency scoring formula + K-Means++ zone clustering |
| AI as final arbiter | Appeal mechanism forces mandatory human review on all rejections |
| Forms exclude low-literacy users | Zero-form: photo + voice note = complete report |
| Static, non-transparent dashboards | Real-time Firestore live data + public immutable audit trail |

---

## 🛡️ Production Guardrails

Four operational safeguards designed for real-world civic deployment:

| Guardrail | Implementation Detail |
|-----------|-----------------------|
| **Graceful Degradation** | Fallback JSON parser catches LLM formatting errors + 10s API timeout; routes to HITL triage rather than crashing the citizen's screen |
| **Rate Limiting** | `check_rate_limit` FastAPI dependency: max 5 reports/user/hour (Firestore query) + IP-based in-memory fallback. Returns HTTP 429 with retry guidance |
| **Privacy by Design (PII Masking)** | Reporter Agent detects faces, license plates, residential numbers via `pii_detected` field + `pii_flagged_details` string → ready for blur pipeline in production |
| **Offline Sync** | Firestore IndexedDB offline persistence allows ground workers to cache Proof-of-Fix photos locally and auto-sync when cellular is restored |

---

## 🔮 Roadmap

- [ ] Cloud Function triggers for real-time server-side XP awards
- [ ] Ward boundary GeoJSON overlay on map explorer
- [ ] Browser Use integration for automated government portal submission
- [ ] WhatsApp / SMS notification channel via Twilio
- [ ] Full i18n: Hindi, Tamil, Kannada, Bengali
- [ ] Offline report queue (IndexedDB + Background Sync API)
- [ ] Computer Vision confidence overlay on issue severity assessment
- [ ] LLM-generated department SLA prediction model
- [ ] Sponsor-funded XP threshold unlocking real-world infrastructure improvements

---

## 👥 Team

Built with ❤️ for **Community Hero — Hyperlocal Problem Solver** Hackathon 🏛️

**Team:** [dayananddarpan.in](https://www.dayananddarpan.in/)

---

## 🏗️ Architecture Decisions

### Why LangGraph?
LangGraph provides a **typed StateGraph** that enforces explicit state transitions between agents. Unlike simple chains, it supports conditional edges (routing based on agent decisions), self-correcting loops (Judge Agent retry), and HITL interrupts — all critical for a civic governance system where wrong decisions have real-world consequences.

### Why Firestore as the State Layer?
Firestore's real-time `onSnapshot` listeners enable the frontend to reflect pipeline progress without polling. Subcollections provide native document isolation for `audit_trail`, `community_votes`, and `appeals` — each with its own security rules. Scale-to-zero Cloud Run instances can be stateless because all durable state lives in Firestore.

### Why Pure-Python K-Means++?
No NumPy or scikit-learn dependency for the clustering layer — keeping the Docker image lean and the algorithm fully auditable. The K-Means++ initialization (weighted random seeding) improves cluster quality over naïve K-Means for civic hotspot detection where issues cluster non-uniformly.

### Why Proof-of-Resolution Requires an After-Photo?
The single most common failure in civic tech is the "mark as resolved" button. By making an after-photo a **hard requirement** enforced at the API level (FastAPI validation) and verified by Gemini Vision, Prastab creates an accountability loop that existing solutions lack entirely.
