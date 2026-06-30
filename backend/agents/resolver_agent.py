"""
Resolver Agent — RAG-based Routing + Ticket Generation + Govt Portal Submission

Uses LlamaIndex + ChromaDB RAG to:
1. Look up the correct department from civic knowledge base
2. Determine SLA based on category + severity
3. Generate a formal complaint ticket with Gemini text
4. Update Firestore with assignment
5. (Optional) Auto-submit to govt portal via Browser Use
"""
import logging
import uuid
from datetime import datetime, timedelta
from config import get_settings
from services.firestore_client import get_firestore_client

logger = logging.getLogger(__name__)
settings = get_settings()

# Fallback department routing if RAG is unavailable
CATEGORY_DEPT_MAP = {
    "pothole": {"dept": "PWD", "dept_full": "Public Works Department", "sla_hours": 72},
    "streetlight": {"dept": "BESCOM", "dept_full": "Electricity Supply Company", "sla_hours": 48},
    "water_leak": {"dept": "BWSSB", "dept_full": "Water Supply & Sewerage Board", "sla_hours": 24},
    "garbage": {"dept": "BBMP_SWM", "dept_full": "Solid Waste Management", "sla_hours": 24},
    "graffiti": {"dept": "BBMP_CIVIL", "dept_full": "Civil Engineering Division", "sla_hours": 168},
    "road_damage": {"dept": "PWD", "dept_full": "Public Works Department", "sla_hours": 96},
    "drainage": {"dept": "BWSSB", "dept_full": "Water Supply & Sewerage Board", "sla_hours": 48},
    "tree_hazard": {"dept": "BBMP_HORT", "dept_full": "Horticulture Department", "sla_hours": 24},
    "encroachment": {"dept": "BBMP_ENGG", "dept_full": "Engineering Department", "sla_hours": 120},
    "other": {"dept": "BBMP_GENERAL", "dept_full": "General Administration", "sla_hours": 120},
}

TICKET_PROMPT = """
Generate a formal civic complaint ticket based on the following AI-analyzed issue report.
The ticket should be professional, concise, and suitable for official government correspondence.

Issue Details:
- Ticket ID: {ticket_id}
- Category: {category}
- Severity: {severity}/5
- Location: {address}
- Coordinates: {lat}, {lng}
- Department: {dept_full}
- AI Description: {ai_description}
- Additional Context: {mem0_context}
- Reported: {reported_at}

Write a formal complaint in 3 paragraphs:
1. Opening: formal address to the department with issue summary
2. Details: specific description of the problem, its location, and public impact
3. Request: specific action requested with urgency based on severity, and SLA expectation

Keep it under 200 words. Be specific and professional.
"""


async def query_rag_for_routing(category: str, description: str) -> dict | None:
    """
    Use LlamaIndex + ChromaDB to look up department routing from civic knowledge base.
    Returns routing info dict or None if RAG is unavailable.
    """
    try:
        from services.rag_pipeline import query_civic_rag
        result = await query_civic_rag(
            query=f"{category} issue: {description}",
            top_k=3
        )
        return result
    except Exception as e:
        logger.warning(f"[RESOLVER] RAG unavailable: {e}. Using fallback routing.")
        return None


async def generate_ticket_text(state: dict, dept_info: dict, ticket_id: str) -> str:
    """Generate formal complaint ticket text using Gemini."""
    import google.generativeai as genai

    genai.configure(api_key=settings.gemini_api_key)

    prompt = TICKET_PROMPT.format(
        ticket_id=ticket_id,
        category=state.get("category", "unknown"),
        severity=state.get("severity", 1),
        address=state.get("geo_address", f"{state['lat']}, {state['lng']}"),
        lat=state["lat"],
        lng=state["lng"],
        dept_full=dept_info.get("dept_full", "Municipal Corporation"),
        ai_description=state.get("ai_description", "Infrastructure damage reported."),
        mem0_context=state.get("mem0_context") or "No prior history at this location.",
        reported_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    )

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        logger.error(f"[RESOLVER] Ticket generation failed: {e}")
        category = state.get("category", "issue")
        return (
            f"Formal complaint regarding {category} at {state.get('geo_address')}. "
            f"Severity level {state.get('severity')}/5. "
            f"Immediate attention requested. Ticket ID: {ticket_id}"
        )


async def submit_to_govt_portal(ticket_text: str, dept: str, address: str) -> str | None:
    """
    Use Browser Use agent to autonomously submit the ticket to a government portal.
    Returns the submission URL if successful.
    """
    try:
        from browser_use import Agent as BrowserAgent
        from langchain_google_genai import ChatGoogleGenerativeAI

        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=settings.gemini_api_key
        )

        task = (
            f"Go to the mock civic portal at http://localhost:3001/submit-complaint. "
            f"Fill in the complaint form with: "
            f"Department='{dept}', "
            f"Address='{address}', "
            f"Description='{ticket_text[:500]}'. "
            f"Submit the form and return the confirmation URL or number."
        )

        agent = BrowserAgent(task=task, llm=llm)
        result = await agent.run()
        return str(result)

    except Exception as e:
        logger.warning(f"[RESOLVER] Browser Use submission failed: {e}")
        return None


async def update_firestore_assignment(
    issue_id: str,
    dept: str,
    ticket_id: str,
    ticket_text: str,
    sla_hours: int,
    severity: int,
    auto_escalate: bool,
) -> None:
    """Update Firestore issue document with assignment details."""
    db = get_firestore_client()
    sla_deadline = datetime.utcnow() + timedelta(hours=sla_hours)

    # Apply SLA reduction for auto-escalated issues
    if auto_escalate:
        sla_deadline = datetime.utcnow() + timedelta(hours=max(24, sla_hours // 2))

    try:
        doc_ref = db.collection("issues").document(issue_id)
        doc_ref.update({
            "status": "assigned",
            "assigned_dept": dept,
            "ticket_id": ticket_id,
            "ticket_text": ticket_text,
            "sla_deadline": sla_deadline,
            "auto_escalated": auto_escalate,
            "updated_at": datetime.utcnow(),
        })
        logger.info(f"[RESOLVER] Firestore updated — issue {issue_id} assigned to {dept}")
    except Exception as e:
        logger.error(f"[RESOLVER] Firestore update failed: {e}")


async def run_resolver_agent(state: dict) -> dict:
    """
    Resolver Agent node for LangGraph.
    
    1. RAG lookup for department routing
    2. Generate formal complaint ticket
    3. Update Firestore with assignment
    4. Optionally submit to govt portal via Browser Use
    """
    logger.info(f"[RESOLVER] Resolving issue {state['issue_id']}")

    category = state.get("category", "other")
    severity = state.get("severity", 1)
    auto_escalate = state.get("auto_escalate", False)

    # ── Step 1: Determine department routing ─────────────────────
    rag_result = await query_rag_for_routing(category, state.get("ai_description", ""))
    
    if rag_result and rag_result.get("dept"):
        dept_info = rag_result
    else:
        dept_info = CATEGORY_DEPT_MAP.get(category, CATEGORY_DEPT_MAP["other"])

    # SLA reduction for high severity / escalated issues
    base_sla = dept_info.get("sla_hours", 120)
    if severity >= 4:
        sla_hours = max(24, base_sla // 2)
    elif severity >= 3:
        sla_hours = int(base_sla * 0.75)
    else:
        sla_hours = base_sla

    dept = dept_info.get("dept", "BBMP_GENERAL")
    ticket_id = f"CH-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"

    # ── Step 2: Generate complaint ticket ───────────────────────
    ticket_text = await generate_ticket_text(state, dept_info, ticket_id)

    # ── Step 3: Update Firestore ─────────────────────────────────
    await update_firestore_assignment(
        issue_id=state["issue_id"],
        dept=dept,
        ticket_id=ticket_id,
        ticket_text=ticket_text,
        sla_hours=sla_hours,
        severity=severity,
        auto_escalate=auto_escalate,
    )

    # ── Step 4: Browser Use submission (optional) ────────────────
    govt_url = await submit_to_govt_portal(
        ticket_text=ticket_text,
        dept=dept,
        address=state.get("geo_address", "Unknown"),
    )

    logger.info(
        f"[RESOLVER] Complete — dept={dept}, ticket={ticket_id}, "
        f"sla={sla_hours}h, escalated={auto_escalate}"
    )

    return {
        **state,
        "routing_dept": dept,
        "ticket_text": ticket_text,
        "ticket_id": ticket_id,
        "sla_hours": sla_hours,
        "govt_submission_url": govt_url,
        "status": "assigned",
    }
