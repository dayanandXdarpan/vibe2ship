"""
LangGraph Orchestrator — Prastab Multi-Agent System

This is the central state machine that coordinates all agents:
  Reporter Agent → Memory Agent → Validator Agent → Resolver Agent
  
With self-correction loop: low confidence / invalid → back to Reporter
"""
from typing import TypedDict, Optional, Literal
from langgraph.graph import StateGraph, END
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Shared State Schema (passed between all agents)
# ─────────────────────────────────────────────
class IssueState(TypedDict):
    # Input
    issue_id: str
    image_url: str
    lat: float
    lng: float
    user_id: str
    user_description: Optional[str]
    voice_note_b64: Optional[str]    # base64 encoded audio for Gemini transcription
    voice_note_mime: Optional[str]   # audio/webm, audio/mp4, etc.

    # Reporter Agent output
    category: Optional[str]
    severity: Optional[int]          # 1-5
    confidence: Optional[float]      # 0.0-1.0
    ai_description: Optional[str]
    tags: Optional[list[str]]
    suggested_dept: Optional[str]
    retry_count: int
    pii_detected: Optional[bool]
    pii_flagged_details: Optional[str]
    fallback_triage: Optional[bool]

    # Memory Agent output
    location_history_count: int      # past reports at same location
    user_trust_score: float          # 0.0-1.0
    auto_escalate: bool              # true if 3+ past reports at location
    mem0_context: Optional[str]      # recalled memory string

    # Validator Agent output
    validation_result: Optional[Literal["VALID", "DUPLICATE", "INVALID", "SPAM"]]
    duplicate_of: Optional[str]      # issue_id of duplicate
    geo_verified: bool
    geo_address: Optional[str]
    semantic_flag: Optional[bool]          # Semantic location-category mismatch
    semantic_flag_reason: Optional[str]    # Reason for semantic flag


    # Judge Agent output
    judge_quality_score: Optional[float]   # 0.0-1.0
    judge_critique: Optional[str]          # critique feedback
    judge_critique_count: int              # loop counter
    judge_passes: Optional[bool]
    judge_requires_hitl: Optional[bool]
    judge_hitl_reason: Optional[str]
    judge_action: Optional[str]            # PROCEED | HITL | REQUEST_CLARIFICATION | ESCALATE

    # Resolver Agent output
    routing_dept: Optional[str]
    ticket_text: Optional[str]
    ticket_id: Optional[str]
    govt_submission_url: Optional[str]
    sla_hours: Optional[int]

    # Scoring Engine output
    urgency_weight: Optional[float]  # 0.0–1.0 composite score

    # Orchestrator control
    status: str
    needs_clarification: bool
    clarification_message: Optional[str]
    error: Optional[str]


# ─────────────────────────────────────────────
# Routing Functions
# ─────────────────────────────────────────────
def route_after_report(state: IssueState) -> str:
    """Route based on reporter agent confidence."""
    if state.get("fallback_triage"):
        logger.info("[ORCHESTRATOR] Fallback triage triggered → route directly to HITL")
        return "fallback_triage"

    confidence = state.get("confidence", 0.0)
    retry_count = state.get("retry_count", 0)
    settings_high = 0.80
    settings_low = 0.65

    if confidence >= settings_high:
        logger.info(f"[ORCHESTRATOR] High confidence {confidence:.2f} → proceed to memory")
        return "proceed"
    elif confidence >= settings_low and retry_count < 2:
        logger.info(f"[ORCHESTRATOR] Medium confidence {confidence:.2f} → proceed with flag")
        return "proceed_flagged"
    elif retry_count >= 3:
        logger.warning("[ORCHESTRATOR] Max retries reached → force proceed with low confidence")
        return "proceed_flagged"
    else:
        logger.info(f"[ORCHESTRATOR] Low confidence {confidence:.2f} → request clarification")
        return "needs_clarification"


def route_after_validation(state: IssueState) -> str:
    """Route based on validator agent outcome."""
    result = state.get("validation_result")
    logger.info(f"[ORCHESTRATOR] Validation result: {result}")

    if result == "VALID":
        return "VALID"
    elif result == "DUPLICATE":
        return "DUPLICATE"
    else:
        return "INVALID"


def route_after_judge(state: IssueState) -> str:
    """Route based on Judge Agent decision."""
    action = state.get("judge_action", "PROCEED")
    logger.info(f"[ORCHESTRATOR] Judge action: {action}")

    if action == "HITL":
        return "HITL"
    elif action == "REQUEST_CLARIFICATION":
        return "retry"
    elif action in ("ESCALATE", "REJECT"):
        return "escalate"
    else:
        return "PROCEED"


# ─────────────────────────────────────────────
# Import Agents (lazy to avoid circular imports)
# ─────────────────────────────────────────────
def build_graph():
    from agents.reporter_agent import run_reporter_agent
    from agents.memory_agent import run_memory_agent
    from agents.validator_agent import run_validator_agent
    from agents.judge_agent import run_judge_agent
    from agents.resolver_agent import run_resolver_agent

    def clarification_request(state: IssueState) -> IssueState:
        retry = state.get("retry_count", 0)
        msg = (
            "Our AI couldn't confidently analyze this image. "
            "Please upload a clearer photo or add more description."
            if retry == 0
            else "Please try a different angle showing the issue clearly."
        )
        logger.info(f"[ORCHESTRATOR] Clarification requested (retry {retry + 1})")
        return {**state, "retry_count": retry + 1, "needs_clarification": True,
                "clarification_message": msg, "status": "needs_clarification"}

    def handle_duplicate(state: IssueState) -> IssueState:
        """Credit reporter for spotting a real issue even if duplicate."""
        import asyncio
        try:
            from services.scoring_engine import update_user_credibility
            from services.firestore_client import get_firestore_client
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    update_user_credibility(state["user_id"], "DUPLICATE", db=get_firestore_client())
                )
            finally:
                loop.close()
        except Exception as e:
            logger.warning(f"Credibility update (duplicate) failed: {e}")
        logger.info(f"[ORCHESTRATOR] Duplicate of {state.get('duplicate_of')}")
        return {**state, "status": "duplicate_found", "needs_clarification": False}

    def flag_and_proceed(state: IssueState) -> IssueState:
        return {**state, "status": "flagged_for_review", "needs_clarification": False}

    def handle_hitl(state: IssueState) -> IssueState:
        """Mark issue as IN_REVIEW for human verifier action."""
        import asyncio
        from services.pubsub_service import publish_hitl_required
        try:
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    publish_hitl_required(
                        issue_id=state["issue_id"],
                        reason=state.get("judge_hitl_reason", "Manual review required"),
                        severity=state.get("severity", 1),
                        confidence=state.get("confidence", 0),
                    )
                )
            finally:
                loop.close()
        except Exception as e:
            logger.warning(f"Pub/Sub HITL publish failed: {e}")
        return {**state, "status": "in_review", "needs_clarification": False}

    def handle_escalate(state: IssueState) -> IssueState:
        return {**state, "status": "escalated", "needs_clarification": False}

    # ── Build StateGraph ──────────────────────────────────────────
    workflow = StateGraph(IssueState)

    workflow.add_node("reporter_agent", run_reporter_agent)
    workflow.add_node("memory_agent", run_memory_agent)
    workflow.add_node("validator_agent", run_validator_agent)
    workflow.add_node("judge_agent", run_judge_agent)        # NEW
    workflow.add_node("resolver_agent", run_resolver_agent)
    workflow.add_node("clarification_request", clarification_request)
    workflow.add_node("flag_and_proceed", flag_and_proceed)
    workflow.add_node("mark_duplicate", handle_duplicate)
    workflow.add_node("handle_hitl", handle_hitl)            # NEW
    workflow.add_node("handle_escalate", handle_escalate)    # NEW

    workflow.set_entry_point("reporter_agent")

    # Reporter confidence routing
    workflow.add_conditional_edges("reporter_agent", route_after_report, {
        "proceed": "memory_agent",
        "proceed_flagged": "flag_and_proceed",
        "needs_clarification": "clarification_request",
        "fallback_triage": "handle_hitl",
    })
    workflow.add_edge("flag_and_proceed", "memory_agent")
    workflow.add_edge("clarification_request", END)
    workflow.add_edge("memory_agent", "validator_agent")

    # Validator routing
    workflow.add_conditional_edges("validator_agent", route_after_validation, {
        "VALID": "judge_agent",     # → Judge before Resolver
        "DUPLICATE": "mark_duplicate",
        "INVALID": "clarification_request",
    })

    # Judge routing (NEW — Review & Critique pattern)
    workflow.add_conditional_edges("judge_agent", route_after_judge, {
        "PROCEED": "resolver_agent",
        "HITL": "handle_hitl",
        "retry": "clarification_request",
        "escalate": "handle_escalate",
    })

    workflow.add_edge("resolver_agent", END)
    workflow.add_edge("mark_duplicate", END)
    workflow.add_edge("handle_hitl", END)      # Wait for HITL webhook
    workflow.add_edge("handle_escalate", END)

    return workflow.compile()


# Compiled graph instance
_graph = None

def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_issue_pipeline(initial_state: dict) -> IssueState:
    """
    Entry point to run the full LangGraph multi-agent pipeline.
    
    Args:
        initial_state: dict with issue_id, image_url, lat, lng, user_id, user_description
    
    Returns:
        Final IssueState after all agents complete
    """
    state: IssueState = {
        "issue_id": initial_state["issue_id"],
        "image_url": initial_state["image_url"],
        "lat": initial_state["lat"],
        "lng": initial_state["lng"],
        "user_id": initial_state["user_id"],
        "user_description": initial_state.get("user_description"),
        "voice_note_b64": initial_state.get("voice_note_b64"),
        "voice_note_mime": initial_state.get("voice_note_mime", "audio/webm"),
        "category": None,
        "severity": None,
        "confidence": None,
        "ai_description": None,
        "tags": None,
        "suggested_dept": None,
        "retry_count": 0,
        "pii_detected": False,
        "pii_flagged_details": None,
        "fallback_triage": False,
        "location_history_count": 0,
        "user_trust_score": 0.5,
        "auto_escalate": False,
        "mem0_context": None,
        "validation_result": None,
        "duplicate_of": None,
        "geo_verified": False,
        "geo_address": None,
        "semantic_flag": False,
        "semantic_flag_reason": None,
        "judge_quality_score": None,
        "judge_critique": None,
        "judge_critique_count": 0,
        "judge_passes": None,
        "judge_requires_hitl": None,
        "judge_hitl_reason": None,
        "judge_action": None,
        "routing_dept": None,
        "ticket_text": None,
        "ticket_id": None,
        "govt_submission_url": None,
        "sla_hours": None,
        "urgency_weight": None,
        "status": "processing",
        "needs_clarification": False,
        "clarification_message": None,
        "error": None,
    }

    graph = get_graph()
    result = await graph.ainvoke(state)
    return result
