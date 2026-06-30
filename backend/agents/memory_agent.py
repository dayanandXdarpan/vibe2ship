"""
Memory Agent — Long-term Agent Memory via Mem0

Recalls historical context for the location and user,
enabling the system to:
- Auto-escalate recurring hotspots
- Adjust trust-based routing
- Surface neighborhood history on issue detail pages
"""
import logging
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Threshold: auto-escalate if >= this many past reports at same location
ESCALATION_THRESHOLD = 3
TRUST_SCORE_DEFAULT = 0.5


def get_mem0_client():
    """Initialize Mem0 client (lazy init to avoid startup errors)."""
    try:
        from mem0 import MemoryClient
        return MemoryClient(api_key=settings.mem0_api_key)
    except Exception as e:
        logger.warning(f"[MEMORY] Mem0 unavailable: {e}. Using no-op fallback.")
        return None


def build_location_key(lat: float, lng: float, precision: int = 3) -> str:
    """Create a rounded location key for Mem0 memory grouping."""
    return f"loc_{round(lat, precision)}_{round(lng, precision)}"


async def run_memory_agent(state: dict) -> dict:
    """
    Memory Agent node for LangGraph.
    
    1. Recalls all past reports near this location (via Mem0)
    2. Recalls user trust score and reporting history
    3. Sets auto_escalate = True if location is a recurring hotspot
    4. Stores the new issue context for future recall
    """
    logger.info(f"[MEMORY] Running for issue {state['issue_id']}")

    client = get_mem0_client()
    location_key = build_location_key(state["lat"], state["lng"])
    user_id = state["user_id"]

    location_history_count = 0
    user_trust_score = TRUST_SCORE_DEFAULT
    auto_escalate = False
    mem0_context = None

    # ── Load user trust score from Firestore first ────────────────
    try:
        from services.firestore_client import get_firestore_client
        db = get_firestore_client()
        user_doc = db.collection("users").document(user_id).get()
        if user_doc.exists:
            user_trust_score = user_doc.to_dict().get("trustScore", TRUST_SCORE_DEFAULT)
            logger.info(f"[MEMORY] Loaded user trust score from Firestore: {user_trust_score:.2f}")
    except Exception as e:
        logger.warning(f"[MEMORY] Firestore trust score lookup failed: {e}. Falling back to default.")

    if client:
        try:
            # ── Recall location history ──────────────────────────
            location_memories = client.search(
                query=f"civic issue reported at location {location_key} category {state.get('category', 'unknown')}",
                user_id=f"location_{location_key}",
                limit=10
            )
            location_history_count = len(location_memories.get("results", []))

            if location_history_count >= ESCALATION_THRESHOLD:
                auto_escalate = True
                mem0_context = (
                    f"⚠️ This location has {location_history_count} previous reports. "
                    f"Category: {state.get('category')}. Auto-escalating priority."
                )
                logger.info(f"[MEMORY] Auto-escalate triggered: {location_history_count} past reports")

            # ── Recall user trust history ────────────────────────
            user_memories = client.search(
                query=f"user reporting history trust score",
                user_id=user_id,
                limit=5
            )
            user_results = user_memories.get("results", [])

            # Simple trust scoring: each valid past report = +0.05
            valid_reports = sum(
                1 for m in user_results
                if "valid" in m.get("memory", "").lower() or "resolved" in m.get("memory", "").lower()
            )
            # Only use Mem0 calculation if we didn't get a valid trust score from Firestore
            if user_trust_score == TRUST_SCORE_DEFAULT:
                user_trust_score = min(1.0, TRUST_SCORE_DEFAULT + (valid_reports * 0.05))
                logger.info(f"[MEMORY] Estimated user trust score from Mem0: {user_trust_score:.2f}")

            # ── Store this new issue in memory ───────────────────
            client.add(
                messages=[{
                    "role": "user",
                    "content": (
                        f"New {state.get('category')} issue reported at {location_key}. "
                        f"Severity: {state.get('severity')}. "
                        f"Issue ID: {state['issue_id']}. "
                        f"Status: pending validation."
                    )
                }],
                user_id=f"location_{location_key}"
            )

            # Store user reporting event
            client.add(
                messages=[{
                    "role": "user",
                    "content": f"User {user_id} reported issue {state['issue_id']} ({state.get('category')})."
                }],
                user_id=user_id
            )

        except Exception as e:
            logger.warning(f"[MEMORY] Mem0 operation failed: {e}. Continuing without memory.")

    # If auto-escalating, bump severity
    severity = state.get("severity", 1)
    if auto_escalate and severity < 5:
        severity = min(5, severity + 1)
        logger.info(f"[MEMORY] Severity bumped to {severity} due to recurring hotspot")

    return {
        **state,
        "location_history_count": location_history_count,
        "user_trust_score": user_trust_score,
        "auto_escalate": auto_escalate,
        "mem0_context": mem0_context,
        "severity": severity,
        "status": "memory_complete",
    }
