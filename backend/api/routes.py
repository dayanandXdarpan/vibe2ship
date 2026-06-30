"""
FastAPI Routes — Prastab Backend API

All routes trigger the LangGraph multi-agent pipeline
and return structured responses to the React frontend.
"""
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from firebase_admin import firestore as fs_module
import logging
import uuid
from datetime import datetime
from typing import Optional

from config import get_settings
from api.models import (
    ReportIssueRequest, ReportIssueResponse,
    IssueStatusResponse, InsightResponse,
    ResolveIssueRequest, HealthResponse,
    HITLApproveRequest, HITLRejectRequest,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# ─────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────
app = FastAPI(
    title="Prastab API",
    description="Multi-agent civic issue resolution platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend dev server + Firebase Hosting
origins = settings.backend_cors_origins.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# In-memory job tracker (replace with Firestore in prod)
# ─────────────────────────────────────────────
pipeline_jobs: dict[str, dict] = {}


# ─────────────────────────────────────────────
# Rate Limiting Guardrails
# ─────────────────────────────────────────────
from datetime import datetime, timedelta

# In-memory IP rate limiter for IP-based spam prevention
ip_rate_limits: dict[str, list[datetime]] = {}

async def check_rate_limit(request: Request, user_id: str = Form(...)):
    # 1. User ID rate limiting (Firestore backed)
    from services.firestore_client import get_firestore_client
    db = get_firestore_client()
    
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    
    try:
        # Query issues count for this user in the last hour
        recent_issues = db.collection("issues") \
            .where("user_id", "==", user_id) \
            .where("created_at", ">=", one_hour_ago) \
            .stream()
        
        user_report_count = len(list(recent_issues))
        if user_report_count >= 5:
            logger.warning(f"[RATE_LIMIT] Limit exceeded for user_id={user_id}")
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded: Maximum 5 reports per hour. Please try again later."
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[RATE_LIMIT] Failed to check Firestore rate limit: {e}")
        pass

    # 2. IP rate limiting (In-memory fallback)
    ip = request.client.host if request.client else "unknown"
    if ip != "unknown":
        now = datetime.utcnow()
        timestamps = ip_rate_limits.get(ip, [])
        timestamps = [t for t in timestamps if now - t < timedelta(hours=1)]
        
        if len(timestamps) >= 5:
            logger.warning(f"[RATE_LIMIT] Limit exceeded for IP={ip}")
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded: Maximum 5 reports per hour from this IP address."
            )
        
        timestamps.append(now)
        ip_rate_limits[ip] = timestamps


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check endpoint for Cloud Run and frontend — checks all service integrations."""
    checks = {"api": "ok", "firestore": "unknown", "gemini": "unknown"}
    try:
        from services.firestore_client import get_firestore_client
        db = get_firestore_client()
        list(db.collection("_health").limit(1).stream())
        checks["firestore"] = "ok"
    except Exception as e:
        checks["firestore"] = f"error: {str(e)[:50]}"
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)
        checks["gemini"] = "ok"
    except Exception as e:
        checks["gemini"] = f"error: {str(e)[:50]}"
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": checks,
        "jobs_in_memory": len(pipeline_jobs),
    }


@app.post("/report", response_model=ReportIssueResponse)
async def report_issue(
    request: Request,
    background_tasks: BackgroundTasks,
    issue_id: str = Form(...),
    image_url: str = Form(...),
    lat: float = Form(...),
    lng: float = Form(...),
    user_id: str = Form(...),
    user_description: Optional[str] = Form(None),
    voice_note_b64: Optional[str] = Form(None),    # base64 audio blob from MediaRecorder
    voice_note_mime: Optional[str] = Form(None),   # e.g. "audio/webm;codecs=opus"
    rate_limit: None = Depends(check_rate_limit)
):
    """
    Trigger the LangGraph multi-agent pipeline for a new issue report.
    Accepts an optional voice note (base64) in Hindi/Marathi/Tamil/English.
    
    Runs agents asynchronously in background.
    Poll /issues/{issue_id}/status for real-time progress.
    """
    # ── Initialize Issue Document in Firestore ────────────────
    # Enforces creation using UUID as doc ID before agent pipeline starts
    try:
        from services.firestore_client import get_firestore_client
        db = get_firestore_client()
        db.collection("issues").document(issue_id).set({
            "id": issue_id,
            "user_id": user_id,
            "image_url": image_url,
            "lat": lat,
            "lng": lng,
            "user_description": user_description or "",
            "status": "triage",
            "upvotes": 0,
            "verified_count": 0,
            "comment_count": 0,
            "pii_detected": False,
            "pii_flagged_details": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "audit_trail": [{
                "from_status": "draft",
                "to_status": "triage",
                "actor": user_id,
                "reason": "Issue report submitted by user.",
                "timestamp": datetime.utcnow().isoformat(),
            }]
        })
        logger.info(f"[API] Initialized Firestore document for issue {issue_id}")
    except Exception as e:
        logger.error(f"[API] Failed to initialize Firestore document for {issue_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database initialization failed: {str(e)}"
        )

    pipeline_jobs[issue_id] = {
        "status": "queued",
        "started_at": datetime.utcnow().isoformat(),
        "result": None
    }

    async def run_pipeline():
        from agents.orchestrator import run_issue_pipeline
        from services.pubsub_service import publish_issue_submitted, publish_reporter_complete
        from services.state_machine import IssueStatus, apply_transition_to_firestore
        from services.firestore_client import get_firestore_client
        try:
            pipeline_jobs[issue_id]["status"] = "processing"

            # Pub/Sub: announce new submission
            await publish_issue_submitted(issue_id, user_id, image_url, lat, lng)

            result = await run_issue_pipeline({
                "issue_id": issue_id,
                "image_url": image_url,
                "lat": lat,
                "lng": lng,
                "user_id": user_id,
                "user_description": user_description,
                "voice_note_b64": voice_note_b64,
                "voice_note_mime": voice_note_mime or "audio/webm",
            })

            # Pub/Sub: reporter complete event
            if result.get("category"):
                await publish_reporter_complete(
                    issue_id, result["category"],
                    result.get("severity", 1), result.get("confidence", 0)
                )

            pipeline_jobs[issue_id]["status"] = result.get("status", "complete")
            pipeline_jobs[issue_id]["result"] = {
                "category": result.get("category"),
                "severity": result.get("severity"),
                "confidence": result.get("confidence"),
                "ai_description": result.get("ai_description"),
                "tags": result.get("tags", []),
                "geo_address": result.get("geo_address"),
                "validation_result": result.get("validation_result"),
                "duplicate_of": result.get("duplicate_of"),
                "routing_dept": result.get("routing_dept"),
                "ticket_id": result.get("ticket_id"),
                "sla_hours": result.get("sla_hours"),
                "auto_escalate": result.get("auto_escalate"),
                "needs_clarification": result.get("needs_clarification"),
                "clarification_message": result.get("clarification_message"),
                "mem0_context": result.get("mem0_context"),
                "judge_quality_score": result.get("judge_quality_score"),
                "judge_requires_hitl": result.get("judge_requires_hitl"),
                "judge_hitl_reason": result.get("judge_hitl_reason"),
            }

            # Save the final result to Firestore so it is persistent and visible in feed/detail pages!
            db = get_firestore_client()
            issue_ref = db.collection("issues").document(issue_id)
            
            final_status = result.get("status", "complete")
            
            update_data = {
                "status": final_status,
                "category": result.get("category"),
                "severity": result.get("severity"),
                "ai_confidence": result.get("confidence"),
                "ai_description": result.get("ai_description"),
                "tags": result.get("tags", []),
                "geo_address": result.get("geo_address"),
                "validation_result": result.get("validation_result"),
                "duplicate_of": result.get("duplicate_of"),
                "assigned_dept": result.get("routing_dept"),
                "ticket_id": result.get("ticket_id"),
                "sla_hours": result.get("sla_hours"),
                "auto_escalated": result.get("auto_escalate", False),
                "needs_clarification": result.get("needs_clarification", False),
                "clarification_message": result.get("clarification_message"),
                "mem0_context": result.get("mem0_context"),
                "judge_quality_score": result.get("judge_quality_score"),
                "judge_requires_hitl": result.get("judge_requires_hitl", False),
                "judge_hitl_reason": result.get("judge_hitl_reason"),
                "pii_detected": result.get("pii_detected", False),
                "pii_flagged_details": result.get("pii_flagged_details"),
                "updated_at": datetime.utcnow(),
            }
            
            try:
                await apply_transition_to_firestore(
                    db=db,
                    issue_id=issue_id,
                    from_status=IssueStatus.TRIAGE,
                    to_status=IssueStatus(final_status),
                    actor="agent_pipeline",
                    reason=f"Agent pipeline finished with outcome: {final_status}",
                    extra_fields={k: v for k, v in update_data.items() if k not in ("status", "audit_trail") and v is not None}
                )
            except Exception as e:
                logger.warning(f"[API] State machine transition failed: {e}. Performing direct update.")
                issue_ref.update({k: v for k, v in update_data.items() if v is not None})

            # Award XP to reporter (points + monthly_points)
            XP_REPORT = 10
            try:
                user_ref = db.collection("users").document(user_id)
                from google.cloud.firestore_v1 import Increment
                user_ref.update({
                    "points": Increment(XP_REPORT),
                    "monthly_points": Increment(XP_REPORT),
                    "reportCount": Increment(1),
                    "updatedAt": datetime.utcnow(),
                })
                logger.info(f"[API] Awarded {XP_REPORT} XP (points + monthly_points) to {user_id}")
            except Exception as xp_e:
                logger.warning(f"[API] XP award failed: {xp_e}")

            # Auto-trigger neighbor notification for high-severity issues
            severity = result.get("severity", 1) or 1
            if severity >= 3 and final_status not in ("duplicate_found", "spam_suspected", "reporter_error"):
                try:
                    from firebase_admin import messaging
                    import math
                    # Bounding box query for nearby users
                    RADIUS_M = 500
                    lat_off = RADIUS_M / 111000
                    lng_off = RADIUS_M / (111000 * math.cos(math.radians(lat)))
                    nearby_users = db.collection("users").where("trustScore", ">=", 0.3).limit(80).stream()
                    tokens = []
                    notify_uids = []
                    for u in nearby_users:
                        ud = u.to_dict()
                        u_lat = ud.get("lastLat") or 0
                        u_lng = ud.get("lastLng") or 0
                        if u_lat == 0 or abs(u_lat - lat) > lat_off or abs(u_lng - lng) > lng_off:
                            continue
                        for tok in (ud.get("fcm_tokens") or []):
                            if tok:
                                tokens.append(tok)
                        notify_uids.append(u.id)
                    if tokens:
                        sev_emoji = {5: "🚨", 4: "🔴", 3: "🟡"}.get(severity, "📍")
                        category_label = (result.get("category") or "issue").replace("_", " ").title()
                        msg = messaging.MulticastMessage(
                            tokens=tokens[:500],
                            notification=messaging.Notification(
                                title=f"{sev_emoji} {category_label} Reported Nearby",
                                body=f"Tap to confirm and earn XP! #{issue_id[:8]}",
                            ),
                            data={"issue_id": issue_id, "type": "neighbor_alert"},
                        )
                        messaging.send_each_for_multicast(msg)
                        logger.info(f"[API] Auto-notified {len(tokens)} nearby devices for issue {issue_id}")
                except Exception as notif_e:
                    logger.warning(f"[API] Auto neighbor notify failed (non-critical): {notif_e}")


        except Exception as e:
            logger.error(f"Pipeline error for {issue_id}: {e}")
            pipeline_jobs[issue_id]["status"] = "error"
            pipeline_jobs[issue_id]["error"] = str(e)
            
            # Update Firestore with error status
            try:
                db = get_firestore_client()
                db.collection("issues").document(issue_id).update({
                    "status": "rejected",
                    "error": str(e),
                    "updated_at": datetime.utcnow()
                })
            except Exception:
                pass

    background_tasks.add_task(run_pipeline)

    return ReportIssueResponse(
        issue_id=issue_id,
        job_status="queued",
        message="Issue submitted. Agents are analyzing your report.",
    )


@app.get("/issues/{issue_id}/status", response_model=IssueStatusResponse)
async def get_issue_status(issue_id: str):
    """Poll pipeline status and agent results for a given issue."""
    job = pipeline_jobs.get(issue_id)
    if not job:
        # Try Firestore if not in memory
        try:
            from services.firestore_client import get_firestore_client
            db = get_firestore_client()
            doc = db.collection("issues").document(issue_id).get()
            if doc.exists:
                data = doc.to_dict()
                return IssueStatusResponse(
                    issue_id=issue_id,
                    status=data.get("status", "unknown"),
                    result=data,
                )
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="Issue not found")

    return IssueStatusResponse(
        issue_id=issue_id,
        status=job["status"],
        result=job.get("result"),
        error=job.get("error"),
    )


@app.get("/insights/{ward_id}", response_model=InsightResponse)
async def get_ward_insights(ward_id: str, limit: int = 5):
    """
    Generate AI-powered predictive insights for a ward using Mem0 + Gemini.
    """
    try:
        import google.generativeai as genai
        from services.firestore_client import get_firestore_client

        db = get_firestore_client()
        
        # Fetch recent issues for this ward
        issues_query = (
            db.collection("issues")
            .where("ward_id", "==", ward_id)
            .order_by("created_at", direction="DESCENDING")
            .limit(50)
        )
        issues = [doc.to_dict() for doc in issues_query.stream()]

        if not issues:
            return InsightResponse(
                ward_id=ward_id,
                insights=[],
                generated_at=datetime.utcnow().isoformat()
            )

        # Summarize for Gemini
        summary = "\n".join([
            f"- {i.get('category')} at {i.get('geo_address', 'unknown')}, "
            f"severity {i.get('severity')}, status {i.get('status')}"
            for i in issues[:20]
        ])

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        prompt = f"""
        Analyze these recent civic issues for Ward {ward_id} and generate {limit} 
        actionable predictive insights for the municipal authority.
        
        Recent issues:
        {summary}
        
        Generate insights as a JSON array:
        [
          {{
            "title": "Short insight title",
            "description": "2-3 sentence actionable insight",
            "priority": "high|medium|low",
            "category": "issue category",
            "recommended_action": "Specific action for the authority"
          }}
        ]
        
        Focus on: recurring hotspots, seasonal patterns, under-resourced areas, 
        urgent unresolved issues. Return ONLY valid JSON.
        """

        response = model.generate_content(prompt)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        import json
        insights = json.loads(raw)

        return InsightResponse(
            ward_id=ward_id,
            insights=insights,
            generated_at=datetime.utcnow().isoformat(),
            total_issues_analyzed=len(issues)
        )

    except Exception as e:
        logger.error(f"Insights generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/resolve")
async def resolve_issue(request: ResolveIssueRequest):
    try:
        from services.firestore_client import get_firestore_client
        from services.state_machine import IssueStatus, apply_transition_to_firestore
        from services.pubsub_service import publish_issue_resolved
        from firebase_admin import firestore as fs_module

        db = get_firestore_client()
        issue_ref = db.collection("issues").document(request.issue_id)
        issue = issue_ref.get()

        if not issue.exists:
            raise HTTPException(status_code=404, detail="Issue not found")

        issue_data = issue.to_dict()
        reporter_id = issue_data.get("user_id")
        current_status = IssueStatus(issue_data.get("status", "in_progress"))

        # State machine transition
        await apply_transition_to_firestore(
            db=db,
            issue_id=request.issue_id,
            from_status=current_status,
            to_status=IssueStatus.RESOLVED,
            actor=request.authority_id,
            reason=request.resolution_note,
            extra_fields={
                "resolution_note": request.resolution_note,
                "resolution_photo_url": request.resolution_photo_url,
                "resolved_by": request.authority_id,
                "resolved_at": datetime.utcnow(),
            }
        )

        # Award XP to reporter (25 pts)
        if reporter_id:
            db.collection("users").document(reporter_id).update({
                "points": fs_module.Increment(25),
                "resolved_count": fs_module.Increment(1),
            })

        # Pub/Sub: resolution event → triggers gamification
        await publish_issue_resolved(request.issue_id, request.authority_id, reporter_id or "")

        # Notification to citizen
        db.collection("notifications").add({
            "user_id": reporter_id,
            "type": "issue_resolved",
            "title": "🎉 Your issue was resolved!",
            "body": f"Great news! The {issue_data.get('category')} you reported has been fixed.",
            "issue_id": request.issue_id,
            "read": False,
            "created_at": datetime.utcnow(),
        })

        return {"success": True, "message": "Issue resolved, reporter notified, XP awarded"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Resolve error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── HITL Endpoints ────────────────────────────────────────────────

@app.post("/hitl/approve")
async def hitl_approve(request: HITLApproveRequest):
    """Human verifier approves AI validation → transitions to VALIDATED."""
    try:
        from services.firestore_client import get_firestore_client
        from agents.judge_agent import hitl_approve as do_approve

        db = get_firestore_client()
        result = await do_approve(
            db=db,
            issue_id=request.issue_id,
            reviewer_id=request.reviewer_id,
            notes=request.notes or "",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"HITL approve error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/hitl/reject")
async def hitl_reject(request: HITLRejectRequest):
    """Human verifier rejects → transitions to ESCALATED or REJECTED."""
    try:
        from services.firestore_client import get_firestore_client
        from agents.judge_agent import hitl_reject as do_reject

        db = get_firestore_client()
        result = await do_reject(
            db=db,
            issue_id=request.issue_id,
            reviewer_id=request.reviewer_id,
            reason=request.reason,
            escalate=request.escalate,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"HITL reject error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/hitl/queue")
async def get_hitl_queue(ward_id: Optional[str] = None, limit: int = 20):
    """Get all issues awaiting human review (IN_REVIEW status)."""
    try:
        from services.firestore_client import get_firestore_client
        db = get_firestore_client()

        q = db.collection("issues").where("status", "==", "in_review").order_by(
            "severity", direction="DESCENDING"
        ).limit(limit)

        if ward_id:
            q = q.where("ward_id", "==", ward_id)

        issues = [{"id": doc.id, **doc.to_dict()} for doc in q.stream()]
        return {"issues": issues, "count": len(issues)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ─────────────────────────────────────────────
# Community Consensus — Confirm / Dispute
# ─────────────────────────────────────────────

@app.post("/issues/{issue_id}/verify")
async def community_verify(issue_id: str, body: dict):
    """
    Layer 2 — Community Consensus: Allow citizens near the location to
    Confirm or Dispute an issue. Affects verified_count and trust scores.
    Enforces a 100-meter GPS proximity fence.

    body: { "user_id": str, "action": "confirm" | "dispute", "note": str?, "lat": float, "lng": float }
    """
    try:
        from services.firestore_client import get_firestore_client
        from services.scoring_engine import update_user_credibility
        from agents.validator_agent import haversine_distance

        user_id = body.get("user_id")
        action = body.get("action")  # "confirm" or "dispute"
        note = body.get("note", "")

        if not user_id or action not in ("confirm", "dispute"):
            raise HTTPException(status_code=400, detail="user_id and action (confirm|dispute) required")

        # GPS proximity fencing
        try:
            voter_lat = float(body.get("lat"))
            voter_lng = float(body.get("lng"))
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="Location coordinates (lat, lng) are required and must be valid numbers to verify this issue."
            )

        db = get_firestore_client()

        # Check issue coordinates
        issue_ref = db.collection("issues").document(issue_id)
        issue_snapshot = issue_ref.get()
        if not issue_snapshot.exists:
            raise HTTPException(status_code=404, detail="Issue not found")
        
        issue_data = issue_snapshot.to_dict() or {}
        issue_lat = issue_data.get("lat")
        issue_lng = issue_data.get("lng")

        if issue_lat is not None and issue_lng is not None:
            distance = haversine_distance(voter_lat, voter_lng, issue_lat, issue_lng)
            GPS_FENCE_LIMIT_METERS = 100.0
            if distance > GPS_FENCE_LIMIT_METERS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Verification failed: You must be within {int(GPS_FENCE_LIMIT_METERS)}m of the issue location. (Your distance: {int(distance)}m)"
                )

        # Prevent duplicate votes
        vote_ref = db.collection("issues").document(issue_id).collection("community_votes").document(user_id)
        existing = vote_ref.get()
        if existing.exists:
            return {"success": False, "message": "Already voted on this issue"}

        # Record vote
        vote_ref.set({
            "user_id": user_id,
            "action": action,
            "note": note,
            "timestamp": datetime.utcnow().isoformat(),
            "voter_lat": voter_lat,
            "voter_lng": voter_lng,
        })

        # Update issue counters
        if action == "confirm":
            issue_ref.update({
                "verified_count": fs_module.Increment(1),
                "updated_at": datetime.utcnow(),
            })
            # Credibility: confirming verifier earns small trust bonus
            await update_user_credibility(user_id, "VERIFIED", db=db)
        else:  # dispute
            issue_ref.update({
                "dispute_count": fs_module.Increment(1),
                "updated_at": datetime.utcnow(),
            })

        # Auto-escalate if disputes dominate
        issue_doc = issue_ref.get().to_dict() or {}
        disputes = issue_doc.get("dispute_count", 0)
        confirms = issue_doc.get("verified_count", 0)
        if disputes >= 3 and disputes > confirms:
            from services.state_machine import IssueStatus, apply_transition_to_firestore
            current_status = IssueStatus(issue_doc.get("status", "triage"))
            try:
                await apply_transition_to_firestore(
                    db, issue_id, current_status, IssueStatus.IN_REVIEW,
                    actor="community_consensus",
                    reason=f"Community disputes ({disputes}) exceed confirms ({confirms}) — sent to HITL"
                )
            except Exception:
                pass

        return {"success": True, "action": action, "issue_id": issue_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# Appeal Mechanism
# ─────────────────────────────────────────────

@app.post("/issues/{issue_id}/appeal")
async def appeal_rejection(issue_id: str, body: dict):
    """
    Layer 3 — Appeal: Citizens can appeal an AI-rejected report,
    triggering human review (HITL). Prevents AI from being final arbiter.

    body: { "user_id": str, "appeal_reason": str }
    """
    try:
        from services.firestore_client import get_firestore_client
        from services.state_machine import IssueStatus, apply_transition_to_firestore

        user_id = body.get("user_id")
        appeal_reason = body.get("appeal_reason", "").strip()

        if not user_id or not appeal_reason:
            raise HTTPException(status_code=400, detail="user_id and appeal_reason required")
        if len(appeal_reason) < 10:
            raise HTTPException(status_code=400, detail="Appeal reason too short (min 10 characters)")

        db = get_firestore_client()
        issue_doc = db.collection("issues").document(issue_id).get()
        if not issue_doc.exists:
            raise HTTPException(status_code=404, detail="Issue not found")

        issue_data = issue_doc.to_dict()
        current_status = issue_data.get("status", "")

        # Only allow appeals on rejected/spam issues
        if current_status not in ("rejected", "spam_suspected", "needs_clarification", "validation_failed_geo"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot appeal issue with status '{current_status}'. Appeals only for rejected issues."
            )

        # Record appeal
        db.collection("issues").document(issue_id).collection("appeals").add({
            "user_id": user_id,
            "reason": appeal_reason,
            "original_status": current_status,
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Transition to IN_REVIEW for human evaluation
        try:
            await apply_transition_to_firestore(
                db, issue_id,
                IssueStatus(current_status),
                IssueStatus.IN_REVIEW,
                actor=user_id,
                reason=f"User appeal: {appeal_reason[:100]}"
            )
        except Exception as e:
            # Force update if state machine doesn't allow the transition
            db.collection("issues").document(issue_id).update({
                "status": "in_review",
                "appeal_pending": True,
                "appeal_reason": appeal_reason,
                "updated_at": datetime.utcnow(),
            })

        return {
            "success": True,
            "message": "Appeal submitted. A human reviewer will evaluate your report.",
            "new_status": "in_review",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/issues/ranked")

async def get_ranked_issues(
    ward_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
):
    """
    Return issues sorted by Urgency Weight:
    W = α·severity + β·upvotes + γ·verifications + δ·(1/age_hours)
    
    Use this for the Impact Dashboard and authority priority queue.
    """
    try:
        from services.firestore_client import get_firestore_client
        from services.scoring_engine import rank_issues

        db = get_firestore_client()
        q = db.collection("issues")

        if ward_id:
            q = q.where("ward_id", "==", ward_id)
        if status_filter:
            q = q.where("status", "==", status_filter)
        else:
            # Default: exclude terminal states
            q = q.where("status", "not-in", ["closed", "rejected"])

        docs = q.limit(limit).stream()
        issues = [{"id": d.id, **d.to_dict()} for d in docs]

        ranked = rank_issues(issues)
        return {
            "issues": ranked,
            "count": len(ranked),
            "sort": "urgency_weight_desc",
            "formula": "W = 0.4×severity + 0.25×upvotes + 0.2×verifications + 0.15×(1/age_hours)",
        }
    except Exception as e:
        logger.error(f"Ranked issues error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/hotspots")
async def get_hotspots(
    ward_id: Optional[str] = None,
    k: Optional[int] = None,
    min_severity: int = 1,
):
    """
    K-Means clustering of active issues to identify Regional Priority Zones.
    
    Returns cluster centroids with priority zone classification:
    critical | high | moderate | low
    
    Use for map overlay and authority dashboard heatmap.
    """
    try:
        from services.firestore_client import get_firestore_client
        from services.scoring_engine import kmeans_cluster_issues

        db = get_firestore_client()
        q = (
            db.collection("issues")
            .where("status", "not-in", ["closed", "rejected", "duplicate_found"])
        )
        if ward_id:
            q = q.where("ward_id", "==", ward_id)

        docs = q.limit(200).stream()
        issues = [
            {"id": d.id, **d.to_dict()}
            for d in docs
            if d.to_dict().get("severity", 0) >= min_severity
        ]

        clusters = kmeans_cluster_issues(issues, k=k)

        # Persist clusters to Firestore for frontend caching
        if clusters:
            try:
                db.collection("ward_insights").document(ward_id or "all").set({
                    "hotspots": clusters,
                    "updated_at": datetime.utcnow().isoformat(),
                    "issue_count": len(issues),
                }, merge=True)
            except Exception:
                pass  # Non-critical

        return {
            "clusters": clusters,
            "cluster_count": len(clusters),
            "issues_analyzed": len(issues),
            "algorithm": "K-Means++ (k=auto=min(√n,8))",
        }
    except Exception as e:
        logger.error(f"Hotspots error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {"message": "Prastab API", "version": "1.0.0", "docs": "/docs"}


@app.post("/admin/reset-monthly-leaderboard")
async def reset_monthly_leaderboard(x_admin_key: Optional[str] = Header(None)):
    """
    Reset all users' monthly_points to 0 for the new month.
    Should be called by Cloud Scheduler on the 1st of each month.
    Protected by admin key from environment.
    """
    expected_key = settings.admin_api_key if hasattr(settings, 'admin_api_key') else None
    if expected_key and x_admin_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid admin key")

    try:
        from services.firestore_client import get_firestore_client
        from google.cloud.firestore_v1 import WriteBatch

        db = get_firestore_client()
        users = list(db.collection("users").stream())

        reset_count = 0
        batch = db.batch()
        for i, user_doc in enumerate(users):
            batch.update(user_doc.reference, {
                "monthly_points": 0,
                "updatedAt": datetime.utcnow(),
            })
            reset_count += 1
            # Firestore batch limit is 500 writes
            if (i + 1) % 499 == 0:
                batch.commit()
                batch = db.batch()

        batch.commit()

        # Store reset timestamp in metadata collection
        db.collection("metadata").document("leaderboard").set({
            "last_monthly_reset": datetime.utcnow(),
            "reset_user_count": reset_count,
        }, merge=True)

        logger.info(f"[ADMIN] Monthly leaderboard reset: {reset_count} users cleared")
        return {
            "status": "ok",
            "users_reset": reset_count,
            "reset_at": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error(f"Monthly reset error: {e}")
        raise HTTPException(status_code=500, detail=str(e))






@app.post("/fcm/register")
async def register_fcm_token(body: dict):
    """Register a device FCM token for push notifications."""
    try:
        from services.firestore_client import get_firestore_client
        user_id = body.get("user_id")
        fcm_token = body.get("fcm_token")
        if not user_id or not fcm_token:
            raise HTTPException(status_code=400, detail="user_id and fcm_token required")

        db = get_firestore_client()
        db.collection("users").document(user_id).update({
            "fcm_tokens": fs_module.ArrayUnion([fcm_token]),
            "updated_at": datetime.utcnow(),
        })
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# Proof-of-Resolution
# ─────────────────────────────────────────────

@app.post("/issues/{issue_id}/resolve")
async def resolve_with_proof(issue_id: str, body: ResolveIssueRequest):
    """
    Mark an issue as Resolved with mandatory Proof-of-Resolution.

    Workflow:
    1. Authority submits resolution note + after-photo URL
    2. Gemini 1.5 Pro Vision compares before (original) vs after image
    3. If AI verdict = RESOLVED → transition to RESOLVED state
    4. If AI verdict = PARTIAL/UNRESOLVED → keep open, return feedback
    5. All outcomes recorded in audit_trail for public accountability

    "Resolved" means AI-verified, not just authority-claimed.
    """
    try:
        from services.firestore_client import get_firestore_client
        from services.state_machine import IssueStatus, apply_transition_to_firestore
        from services.proof_of_resolution import verify_resolution_proof
        from services.scoring_engine import update_user_credibility

        db = get_firestore_client()
        issue_ref = db.collection("issues").document(issue_id)
        issue_doc = issue_ref.get()

        if not issue_doc.exists:
            raise HTTPException(status_code=404, detail="Issue not found")

        issue_data = issue_doc.to_dict()
        before_image_url = issue_data.get("image_url", "")
        after_image_url = body.resolution_photo_url
        category = issue_data.get("category", "unknown")
        reporter_id = issue_data.get("user_id")

        if not after_image_url:
            raise HTTPException(
                status_code=400,
                detail="resolution_photo_url is required. Proof-of-Resolution photo must be provided."
            )

        # ── Gemini Before-After Comparison ────────────────────────
        logger.info(f"[RESOLVE] Running Proof-of-Resolution for {issue_id}")
        proof = await verify_resolution_proof(
            issue_id=issue_id,
            before_image_url=before_image_url,
            after_image_url=after_image_url,
            category=category,
            original_description=issue_data.get("ai_description", ""),
        )

        verdict = proof.get("verdict", "UNRESOLVED")
        logger.info(f"[RESOLVE] Verdict: {verdict} (confidence: {proof.get('confidence', 0):.2f})")

        # ── Record proof in Firestore (always, regardless of verdict) ──
        issue_ref.update({
            "resolution_photo_url": after_image_url,
            "resolution_note": body.resolution_note,
            "resolved_by": body.authority_id,
            "proof_verdict": verdict,
            "proof_confidence": proof.get("confidence"),
            "proof_quality_score": proof.get("quality_score"),
            "proof_verification_note": proof.get("verification_note"),
            "proof_ai_verified": proof.get("ai_verified", False),
            "proof_remaining_issues": proof.get("remaining_issues", ""),
            "updated_at": datetime.utcnow(),
        })

        if verdict == "RESOLVED":
            # ── Full resolution — transition state ─────────────────
            current_status = IssueStatus(issue_data.get("status", "in_progress"))
            await apply_transition_to_firestore(
                db, issue_id,
                current_status,
                IssueStatus.RESOLVED,
                actor=body.authority_id,
                reason=f"Proof-of-Resolution verified by Gemini Vision (confidence: {proof.get('confidence', 0):.0%}). {proof.get('verification_note', '')}"
            )
            # Reward the original reporter's credibility
            if reporter_id:
                await update_user_credibility(reporter_id, "RESOLVED", db=db)

            return {
                "success": True,
                "verdict": "RESOLVED",
                "message": "✅ Issue verified as resolved by AI Vision analysis.",
                "proof": proof,
                "new_status": "resolved",
            }

        elif verdict == "PARTIAL":
            # ── Partial fix — keep open, add feedback note ──────────
            await apply_transition_to_firestore(
                db, issue_id,
                IssueStatus(issue_data.get("status", "in_progress")),
                IssueStatus.IN_PROGRESS,
                actor=body.authority_id,
                reason=f"Partial resolution detected by AI. {proof.get('remaining_issues', 'Further work required.')}"
            )
            return {
                "success": False,
                "verdict": "PARTIAL",
                "message": f"⚠️ Partial resolution detected. {proof.get('remaining_issues', 'Further work is required before marking complete.')}",
                "proof": proof,
                "new_status": "in_progress",
            }

        else:  # UNRESOLVED or UNVERIFIED
            return {
                "success": False,
                "verdict": verdict,
                "message": f"❌ Resolution not verified. AI found no visible improvement. {proof.get('remaining_issues', '')}",
                "proof": proof,
                "new_status": issue_data.get("status"),
                "ai_note": proof.get("verification_note"),
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RESOLVE] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.on_event("startup")
async def startup_event():
    """Pre-warm Firestore connection and build RAG query engine on startup."""
    logger.info("🚀 Prastab API starting up...")
    try:
        from services.firestore_client import get_firestore_client
        get_firestore_client()
        logger.info("✅ Firestore connected")
    except Exception as e:
        logger.warning(f"⚠️ Firestore startup failed: {e}")
    try:
        from services.rag_pipeline import build_query_engine
        build_query_engine()
        logger.info("✅ RAG pipeline ready")
    except Exception as e:
        logger.warning(f"⚠️ RAG startup failed: {e}")


# ─────────────────────────────────────────────
# Hyperlocal Neighbor Notifications
# ─────────────────────────────────────────────

@app.post("/issues/{issue_id}/notify-neighbors")
async def notify_nearby_users(issue_id: str):
    """
    Broadcast a hyperlocal FCM notification to all verified users
    within 500m of a newly reported high-severity issue.

    This drives organic engagement — nearby citizens tap in to upvote
    or add confirmation photos, creating a community verification loop.
    """
    try:
        from services.firestore_client import get_firestore_client
        import math

        db = get_firestore_client()
        issue_doc = db.collection("issues").document(issue_id).get()
        if not issue_doc.exists:
            raise HTTPException(status_code=404, detail="Issue not found")

        issue = issue_doc.to_dict()
        severity = issue.get("severity", 1)
        lat = issue.get("lat", 0)
        lng = issue.get("lng", 0)
        category = (issue.get("category") or "issue").replace("_", " ")
        geo_address = issue.get("geo_address", "your area")

        # Only broadcast for high-severity issues (severity >= 3)
        if severity < 3:
            return {"sent": 0, "skipped": "severity below threshold"}

        NOTIFY_RADIUS_M = 500
        lat_offset = NOTIFY_RADIUS_M / 111000
        lng_offset = NOTIFY_RADIUS_M / (111000 * math.cos(math.radians(lat)))

        # Query users in the bounding box who have FCM tokens
        users_q = (
            db.collection("users")
            .where("trustScore", ">=", 0.3)  # Only verified users
            .limit(100)
        )
        users = [u.to_dict() for u in users_q.stream()]

        # Filter by distance and collect FCM tokens
        tokens = []
        notified_users = []
        for u in users:
            u_lat = u.get("lastLat", 0) or 0
            u_lng = u.get("lastLng", 0) or 0
            if u_lat == 0 and u_lng == 0:
                continue
            # Bounding box pre-filter
            if abs(u_lat - lat) > lat_offset or abs(u_lng - lng) > lng_offset:
                continue
            for token in (u.get("fcm_tokens") or []):
                if token:
                    tokens.append(token)
            notified_users.append(u.get("uid", ""))

        if not tokens:
            return {"sent": 0, "message": "No nearby users with FCM tokens found"}

        # Send FCM multicast notification
        severity_emoji = {5: "🚨", 4: "🔴", 3: "🟡"}.get(severity, "📍")
        try:
            from firebase_admin import messaging
            message = messaging.MulticastMessage(
                tokens=tokens[:500],  # FCM limit
                notification=messaging.Notification(
                    title=f"{severity_emoji} Community Alert — {category.title()} Reported",
                    body=f"New issue near you: {geo_address.split(',')[0]}. Tap to verify!",
                ),
                data={
                    "issue_id": issue_id,
                    "type": "neighbor_alert",
                    "category": category,
                    "severity": str(severity),
                },
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(channel_id="community_alerts"),
                ),
            )
            response = messaging.send_each_for_multicast(message)
            sent = response.success_count
        except Exception as fcm_e:
            logger.warning(f"[NOTIFY] FCM send failed: {fcm_e}")
            sent = 0

        # Store notification records
        for uid in notified_users[:50]:
            db.collection("notifications").add({
                "user_id": uid,
                "type": "neighbor_alert",
                "title": f"{severity_emoji} Issue Nearby",
                "body": f"New {category} reported near you. Tap to view and verify!",
                "issue_id": issue_id,
                "read": False,
                "created_at": datetime.utcnow(),
            })

        logger.info(f"[NOTIFY] Sent to {sent} devices near issue {issue_id}")
        return {"sent": sent, "users_notified": len(notified_users), "tokens_found": len(tokens)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Neighbor notify error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# AI Auto-Share Card Generation
# ─────────────────────────────────────────────

@app.get("/issues/{issue_id}/share-card")
async def generate_share_card(issue_id: str):
    """
    Generate a shareable "Before & After" card for resolved issues.
    Returns structured data for the frontend Web Share API.

    AI generates compelling social-media-ready caption text.
    """
    try:
        from services.firestore_client import get_firestore_client

        db = get_firestore_client()
        issue_doc = db.collection("issues").document(issue_id).get()
        if not issue_doc.exists:
            raise HTTPException(status_code=404, detail="Issue not found")

        issue = issue_doc.to_dict()
        if issue.get("status") not in ("resolved", "closed"):
            raise HTTPException(status_code=400, detail="Share cards only available for resolved issues")

        before_url = issue.get("image_url", "")
        after_url = issue.get("resolution_photo_url", "")
        category = (issue.get("category") or "issue").replace("_", " ")
        address = issue.get("geo_address", "our community")
        short_address = address.split(",")[0] if address else "our community"

        # Generate AI caption
        caption = f"We fixed it! A {category} at {short_address} has been resolved via Prastab. 🏆"
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.gemini_api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = f"""
            Write a short, inspiring social media caption (max 120 chars) for a civic win:
            - Issue: {category}
            - Location: {short_address}
            - Platform: Prastab (community issue reporting app)
            - Tone: celebratory, community pride, action-oriented
            - Include 1-2 emojis
            - End with hashtag #Prastab
            Return ONLY the caption text, nothing else.
            """
            resp = model.generate_content(prompt)
            caption = resp.text.strip()[:200]
        except Exception:
            pass  # Fall back to template caption

        share_url = f"https://prastab.app/issues/{issue_id}"

        return {
            "before_image_url": before_url,
            "after_image_url": after_url,
            "caption": caption,
            "share_url": share_url,
            "share_title": f"Community Win: {category.title()} Fixed!",
            "share_text": f"{caption}\n\nView the before & after: {share_url}",
            "category": category,
            "address": short_address,
            "proof_verdict": issue.get("proof_verdict", "RESOLVED"),
            "quality_score": issue.get("proof_quality_score"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Share card error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
