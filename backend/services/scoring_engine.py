"""
Civic Scoring Engine — Urgency Weighting & Hotspot Detection

Three algorithms:

1. Urgency Weight Formula:
   W = (α × severity) + (β × upvotes) + (γ × community_verifications) + (δ × 1/age_hours)
   
   Tunable constants optimized for civic contexts:
   α = 0.40  (severity dominates — safety first)
   β = 0.25  (community votes matter)
   γ = 0.20  (verification ring quality signal)
   δ = 0.15  (recency — but doesn't overwhelm severity)

2. K-Means Clustering for Hotspot Detection:
   Groups spatially close issues into "Regional Priority Zones"
   for the Authority Portal map overlay.

3. Credibility Score Update:
   Adjusts user trustScore based on whether their reports
   pass validation (VALID +0.05, SPAM -0.15, DUPLICATE +0.01).
"""
import logging
import math
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Urgency Weight Constants ──────────────────────────────────────
ALPHA = 0.40   # Severity weight (1–5 scale)
BETA  = 0.25   # Upvotes weight
GAMMA = 0.20   # Community verification weight
DELTA = 0.15   # Recency weight (1 / age_hours, capped)

MAX_RECENCY = 1.0   # Cap so brand-new issues don't dominate forever
RECENCY_CAP_HOURS = 1.0  # Minimum age to prevent division issues


def compute_urgency_weight(
    severity: int,
    upvotes: int = 0,
    verified_count: int = 0,
    created_at=None,
    user_trust_score: float = 0.5,
) -> float:
    """
    Compute urgency weight W for a single issue node.
    
    W = (α × severity_norm) + (β × upvote_norm) + (γ × verify_norm) + (δ × recency)
    
    All components normalized to 0–1 range.
    Final score is also adjusted by reporter credibility.
    
    Returns: float in range [0.0, 1.0]
    """
    # Normalize severity (1–5) → 0–1
    sev_norm = max(0.0, min(1.0, (severity - 1) / 4.0))

    # Normalize upvotes — log scale to prevent runaway dominance
    upvote_norm = min(1.0, math.log1p(upvotes) / math.log1p(50))

    # Normalize verifications — sigmoid-like cap at 10
    verify_norm = min(1.0, verified_count / 10.0)

    # Recency — 1/age_hours, capped
    if created_at is not None:
        try:
            if hasattr(created_at, 'timestamp'):
                created_ts = created_at.timestamp()
            elif hasattr(created_at, '_seconds'):  # Firestore Timestamp
                created_ts = created_at._seconds
            else:
                created_ts = float(created_at)
            age_hours = max(RECENCY_CAP_HOURS, (datetime.now(timezone.utc).timestamp() - created_ts) / 3600)
            recency = min(MAX_RECENCY, 1.0 / age_hours)
        except Exception:
            recency = 0.1
    else:
        recency = 0.1

    raw_weight = (
        ALPHA * sev_norm +
        BETA  * upvote_norm +
        GAMMA * verify_norm +
        DELTA * recency
    )

    # Apply credibility multiplier (trust 0.2–1.0 → multiplier 0.5–1.1)
    credibility_multiplier = 0.5 + (user_trust_score * 0.6)
    weight = min(1.0, raw_weight * credibility_multiplier)

    return round(weight, 4)


def rank_issues(issues: list[dict]) -> list[dict]:
    """
    Sort a list of issue dicts by urgency weight (descending).
    Adds `urgency_weight` field to each issue.
    """
    for issue in issues:
        issue["urgency_weight"] = compute_urgency_weight(
            severity=issue.get("severity", 1),
            upvotes=issue.get("upvotes", 0),
            verified_count=issue.get("verified_count", 0),
            created_at=issue.get("created_at"),
            user_trust_score=issue.get("reporter_trust_score", 0.5),
        )
    return sorted(issues, key=lambda x: x["urgency_weight"], reverse=True)


# ── K-Means Clustering ────────────────────────────────────────────

def _euclidean_dist(p1: tuple, p2: tuple) -> float:
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


def _assign_clusters(points: list[tuple], centroids: list[tuple]) -> list[int]:
    return [min(range(len(centroids)), key=lambda k: _euclidean_dist(p, centroids[k])) for p in points]


def _update_centroids(points: list[tuple], assignments: list[int], k: int) -> list[tuple]:
    new_centroids = []
    for i in range(k):
        cluster_pts = [points[j] for j in range(len(points)) if assignments[j] == i]
        if cluster_pts:
            new_centroids.append((
                sum(p[0] for p in cluster_pts) / len(cluster_pts),
                sum(p[1] for p in cluster_pts) / len(cluster_pts),
            ))
        else:
            new_centroids.append(points[i % len(points)])
    return new_centroids


def kmeans_cluster_issues(
    issues: list[dict],
    k: int = None,
    max_iterations: int = 50,
) -> list[dict]:
    """
    Pure-Python K-Means clustering on issue coordinates.
    
    Auto-selects k = min(√n, 8) for civic context.
    Returns list of cluster dicts:
    {
      "cluster_id": int,
      "centroid": {"lat": float, "lng": float},
      "issue_count": int,
      "avg_severity": float,
      "max_severity": int,
      "priority_zone": "critical" | "high" | "moderate" | "low",
      "issue_ids": [str, ...],
      "top_category": str,
    }
    """
    mappable = [i for i in issues if i.get("lat") and i.get("lng")]
    if len(mappable) < 2:
        return []

    n = len(mappable)
    k = k or min(max(2, int(math.sqrt(n))), 8)
    k = min(k, n)

    points = [(i["lat"], i["lng"]) for i in mappable]

    # Kmeans++ style initialization — spread initial centroids
    import random
    centroids = [points[0]]
    for _ in range(k - 1):
        dists = [min(_euclidean_dist(p, c) for c in centroids) for p in points]
        total = sum(dists)
        if total == 0:
            centroids.append(points[len(centroids) % n])
        else:
            probs = [d / total for d in dists]
            cumulative = []
            acc = 0
            for p in probs:
                acc += p
                cumulative.append(acc)
            r = random.random()
            for idx, cp in enumerate(cumulative):
                if r <= cp:
                    centroids.append(points[idx])
                    break

    # Iterate
    assignments = _assign_clusters(points, centroids)
    for _ in range(max_iterations):
        new_centroids = _update_centroids(points, assignments, k)
        new_assignments = _assign_clusters(points, new_centroids)
        if new_assignments == assignments:
            break
        centroids = new_centroids
        assignments = new_assignments

    # Build cluster summaries
    clusters = []
    for i in range(k):
        cluster_issues = [mappable[j] for j in range(n) if assignments[j] == i]
        if not cluster_issues:
            continue

        severities = [iss.get("severity", 1) for iss in cluster_issues]
        avg_sev = sum(severities) / len(severities)
        max_sev = max(severities)

        # Categorize priority zone
        if max_sev >= 5 or (avg_sev >= 4 and len(cluster_issues) >= 3):
            zone = "critical"
        elif max_sev >= 4 or avg_sev >= 3:
            zone = "high"
        elif avg_sev >= 2:
            zone = "moderate"
        else:
            zone = "low"

        # Most common category in cluster
        cat_counts = {}
        for iss in cluster_issues:
            c = iss.get("category", "other")
            cat_counts[c] = cat_counts.get(c, 0) + 1
        top_cat = max(cat_counts, key=cat_counts.get)

        clusters.append({
            "cluster_id": i,
            "centroid": {"lat": centroids[i][0], "lng": centroids[i][1]},
            "issue_count": len(cluster_issues),
            "avg_severity": round(avg_sev, 2),
            "max_severity": max_sev,
            "priority_zone": zone,
            "issue_ids": [iss.get("id", "") for iss in cluster_issues],
            "top_category": top_cat,
            "radius_m": _estimate_cluster_radius(centroids[i], cluster_issues),
        })

    # Sort clusters by priority
    zone_order = {"critical": 0, "high": 1, "moderate": 2, "low": 3}
    return sorted(clusters, key=lambda c: zone_order.get(c["priority_zone"], 4))


def _estimate_cluster_radius(centroid: tuple, issues: list[dict]) -> float:
    """Estimate cluster radius in meters as max distance from centroid."""
    if not issues:
        return 0.0
    dists = []
    R = 6371000
    for iss in issues:
        lat, lng = iss.get("lat", centroid[0]), iss.get("lng", centroid[1])
        dphi = math.radians(lat - centroid[0])
        dlambda = math.radians(lng - centroid[1])
        a = math.sin(dphi/2)**2 + math.cos(math.radians(centroid[0])) * math.cos(math.radians(lat)) * math.sin(dlambda/2)**2
        dists.append(2 * R * math.asin(math.sqrt(a)))
    return round(max(dists), 1)


# ── Credibility Score Update ──────────────────────────────────────

CREDIBILITY_DELTAS = {
    "VALID":      +0.05,   # Report confirmed valid
    "RESOLVED":   +0.10,   # Issue actually got fixed
    "VERIFIED":   +0.03,   # Community co-verified
    "DUPLICATE":  +0.01,   # Spotted same real issue (small credit)
    "INVALID":    -0.10,   # GPS/content didn't check out
    "SPAM":       -0.20,   # Spam report — significant penalty
}

MIN_TRUST = 0.05
MAX_TRUST = 1.00


async def update_user_credibility(
    user_id: str,
    event: str,
    db=None,
) -> float:
    """
    Update user trustScore in Firestore based on validation outcome.
    
    Args:
        user_id: Firestore user document ID
        event: One of VALID, RESOLVED, VERIFIED, DUPLICATE, INVALID, SPAM
        db: Firestore client (injected)
    
    Returns: New trust score
    """
    delta = CREDIBILITY_DELTAS.get(event.upper(), 0.0)
    if delta == 0.0 or not db:
        return 0.5

    try:
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return 0.5

        current_trust = user_doc.to_dict().get("trustScore", 0.5)
        new_trust = max(MIN_TRUST, min(MAX_TRUST, current_trust + delta))

        user_ref.update({
            "trustScore": new_trust,
            "trust_history": {
                "last_event": event,
                "last_delta": delta,
                "updated_at": datetime.utcnow().isoformat(),
            }
        })

        logger.info(f"[SCORING] User {user_id} trust: {current_trust:.2f} → {new_trust:.2f} ({event})")
        return new_trust

    except Exception as e:
        logger.error(f"[SCORING] Credibility update failed: {e}")
        return 0.5
