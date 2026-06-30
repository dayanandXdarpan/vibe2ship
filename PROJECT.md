# 🏛️ Prastab (प्रस्ताव) — Civic Empowerment System

> **Hackathon Submission · Problem Statement: Prastab — Hyperlocal Problem Solver
> **Category:** AI-Powered Civic Technology / Progressive Web Application

---

## 📋 Problem Statement

Communities across India and the world face persistent infrastructure challenges — potholes, broken streetlights, water leakages, overflowing garbage, and damaged roads. The core failure is not a lack of concern; it is a **system failure**:

| Gap | Impact |
|-----|--------|
| Reporting is fragmented (WhatsApp groups, phone calls) | Data is lost, duplicated, or never reaches authorities |
| No verification layer | Fake or spam reports flood the system |
| Zero transparency after submission | Citizens lose trust; no one knows if the city is acting |
| "Resolved" is self-declared | Authorities close tickets without proof of actual fix |
| No prioritization | Critical issues and minor ones are treated equally |

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
│ Auto-category    │ Semantic location    │ Quality score 1-5     │
│ Severity score   │   mismatch check     │ Reporter rewarded     │
│ Dept routing     │ PixelRAG visual dup  │   on verified fix     │
│                  │ Community Confirm/   │ Audit trail entry     │
│                  │   Dispute votes      │   for every action    │
│                  │ HITL for edge cases  │                       │
│                  │ Appeal mechanism     │                       │
└──────────────────┴──────────────────────┴───────────────────────┘
```

**The core promise:** "Reporting is as easy as a photo. Resolved means AI-verified."

---

## 🤖 Multi-Agent Architecture (LangGraph)

Prastab runs a **LangGraph-orchestrated multi-agent pipeline** where every issue submission is processed by 5 specialized AI agents in sequence:

```
Citizen Submits Photo + GPS
          │
          ▼
 ┌─────────────────┐
 │  Reporter Agent │  Gemini 1.5 Pro Vision
 │                 │  Extracts: category, severity (1-5),
 │                 │  description, tags, routing dept
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │  Memory Agent   │  Mem0 + Firestore
 │                 │  Recalls: location history, user
 │                 │  trust score, past patterns at site
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │ Validator Agent │  Google Maps API + Gemini Flash
 │  (4 sub-layers) │
 │                 │  Layer 1:   Geo-verification + place types
 │                 │  Layer 1.5: Semantic mismatch check
 │                 │  Layer 2:   Haversine dedup (50m/30 days)
 │                 │  Layer 3:   PixelRAG visual similarity
 └────────┬────────┘
          │ VALID / DUPLICATE / INVALID / SPAM
          ▼
 ┌─────────────────┐
 │   Judge Agent   │  Gemini 1.5 Pro (HITL Gate)
 │                 │  Quality score, critique, routing
 │                 │  PROCEED / HITL / ESCALATE / CLARIFY
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │ Resolver Agent  │  Cloud Pub/Sub + Firestore
 │                 │  SLA assignment, dept notification,
 │                 │  ticket generation, status tracking
 └─────────────────┘
```

**State Machine** (`state_machine.py`) governs explicit lifecycle transitions with full audit logging:
```
DRAFT → TRIAGE → IN_REVIEW → VALIDATED → ASSIGNED → IN_PROGRESS → RESOLVED
                    ↑                                                    │
                    └─── HITL (Human-in-the-Loop) ──────────────────────┘
                    ↑
              ESCALATED / SPAM_SUSPECTED / NEEDS_CLARIFICATION
```

Every transition is recorded in Firestore's `audit_trail` subcollection with timestamp + actor ID — an **immutable public ledger**.

---

## ✨ Key Features

### 1. AI-Powered Issue Reporting
- **One-step photo submission** — photo + GPS = AI does the rest
- Gemini 1.5 Pro analyzes the image and auto-fills category, severity, description, and department
- Real-time GPS geolocation with Google Maps reverse geocoding + address verification
- Structured JSON output ensures data consistency across every report
- User can add optional voice/text description for context

### 2. Multi-Layer Verification System

| Layer | Method | Technology |
|-------|--------|------------|
| 1. Image Forensics | Multimodal analysis: image vs. location metadata | Gemini 1.5 Pro Vision |
| 1.5 Semantic Check | Category plausibility for location type (e.g., water leak on highway?) | Gemini Flash + Google Maps Places |
| 2. Geo-Dedup | Haversine formula: 50m radius / 30-day window check | Pure Python math |
| 3. Visual Dedup | Image embedding similarity — catches same issue, different photos | PixelRAG + Vertex AI Embeddings |
| 4. Community | Confirm / Dispute votes from nearby citizens | Firestore real-time |
| 5. HITL | High-severity / semantically flagged → human authority review | LangGraph Judge node |
| 6. Appeal | Rejected reporters trigger mandatory human review | State machine bypass |

### 3. Community Consensus Engine
- Confirm / Dispute buttons on every issue (one vote per citizen per issue, immutable)
- Animated community confidence bar (% confirms vs. disputes)
- Auto-escalates to HITL when disputes ≥ 3 AND disputes > confirms
- Verifiers earn Civic Trust Score bonuses for accurate confirmations

### 4. Urgency Scoring & Feed Ranking
Custom weighted formula:
```
W = 0.40 × severity_norm
  + 0.25 × log(upvotes + 1) / log(max_upvotes + 2)
  + 0.20 × verify_norm
  + 0.15 × (1 / age_hours + 1)
  × credibility_multiplier(reporter_trust_score)
```
- Feed supports 3 sort modes: Recent, AI Urgency, Most Voted
- Animated urgency bar on each issue card

### 5. Regional Priority Zones (K-Means AI Clustering)
- Pure-Python K-Means++ clustering of active issues by lat/lng
- Auto-determines optimal k = min(√n, 8)
- Labels zones: CRITICAL → HIGH → MODERATE → LOW
- Results cached in Firestore `ward_insights` collection
- Displayed on Dashboard as color-coded Regional Priority Zones

### 6. Proof-of-Resolution
- Authorities MUST upload an after-photo to close a ticket
- Gemini 1.5 Pro Vision performs before/after image comparison
- Returns: RESOLVED | PARTIAL | UNRESOLVED with confidence %
- PARTIAL or UNRESOLVED → ticket stays open with AI feedback
- Reporter earns trust bonus when their report is AI-verified resolved
- Before/After images shown side-by-side on the public issue page

### 7. Impact Dashboard
- Real-time KPI cards: Total Issues, Resolved, Critical, Resolution Rate %
- 7-day trend line chart, category doughnut, status bar chart
- Regional Priority Zones panel (K-Means hotspot clusters)
- AI Predictive Insights powered by Gemini RAG over ward history
- All data from Firestore real-time listeners

### 8. Live Map Explorer
- Leaflet.js interactive map with real-time issue markers
- Color-coded by severity, filterable by category/status/ward
- Clickable popups with issue preview + quick actions

### 9. Gamification & Civic Trust Score
- XP points for: reporting, upvoting, confirming, resolving
- Civic Trust Score (0.0–1.0) affects report weight in urgency formula
- Deltas: VALID +0.05, RESOLVED +0.10, SPAM −0.20, VERIFIED +0.03
- Leaderboard ranks top contributors by ward
- Badge system visible on profiles

### 10. Authority Portal (HITL Dashboard)
- HITL Queue: issues flagged for review, sorted by severity
- Approve / Reject / Escalate with reason logging (all audited)
- Proof-of-Resolution tab: upload after-photo → Gemini verifies → AI verdict + quality stars (1-5)
- All Issues table with real-time filtering

### 11. Appeal Mechanism
- Reporter can appeal any AI-rejected report (visible only to them on rejected issues)
- Minimum 10-character reason enforced at Firestore rules level
- Appeal bypasses AI → forces `in_review` → mandatory HITL
- Stored in immutable `appeals` Firestore subcollection

### 12. Progressive Web App (PWA)
- Installable on Android, iOS, desktop — no app store required
- Service Worker + Workbox offline-first caching
- Web App Manifest, optimized Lighthouse score
- Real-time push notifications via Firebase Cloud Messaging

---

## 🛠️ Technologies Used

### Frontend Stack
| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| Vite 8 + vite-plugin-pwa | Build tooling + PWA |
| Leaflet.js | Interactive maps |
| Chart.js + react-chartjs-2 | Data visualization |
| Zustand | Lightweight state management |
| React Router 7 | Client-side routing |
| Vanilla CSS (custom design system) | Glassmorphism dark UI |

### Backend Stack
| Technology | Purpose |
|------------|---------|
| FastAPI | REST API (async) |
| LangGraph | Multi-agent state orchestration |
| LangChain | LLM integration layer |
| Python 3.11 | Runtime |
| httpx | Async HTTP client |
| Pydantic v2 | Schema validation |
| uvicorn | ASGI server |
| Docker | Containerization |

---

## 🟡 Google Technologies Utilized

| Google Technology | Specific Usage |
|-------------------|---------------|
| **Gemini 1.5 Pro** | Reporter Agent: multimodal image analysis → structured JSON report |
| **Gemini 1.5 Pro** | Judge Agent: quality scoring + HITL/PROCEED routing |
| **Gemini 1.5 Pro** | Proof-of-Resolution: before/after image comparison → RESOLVED/PARTIAL/UNRESOLVED verdict |
| **Gemini 1.5 Flash** | Semantic location mismatch: is this category plausible here? |
| **Gemini 1.5 Flash** | Predictive ward insights from historical issue patterns (RAG) |
| **Google Maps Geocoding API** | GPS → human address + place types for semantic check |
| **Google Maps JavaScript API** | Embedded interactive map tiles |
| **Firebase Authentication** | Every action tied to verified account (email/Google OAuth) |
| **Cloud Firestore** | Primary real-time database; subcollections for audit_trail, community_votes, appeals |
| **Firebase Cloud Messaging** | Push notifications for status change alerts |
| **Firebase Hosting** | PWA frontend deployment |
| **Cloud Run** | Containerized FastAPI backend (Dockerfile included) |
| **Cloud Pub/Sub** | Async decoupled messaging between Resolver Agent and notification service |
| **Vertex AI Embeddings** | PixelRAG visual duplicate detection (multimodal embeddings) |
| **Google Cloud Secret Manager** | Secure API key management in production |
| **Google Cloud Logging** | Agent decision audit trail for regulatory accountability |

---

## 🎯 Evaluation Criteria Mapping

| Criterion | Weight | How Prastab Addresses It |
|-----------|--------|----------------------------|
| **Problem Solving & Impact** | 20% | Complete end-to-end governance: report → verify → track → AI-verified resolve. Addresses fragmented reporting, fake data, lack of transparency, and unverifiable resolutions |
| **Agentic Depth** | 20% | 5-node LangGraph pipeline with self-correction loop, HITL gate, stateful Mem0 memory, credibility feedback loops, community consensus auto-escalation |
| **Innovation & Creativity** | 20% | Proof-of-Resolution (AI won't let you fake "fixed"), semantic location mismatch, K-Means++ priority zones, community consensus → auto-escalation pipeline |
| **Usage of Google Technologies** | 15% | 16 Google technologies integrated: Gemini 1.5 Pro (3 distinct tasks), Google Maps, Firebase full suite, Cloud Run, Pub/Sub, Vertex AI, Secret Manager, Cloud Logging |
| **Product Experience & Design** | 10% | Installable PWA, dark glassmorphism UI, real-time Firestore updates, before/after proof panel, animated urgency bars, responsive layout |
| **Technical Implementation** | 10% | LangGraph orchestration, typed state schema, Firestore subcollection rules, Haversine + PixelRAG dedup, pure-Python K-Means++, state machine with typed FSM |
| **Completeness & Usability** | 5% | Full flow: Report → AI analysis → Community validation → Authority HITL → AI-verified resolution → Public audit trail visible to all |

---

## 🔐 Security & Accountability Model

- **Firestore Security Rules** enforce role-based access at database level
- `community_votes`: one write per user per issue, immutable (no updates/deletes)
- `appeals`: minimum 10-char reason, reporter-only creation, immutable
- `audit_trail`: backend Admin SDK only (client cannot forge transitions)
- Trust-sensitive fields (`role`, `trustScore`, `points`) are backend-controlled
- **Google Cloud Logging** records all HITL decisions for auditability
- Every status transition: logged with actor UID + timestamp + reason

---

## 📊 Platform Metrics Tracked

- Resolution Rate (% issues resolved vs. total reported)
- Average SLA adherence by department
- Civic Trust Score distribution across citizens
- K-Means hotspot zone severity by ward
- Duplicate compression ratio (reports merged vs. created)
- HITL override rate (% of AI decisions reversed by humans)
- Community consensus accuracy on AI-verified resolutions

---

## 🚀 Key Differentiators vs. Existing Solutions

| Existing Solutions | Prastab |
|-------------------|------------|
| "My Complaint" apps — submit and forget | Real-time status + push notifications |
| WhatsApp groups — fragmented, unstructured | AI-structured, geo-tagged, deduplicated |
| Self-declared "Resolved" status | Gemini Vision before/after comparison required |
| No verification → spam floods system | 4-layer automated defense + community consensus |
| One-size-fits-all priority | Urgency scoring formula + K-Means zone clustering |
| AI as final arbiter | Appeal mechanism forces human review on all rejections |
