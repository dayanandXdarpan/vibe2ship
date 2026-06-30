"""
Judge Agent — Review & Critique Pattern

Implements the "Judge" that independently evaluates the Reporter + Validator
agent outputs for quality before advancing the pipeline.

Pattern:
  Reporter produces output → Judge evaluates quality score
  If score < threshold → loop back with critique (max 3 loops)
  If score ≥ threshold → advance to Resolver

Also provides HITL (Human-in-the-Loop) bridge:
  High-severity or low-confidence issues → flagged for human verifier
  Verifier approves/rejects → state machine transitions accordingly
"""
import logging
import json
from datetime import datetime
from config import get_settings
from services.state_machine import IssueStatus, apply_transition_to_firestore

logger = logging.getLogger(__name__)
settings = get_settings()

# Quality thresholds
QUALITY_PASS_THRESHOLD = 0.70   # Judge score needed to proceed
MAX_CRITIQUE_LOOPS = 3
HITL_SEVERITY_THRESHOLD = 4     # Severity ≥ 4 → mandatory human review
HITL_CONFIDENCE_THRESHOLD = 0.72  # Confidence < 0.72 → flag for human review


JUDGE_PROMPT = """
You are a Quality Judge for a civic issue reporting platform.

You must evaluate the quality of this AI-generated issue analysis and return a structured assessment.

REPORTER AGENT OUTPUT:
- Category: {category}
- Severity: {severity}/5
- Confidence: {confidence}
- Description: {ai_description}
- Tags: {tags}
- Safety Risk: {safety_risk}

VALIDATOR AGENT OUTPUT:
- Validation Result: {validation_result}
- Geo Verified: {geo_verified}
- Address: {geo_address}
- Visual Duplicate Check: {duplicate_result}

USER DESCRIPTION: {user_description}

Evaluate the following criteria and return ONLY valid JSON:
{{
  "quality_score": <float 0.0-1.0>,
  "category_confidence": <float 0.0-1.0>,
  "description_quality": <float 0.0-1.0>,
  "location_confidence": <float 0.0-1.0>,
  "passes": <boolean>,
  "critique": "<specific actionable feedback if passes=false, else empty string>",
  "requires_hitl": <boolean, true if this needs human review>,
  "hitl_reason": "<reason for human review if requires_hitl=true>",
  "recommended_action": "<PROCEED | REQUEST_CLARIFICATION | ESCALATE | REJECT>"
}}

Be strict but fair. The system serves real civic needs.
"""


async def run_judge_agent(state: dict) -> dict:
    """
    Judge Agent node for LangGraph.
    
    Evaluates combined Reporter + Validator output quality.
    Routes to:
    - PROCEED → advance to Resolver
    - REQUEST_CLARIFICATION → loop back to Reporter
    - HITL → flag for human review (IN_REVIEW status)
    - ESCALATE → send to senior authority
    - REJECT → mark as invalid
    """
    logger.info(f"[JUDGE] Evaluating quality for issue {state['issue_id']}")

    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)

    prompt = JUDGE_PROMPT.format(
        category=state.get("category", "unknown"),
        severity=state.get("severity", 0),
        confidence=state.get("confidence", 0),
        ai_description=state.get("ai_description", ""),
        tags=state.get("tags", []),
        safety_risk=False,
        validation_result=state.get("validation_result", "unknown"),
        geo_verified=state.get("geo_verified", False),
        geo_address=state.get("geo_address", "unknown"),
        duplicate_result=state.get("duplicate_of") or "no duplicate",
        user_description=state.get("user_description") or "not provided",
    )

    assessment = {}
    try:
        model = genai.GenerativeModel(
            "gemini-1.5-flash",
            generation_config={"response_mime_type": "application/json"}
        )
        response = model.generate_content(prompt)
        assessment = json.loads(response.text)
        logger.info(f"[JUDGE] Score: {assessment.get('quality_score'):.2f}, passes: {assessment.get('passes')}")
    except Exception as e:
        logger.error(f"[JUDGE] Gemini structured output failed: {e}")
        # Fallback: pass if confidence is reasonable
        confidence = state.get("confidence", 0)
        assessment = {
            "quality_score": confidence,
            "passes": confidence >= settings.confidence_high_threshold,
            "critique": "",
            "requires_hitl": False,
            "recommended_action": "PROCEED" if confidence >= 0.65 else "REQUEST_CLARIFICATION",
        }

    quality_score = assessment.get("quality_score", 0)
    passes = assessment.get("passes", False)
    requires_hitl = assessment.get("requires_hitl", False)
    recommended_action = assessment.get("recommended_action", "PROCEED")

    # Force HITL for high severity / low AI confidence regardless of Judge score
    severity = state.get("severity", 1)
    confidence = state.get("confidence", 0)
    
    if severity >= HITL_SEVERITY_THRESHOLD and not requires_hitl:
        requires_hitl = True
        assessment["hitl_reason"] = f"High severity issue (severity={severity}) requires human verification"
        assessment["requires_hitl"] = True

    if confidence < HITL_CONFIDENCE_THRESHOLD and not requires_hitl and passes:
        requires_hitl = True
        assessment["hitl_reason"] = f"AI confidence ({confidence:.0%}) below HITL threshold — human review required"
        assessment["requires_hitl"] = True

    critique_count = state.get("judge_critique_count", 0)

    if not passes and critique_count < MAX_CRITIQUE_LOOPS:
        # Loop back — pass critique to Reporter for retry
        logger.info(f"[JUDGE] Quality fail (critique #{critique_count + 1}): {assessment.get('critique')}")
        return {
            **state,
            "judge_quality_score": quality_score,
            "judge_critique": assessment.get("critique", ""),
            "judge_critique_count": critique_count + 1,
            "judge_action": "REQUEST_CLARIFICATION",
            "needs_clarification": True,
            "clarification_message": assessment.get("critique"),
            "status": "judge_retry",
        }

    return {
        **state,
        "judge_quality_score": quality_score,
        "judge_critique": assessment.get("critique", ""),
        "judge_critique_count": critique_count,
        "judge_passes": passes or critique_count >= MAX_CRITIQUE_LOOPS,  # Force pass after max retries
        "judge_requires_hitl": requires_hitl,
        "judge_hitl_reason": assessment.get("hitl_reason", ""),
        "judge_action": "HITL" if requires_hitl else recommended_action,
        "status": "in_review" if requires_hitl else "judge_passed",
    }


# ─────────────────────────────────────────────
# HITL API Handlers (called by FastAPI routes)
# ─────────────────────────────────────────────

async def hitl_approve(
    db,
    issue_id: str,
    reviewer_id: str,
    notes: str = "",
) -> dict:
    """
    Human reviewer approves the AI validation.
    Transitions: IN_REVIEW → VALIDATED
    """
    issue_doc = db.collection("issues").document(issue_id).get()
    if not issue_doc.exists:
        raise ValueError(f"Issue {issue_id} not found")

    issue = issue_doc.to_dict()
    current_status = IssueStatus(issue.get("status", "in_review"))

    audit = await apply_transition_to_firestore(
        db=db,
        issue_id=issue_id,
        from_status=current_status,
        to_status=IssueStatus.VALIDATED,
        actor=reviewer_id,
        reason=f"HITL approved by {reviewer_id}. Notes: {notes}",
        extra_fields={
            "hitl_approved_by": reviewer_id,
            "hitl_approved_at": datetime.utcnow(),
            "hitl_notes": notes,
        }
    )

    # Notify citizen
    db.collection("notifications").add({
        "user_id": issue.get("user_id"),
        "type": "hitl_approved",
        "title": "✅ Your report was verified!",
        "body": "A community verifier approved your issue report. It's now being routed to the right authority.",
        "issue_id": issue_id,
        "read": False,
        "created_at": datetime.utcnow(),
    })

    logger.info(f"[HITL] Issue {issue_id} approved by {reviewer_id}")
    return {"success": True, "new_status": "validated", "audit": audit}


async def hitl_reject(
    db,
    issue_id: str,
    reviewer_id: str,
    reason: str,
    escalate: bool = False,
) -> dict:
    """
    Human reviewer rejects / escalates the AI validation.
    Transitions: IN_REVIEW → ESCALATED or REJECTED
    """
    issue_doc = db.collection("issues").document(issue_id).get()
    if not issue_doc.exists:
        raise ValueError(f"Issue {issue_id} not found")

    issue = issue_doc.to_dict()
    current_status = IssueStatus(issue.get("status", "in_review"))
    to_status = IssueStatus.ESCALATED if escalate else IssueStatus.REJECTED

    audit = await apply_transition_to_firestore(
        db=db,
        issue_id=issue_id,
        from_status=current_status,
        to_status=to_status,
        actor=reviewer_id,
        reason=f"HITL rejected by {reviewer_id}: {reason}",
        extra_fields={
            "hitl_rejected_by": reviewer_id,
            "hitl_rejected_at": datetime.utcnow(),
            "hitl_rejection_reason": reason,
        }
    )

    # Notify citizen
    db.collection("notifications").add({
        "user_id": issue.get("user_id"),
        "type": "hitl_rejected",
        "title": "ℹ️ Report needs more information",
        "body": f"Your report needs clarification: {reason}",
        "issue_id": issue_id,
        "read": False,
        "created_at": datetime.utcnow(),
    })

    logger.info(f"[HITL] Issue {issue_id} rejected by {reviewer_id}: {reason}")
    return {"success": True, "new_status": to_status.value, "audit": audit}
