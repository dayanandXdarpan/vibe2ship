"""
Cloud Pub/Sub Service — Async Agent Communication

Decouples agent pipeline stages using Google Cloud Pub/Sub.
Each agent publishes its result to a topic; next agent subscribes.

Topics:
  community-hero-reports     → triggers Reporter Agent
  community-hero-analyzed    → triggers Memory + Validator Agents
  community-hero-validated   → triggers Judge Agent
  community-hero-judge-pass  → triggers Resolver Agent
  community-hero-hitl        → notifies human reviewer dashboard
  community-hero-resolved    → triggers XP/gamification events

This allows agents to run asynchronously without blocking each other.
"""
import json
import logging
from datetime import datetime
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Topic names
TOPIC_REPORTS = "community-hero-reports"
TOPIC_ANALYZED = "community-hero-analyzed"
TOPIC_VALIDATED = "community-hero-validated"
TOPIC_JUDGE_PASS = "community-hero-judge-pass"
TOPIC_HITL = "community-hero-hitl"
TOPIC_RESOLVED = "community-hero-resolved"

_publisher = None


def get_publisher():
    """Lazy-init Pub/Sub publisher client."""
    global _publisher
    if _publisher is None:
        try:
            from google.cloud import pubsub_v1
            _publisher = pubsub_v1.PublisherClient()
            logger.info("[PUBSUB] Publisher client initialized")
        except Exception as e:
            logger.warning(f"[PUBSUB] Publisher unavailable: {e}. Using no-op fallback.")
    return _publisher


def build_topic_path(topic_name: str) -> str:
    return f"projects/{settings.google_cloud_project}/topics/{topic_name}"


async def publish_message(topic_name: str, data: dict, attributes: dict = None) -> str | None:
    """
    Publish a message to a Pub/Sub topic.
    Returns message ID or None if Pub/Sub unavailable.
    """
    publisher = get_publisher()
    if publisher is None:
        logger.info(f"[PUBSUB] No-op publish to {topic_name}: {list(data.keys())}")
        return None

    try:
        topic_path = build_topic_path(topic_name)
        payload = json.dumps({**data, "_published_at": datetime.utcnow().isoformat()}).encode("utf-8")
        attrs = attributes or {}

        future = publisher.publish(topic_path, payload, **attrs)
        msg_id = future.result(timeout=10)
        logger.info(f"[PUBSUB] Published to {topic_name}: msg_id={msg_id}")
        return msg_id

    except Exception as e:
        logger.error(f"[PUBSUB] Publish failed to {topic_name}: {e}")
        return None


# ─────────────────────────────────────────────
# Typed publish helpers (one per pipeline event)
# ─────────────────────────────────────────────

async def publish_issue_submitted(issue_id: str, user_id: str, image_url: str, lat: float, lng: float):
    """Publish when a new issue is submitted — triggers Reporter Agent."""
    return await publish_message(
        TOPIC_REPORTS,
        {"issue_id": issue_id, "user_id": user_id, "image_url": image_url, "lat": lat, "lng": lng},
        attributes={"event_type": "issue_submitted", "issue_id": issue_id},
    )


async def publish_reporter_complete(issue_id: str, category: str, severity: int, confidence: float):
    """Publish when Reporter Agent completes — triggers Memory + Validator."""
    return await publish_message(
        TOPIC_ANALYZED,
        {"issue_id": issue_id, "category": category, "severity": severity, "confidence": confidence},
        attributes={"event_type": "reporter_complete", "severity": str(severity)},
    )


async def publish_validation_complete(issue_id: str, validation_result: str, duplicate_of: str = None):
    """Publish when Validator Agent completes — triggers Judge Agent."""
    return await publish_message(
        TOPIC_VALIDATED,
        {"issue_id": issue_id, "validation_result": validation_result, "duplicate_of": duplicate_of},
        attributes={"event_type": "validation_complete", "result": validation_result},
    )


async def publish_hitl_required(
    issue_id: str, reason: str, severity: int, confidence: float, ward_id: str = None
):
    """Publish when HITL is required — notifies verifier dashboard in real-time."""
    return await publish_message(
        TOPIC_HITL,
        {
            "issue_id": issue_id,
            "reason": reason,
            "severity": severity,
            "confidence": confidence,
            "ward_id": ward_id,
            "requires_action": True,
        },
        attributes={"event_type": "hitl_required", "severity": str(severity)},
    )


async def publish_judge_passed(issue_id: str, quality_score: float, routing_dept: str):
    """Publish when Judge approves — triggers Resolver Agent."""
    return await publish_message(
        TOPIC_JUDGE_PASS,
        {"issue_id": issue_id, "quality_score": quality_score, "routing_dept": routing_dept},
        attributes={"event_type": "judge_passed"},
    )


async def publish_issue_resolved(issue_id: str, resolved_by: str, reporter_id: str):
    """Publish when issue is resolved — triggers XP award and notification."""
    return await publish_message(
        TOPIC_RESOLVED,
        {"issue_id": issue_id, "resolved_by": resolved_by, "reporter_id": reporter_id},
        attributes={"event_type": "issue_resolved"},
    )
