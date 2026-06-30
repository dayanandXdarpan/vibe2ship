"""
State Machine — Civic Issue Lifecycle

Enforces valid state transitions with full audit trail.
Every transition is recorded in Firestore for accountability.

State Graph:
  DRAFT → TRIAGE → IN_REVIEW (HITL wait) → VALIDATED → ASSIGNED
       ↘ ESCALATED ←──────────────────────────────────┘ (HITL reject)
  ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED
  Any state → REJECTED (spam/invalid)
"""
from enum import Enum
from typing import Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class IssueStatus(str, Enum):
    DRAFT = "draft"                   # Created, media uploaded, not yet analyzed
    TRIAGE = "triage"                 # Agent pipeline started
    IN_REVIEW = "in_review"           # HITL: awaiting human verifier approval
    VALIDATED = "validated"           # AI + Human verified
    ASSIGNED = "assigned"             # Routed to department
    IN_PROGRESS = "in_progress"       # Authority acknowledged
    RESOLVED = "resolved"             # Authority marked fixed
    CLOSED = "closed"                 # 48h post-resolution, auto-closed
    ESCALATED = "escalated"           # HITL rejected → escalated to senior authority
    REJECTED = "rejected"             # Spam / invalid / duplicate


# Valid state transitions matrix
VALID_TRANSITIONS: dict[IssueStatus, list[IssueStatus]] = {
    IssueStatus.DRAFT:       [IssueStatus.TRIAGE, IssueStatus.REJECTED],
    IssueStatus.TRIAGE:      [IssueStatus.IN_REVIEW, IssueStatus.VALIDATED, IssueStatus.REJECTED, IssueStatus.ESCALATED],
    IssueStatus.IN_REVIEW:   [IssueStatus.VALIDATED, IssueStatus.ESCALATED, IssueStatus.REJECTED],
    IssueStatus.VALIDATED:   [IssueStatus.ASSIGNED, IssueStatus.ESCALATED],
    IssueStatus.ASSIGNED:    [IssueStatus.IN_PROGRESS, IssueStatus.ESCALATED],
    IssueStatus.IN_PROGRESS: [IssueStatus.RESOLVED, IssueStatus.ESCALATED],
    IssueStatus.RESOLVED:    [IssueStatus.CLOSED],
    IssueStatus.CLOSED:      [],  # Terminal
    IssueStatus.ESCALATED:   [IssueStatus.ASSIGNED, IssueStatus.REJECTED],
    IssueStatus.REJECTED:    [],  # Terminal
}

# SLA hours per status (time allowed before escalation)
STATUS_SLA_HOURS: dict[IssueStatus, int] = {
    IssueStatus.TRIAGE: 1,
    IssueStatus.IN_REVIEW: 4,
    IssueStatus.VALIDATED: 2,
    IssueStatus.ASSIGNED: 24,
    IssueStatus.IN_PROGRESS: 72,
    IssueStatus.RESOLVED: 48,  # 48h before auto-close
}

# Display labels
STATUS_LABELS: dict[IssueStatus, str] = {
    IssueStatus.DRAFT: "Draft",
    IssueStatus.TRIAGE: "Under Analysis",
    IssueStatus.IN_REVIEW: "Awaiting Review",
    IssueStatus.VALIDATED: "Verified",
    IssueStatus.ASSIGNED: "Assigned",
    IssueStatus.IN_PROGRESS: "In Progress",
    IssueStatus.RESOLVED: "Resolved",
    IssueStatus.CLOSED: "Closed",
    IssueStatus.ESCALATED: "Escalated",
    IssueStatus.REJECTED: "Rejected",
}


class InvalidTransitionError(Exception):
    pass


def can_transition(from_status: IssueStatus, to_status: IssueStatus) -> bool:
    """Check if a state transition is valid."""
    allowed = VALID_TRANSITIONS.get(from_status, [])
    return to_status in allowed


def transition(
    from_status: IssueStatus,
    to_status: IssueStatus,
    actor: str,
    reason: str = "",
) -> dict:
    """
    Validate and record a state transition.
    Returns a Firestore-ready update dict with audit trail entry.
    Raises InvalidTransitionError if transition is not allowed.
    """
    if not can_transition(from_status, to_status):
        raise InvalidTransitionError(
            f"Cannot transition from '{from_status}' to '{to_status}'. "
            f"Allowed: {[s.value for s in VALID_TRANSITIONS.get(from_status, [])]}"
        )

    now = datetime.utcnow()
    audit_entry = {
        "from_status": from_status.value,
        "to_status": to_status.value,
        "actor": actor,
        "reason": reason,
        "timestamp": now.isoformat(),
    }

    logger.info(
        f"[STATE_MACHINE] {from_status.value} → {to_status.value} "
        f"by {actor}: {reason}"
    )

    return {
        "status": to_status.value,
        "updated_at": now,
        "last_transition": audit_entry,
        # Return audit entry to be appended to audit_trail array
        "_audit_entry": audit_entry,
    }


async def apply_transition_to_firestore(
    db,
    issue_id: str,
    from_status: IssueStatus,
    to_status: IssueStatus,
    actor: str,
    reason: str = "",
    extra_fields: Optional[dict] = None,
) -> dict:
    """
    Apply a validated state transition to Firestore.
    Appends to the issue's audit_trail subcollection.
    """
    from google.cloud.firestore import ArrayUnion

    update = transition(from_status, to_status, actor, reason)
    audit_entry = update.pop("_audit_entry")

    if extra_fields:
        update.update(extra_fields)

    # Update issue document
    issue_ref = db.collection("issues").document(issue_id)
    issue_ref.update({**update, "audit_trail": ArrayUnion([audit_entry])})

    # Also write to audit subcollection for detailed querying
    issue_ref.collection("audit_trail").add(audit_entry)

    return audit_entry
