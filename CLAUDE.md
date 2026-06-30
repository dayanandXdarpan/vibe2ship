# Prastab — Civic Empowerment Architecture Guide

> This file provides authoritative architectural context for AI coding assistants.
> Always read and follow these standards before modifying any file in this project.

---

## 🏛️ Three-Pillar Governance Model

Prastab is architected around three explicit governance pillars. Every feature maps to one of these:

| Pillar | Goal | Key Components |
|--------|------|----------------|
| **I. Reporting** | Lower the barrier; ensure data quality at ingestion | Reporter Agent (Gemini Vision), structured JSON, geo-tagging, community trust score |
| **II. Verification** | Prevent fake data; build multi-layer defense | Validator Agent (Haversine + semantic check + PixelRAG), Community Confirm/Dispute, HITL for high-stakes, Appeal mechanism |
| **III. Resolution** | Close the loop with verifiable proof | Proof-of-Resolution (Gemini before/after comparison), State machine transitions, Audit trail, Credibility reward on RESOLVED |

**Presentation answer for judges:**
> *"We don't just accept reports — we interrogate them through three automated defense layers before a single ticket is created. And we don't just mark things 'Resolved' — our Gemini Vision agent compares before and after photos, keeping tickets open if the fix is unverifiable. 'Resolved' means AI-verified."*


**Prastab** is a multi-agent Progressive Web Application for hyperlocal civic issue resolution.
Citizens report issues (potholes, water leaks, streetlights) via photo + GPS. A LangGraph
multi-agent pipeline analyzes, validates, routes, and resolves the issue — with human oversight
via a Judge Agent and HITL (Human-in-the-Loop) authority portal.

---

## 🧠 Agent Architecture (Non-Negotiable Rules)

### 1. State is Firestore — NOT in-memory
- Every agent reads/writes issue state through Firestore (`issues/{issue_id}`)
- The in-memory `pipeline_jobs` dict in `routes.py` is only a **polling cache** — not the source of truth
- All persistent state transitions go through `services/state_machine.py`

### 2. Agent Outputs Must Be Structured JSON
Every agent function returns a **Pydantic-compatible dict** or updates `IssueState` TypedDict fields.
Never return unstructured strings from an agent. Example:
```python
# ✅ CORRECT
return {**state, "category": "pothole", "severity": 4, "ai_confidence": 0.87}

# ❌ WRONG
return "The issue is a pothole with severity 4"
```

### 3. State Machine Transitions Are Enforced
Always use `services/state_machine.py` → `apply_transition_to_firestore()` for status changes.
Never call `db.collection("issues").document(id).update({"status": "..."})` directly.
Valid transitions:
```
DRAFT → TRIAGE → IN_REVIEW ──(approve)──► VALIDATED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED
                    └──(reject)──► ESCALATED
```

### 4. Judge Agent Gate (Review & Critique Pattern)
Before routing to Resolver, issues pass through the Judge Agent (`agents/judge_agent.py`).
The Judge loops up to **3 times** for self-correction. After 3 loops it either:
- `PROCEED` → resolver_agent
- `HITL` → handle_hitl (requires authority approval)
- `ESCALATE` → handle_escalate

**Never bypass the Judge node** when adding new routing logic.

### 5. Pub/Sub for Agent Events
Use `services/pubsub_service.py` for inter-agent events. Do NOT use HTTP callbacks between agents.
Available publishers: `publish_issue_submitted`, `publish_hitl_required`, `publish_issue_resolved`

---

## 📁 File Map — Where Things Live

```
backend/
├── agents/
│   ├── orchestrator.py      # LangGraph graph definition. Add nodes HERE.
│   ├── reporter_agent.py    # Gemini Vision analysis → category, severity, description
│   ├── memory_agent.py      # Mem0 recall/store. Location history, user trust score
│   ├── validator_agent.py   # Google Maps geocoding + PixelRAG duplicate check
│   ├── judge_agent.py       # Review & Critique loop (up to 3x). Routes to HITL or proceed.
│   └── resolver_agent.py    # LlamaIndex RAG → dept routing, SLA, ticket generation
│
├── services/
│   ├── state_machine.py     # FSM: IssueStatus enum + VALID_TRANSITIONS matrix
│   ├── rag_pipeline.py      # LlamaIndex + ChromaDB. build_query_engine() is cached.
│   ├── pixel_rag.py         # Visual dedup. query_similar_images() returns score 0-1
│   ├── pubsub_service.py    # Cloud Pub/Sub typed event publishers
│   ├── secret_manager.py    # GCP Secret Manager. Falls back to .env. Use get_secret()
│   └── firestore_client.py  # Firebase Admin. get_firestore_client() is singleton.
│
├── api/
│   ├── routes.py            # FastAPI endpoints. POST /report triggers background LangGraph run.
│   └── models.py            # Pydantic request/response schemas. Keep in sync with frontend types.
│
└── scripts/
    └── ingest_docs.py       # Seeds 6 civic dept docs into ChromaDB. Run once before demo.

frontend/src/
├── pages/                   # Route-level components. One CSS file per page.
├── components/common/       # Nav (glassmorphism), ErrorBoundary
├── components/map/          # LocationPicker (Leaflet + Nominatim)
├── store/
│   ├── authStore.js         # Firebase Auth + Firestore user profile. Zustand + persist.
│   └── issueStore.js        # Firestore onSnapshot subscriptions. upvoteIssue uses subcollection.
├── services/
│   ├── firebase.js          # Firebase app init. Exports: auth, db, storage, googleProvider
│   └── agentApi.js          # FastAPI client. pollPipelineStatus() handles HITL terminal state.
└── styles/index.css         # CSS custom properties (design tokens). ALL colors defined here.
```

---

## 🎨 Frontend Standards

### CSS Rules
- ALL colors come from CSS custom properties in `styles/index.css`. Never hardcode hex in components.
- Use `var(--primary)`, `var(--danger)`, `var(--success)`, `var(--warning)`, `var(--info)`
- Severity colors: `var(--sev-critical)` (5), `var(--sev-high)` (4), `var(--sev-medium)` (3)
- Dark theme only. Background: `var(--bg-base)` → `var(--bg-surface)` → `var(--bg-elevated)`

### Component Pattern
```jsx
// ✅ CORRECT — one CSS file per page
import './PageName.css'

// ✅ CORRECT — real-time Firestore
useEffect(() => {
  const unsub = subscribeToIssues()
  return () => unsub?.()
}, [])

// ❌ WRONG — never fetch() Firestore directly from components. Use store hooks.
```

### State Management
- **Auth state**: `useAuthStore()` — has `user`, `profile`, `loginWithEmail`, `loginWithGoogle`, `logout`
- **Issue state**: `useIssueStore()` — has `issues`, `subscribeToIssues`, `upvoteIssue`, `addComment`
- Never create local state for data that belongs in Firestore

---

## 🔑 Environment Variables

### Frontend (Vite — prefix `VITE_`)
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_GOOGLE_MAPS_API_KEY
VITE_BACKEND_URL=http://localhost:8080
VITE_VAPID_KEY
```

### Backend (via Secret Manager or .env)
```
GOOGLE_CLOUD_PROJECT
GEMINI_API_KEY
GOOGLE_MAPS_API_KEY
FIREBASE_SERVICE_ACCOUNT_PATH
VERTEX_AI_LOCATION=us-central1
MEM0_API_KEY
BACKEND_CORS_ORIGINS
CHROMA_PERSIST_DIR=./chroma_db
```

Access in backend: `from config import get_settings; settings = get_settings()`

---

## 🔄 LangGraph Node Contract

When adding a new agent node to `orchestrator.py`:

```python
# 1. Node function signature — always takes/returns IssueState
async def my_agent_node(state: IssueState) -> IssueState:
    # 2. Read from state fields (never from Firestore directly here)
    issue_id = state["issue_id"]
    category = state.get("category")
    
    # 3. Call your agent logic
    result = await my_agent_logic(state)
    
    # 4. Return updated state dict (merge pattern)
    return {**state, "my_field": result}

# 5. Register node in build_graph()
workflow.add_node("my_agent", my_agent_node)

# 6. Add edge or conditional edge
workflow.add_edge("previous_node", "my_agent")
```

---

## 🚨 Common Mistakes to Avoid

| ❌ Don't | ✅ Do Instead |
|---------|--------------|
| `db.update({"status": "resolved"})` directly | `apply_transition_to_firestore(db, id, from, to, actor)` |
| `import os; os.environ["KEY"]` | `from services.secret_manager import get_secret; get_secret("KEY")` |
| `build_query_engine()` called multiple times | It's `lru_cache`'d — call freely, returns singleton |
| Hardcode `"#6C63FF"` in JSX | `style={{ color: 'var(--primary)' }}` |
| `fetch('/api/issues')` in components | Use `useIssueStore()` Firestore subscription |
| Skip validation in routes | All request bodies use Pydantic models from `api/models.py` |
| Add new Firestore writes without security rules | Update `firestore.rules` for every new collection |

---

## 📊 Evaluation Criteria Alignment

When adding features, always consider which criteria they serve:

| Criterion (Weight) | Key Evidence in Code |
|---|---|
| Problem Solving 20% | State machine FSM, SLA deadlines, dept routing, HITL accountability |
| Agentic Depth 20% | Judge node self-correction loop, Pub/Sub decoupling, HITL bridge, 6-node graph |
| Innovation 20% | PixelRAG visual dedup, Gemini predictive insights, 7-tier gamification |
| Google Tech 15% | Gemini Vision, Vertex AI embeddings, Firebase suite, Cloud Run, Pub/Sub, Secret Manager |
| Design 10% | Dark glassmorphism, CSS animation system, Leaflet map, PWA install |
| Implementation 10% | TypedDict state, Pydantic validation, Firestore security rules, chunk splitting |
| Completeness 5% | 10 pages, E2E flow, health check, error boundary, 404 |

---

## 🚀 Quick Commands

```bash
# Frontend dev
cd frontend && npm run dev

# Backend dev  
cd backend && python main.py

# Seed civic docs into ChromaDB (run once)
cd backend && python scripts/ingest_docs.py

# Production build (frontend)
cd frontend && npm run build

# Deploy frontend
firebase deploy --only hosting

# Deploy backend
gcloud builds submit --config cloudbuild.yaml

# Deploy Firestore rules
firebase deploy --only firestore:rules
```
