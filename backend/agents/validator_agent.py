"""
Validator Agent — Geo Verification + Visual Duplicate Detection

Validates reports by:
1. Verifying GPS coordinates via Google Maps Geocoding API
2. Querying Firestore for spatially nearby open issues
3. Running PixelRAG visual similarity check for duplicate detection
4. Applying spam/trust heuristics
"""
import logging
import math
import httpx
from config import get_settings
from services.firestore_client import get_firestore_client

logger = logging.getLogger(__name__)
settings = get_settings()


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in meters between two GPS coordinates."""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def verify_location_with_google_maps(lat: float, lng: float) -> tuple[bool, str, list]:
    """
    Use Google Maps Reverse Geocoding to verify coordinates are a real address.
    Returns (is_valid, formatted_address, place_types).
    place_types e.g. ['highway', 'route'] or ['residential', 'sublocality']
    """
    if not settings.google_maps_api_key:
        logger.warning("[VALIDATOR] No Google Maps API key — skipping geo verify")
        return True, f"{lat}, {lng}", []

    url = (
        f"https://maps.googleapis.com/maps/api/geocode/json"
        f"?latlng={lat},{lng}&key={settings.google_maps_api_key}"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            data = resp.json()

        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            address = result["formatted_address"]
            # Collect all place types across results (first 3 results)
            place_types = []
            for r in data["results"][:3]:
                place_types.extend(r.get("types", []))
            place_types = list(set(place_types))
            logger.info(f"[VALIDATOR] Location verified: {address} | types: {place_types[:5]}")
            return True, address, place_types
        else:
            logger.warning(f"[VALIDATOR] Maps API returned: {data.get('status')}")
            return False, "", []
    except Exception as e:
        logger.error(f"[VALIDATOR] Google Maps call failed: {e}")
        return True, f"{lat}, {lng}", []  # Fail open


async def check_semantic_location_mismatch(
    category: str,
    place_types: list[str],
    address: str,
    ai_description: str = "",
) -> dict:
    """
    Layer 1 — Semantic Check: Interrogate whether the reported category
    makes contextual sense for the location type.

    e.g. Pothole on a highway? Plausible.
         Pothole in a lake/park? Flag for review.
         Water leak on a highway? Suspicious.

    Uses Gemini when place types suggest an unusual mismatch.
    Returns: { "flagged": bool, "reason": str, "confidence": float }
    """
    # Quick rule-based checks before calling Gemini
    HIGHWAY_TYPES = {"route", "highway", "expressway"}
    WATER_BODY_TYPES = {"natural_feature", "park", "establishment"}

    flagged_fast = False
    fast_reason = ""

    if category in ("water_leak", "drainage") and any(t in HIGHWAY_TYPES for t in place_types):
        flagged_fast = True
        fast_reason = f"Water/drainage issue reported on highway-type location ({place_types[:3]})"

    if category == "streetlight" and "park" in place_types:
        pass  # Parks have streetlights — valid

    if flagged_fast:
        logger.warning(f"[VALIDATOR] Semantic mismatch (rule): {fast_reason}")
        return {"flagged": True, "reason": fast_reason, "confidence": 0.75}

    # Gemini semantic interrogation for ambiguous cases
    if not settings.gemini_api_key:
        return {"flagged": False, "reason": "", "confidence": 1.0}

    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = f"""
You are a civic report auditor. Determine if this report is contextually plausible.

Reported issue category: {category}
Location address: {address}
Google Maps place types at this location: {place_types}
AI description of image: {ai_description or 'Not provided'}

Question: Is it plausible that a "{category}" issue exists at this type of location?
Consider real-world context. For example, potholes are common on roads but not in lakes.

Respond with JSON only:
{{"plausible": true/false, "reason": "one sentence", "confidence": 0.0-1.0}}
"""
        response = model.generate_content(prompt)
        import json, re
        raw = response.text.strip()
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            flagged = not result.get("plausible", True)
            if flagged:
                logger.warning(f"[VALIDATOR] Semantic mismatch (Gemini): {result.get('reason')}")
            return {
                "flagged": flagged,
                "reason": result.get("reason", ""),
                "confidence": result.get("confidence", 0.8),
            }
    except Exception as e:
        logger.warning(f"[VALIDATOR] Semantic check Gemini failed: {e}")

    return {"flagged": False, "reason": "", "confidence": 1.0}


async def find_nearby_issues_firestore(
    lat: float, lng: float, category: str, radius_m: float = None
) -> list[dict]:
    """
    Query Firestore for open issues within radius_m meters.
    Note: Firestore doesn't support native geo queries, so we query a bounding box
    and filter in Python.
    """
    radius_m = radius_m or settings.duplicate_radius_meters

    # Approximate lat/lng degree offsets for radius
    lat_offset = radius_m / 111000
    lng_offset = radius_m / (111000 * math.cos(math.radians(lat)))

    db = get_firestore_client()
    try:
        query = (
            db.collection("issues")
            .where("status", "not-in", ["resolved", "closed", "rejected"])
            .where("lat", ">=", lat - lat_offset)
            .where("lat", "<=", lat + lat_offset)
        )
        docs = query.stream()

        nearby = []
        for doc in docs:
            data = doc.to_dict()
            d_lat = data.get("lat", 0)
            d_lng = data.get("lng", 0)
            dist = haversine_distance(lat, lng, d_lat, d_lng)

            if dist <= radius_m:
                nearby.append({
                    "issue_id": doc.id,
                    "distance_m": round(dist, 1),
                    "category": data.get("category"),
                    "image_url": data.get("image_url", ""),
                    "status": data.get("status"),
                })

        logger.info(f"[VALIDATOR] Found {len(nearby)} nearby issues within {radius_m}m")
        return nearby

    except Exception as e:
        logger.error(f"[VALIDATOR] Firestore geo-query failed: {e}")
        return []


async def check_visual_duplicate(
    image_url: str, nearby_issues: list[dict]
) -> tuple[bool, str | None]:
    """
    Use PixelRAG to detect visual duplicates by comparing image embeddings.
    Returns (is_duplicate, duplicate_issue_id).
    """
    if not nearby_issues:
        return False, None

    try:
        from services.pixel_rag import query_visual_similarity

        match = await query_visual_similarity(
            image_url=image_url,
            threshold=settings.duplicate_visual_threshold,
            top_k=3
        )

        if match:
            logger.info(f"[VALIDATOR] Visual duplicate found: {match}")
            return True, match
        return False, None

    except Exception as e:
        logger.warning(f"[VALIDATOR] PixelRAG check failed: {e}. Skipping visual check.")
        return False, None


async def run_validator_agent(state: dict) -> dict:
    """
    Validator Agent node for LangGraph.
    
    Validates the report through:
    1. Google Maps geo-verification
    2. Firestore nearby issue search
    3. PixelRAG visual duplicate check
    4. Trust-based spam detection
    """
    logger.info(f"[VALIDATOR] Validating issue {state['issue_id']}")

    lat = state["lat"]
    lng = state["lng"]
    category = state.get("category", "other")
    image_url = state["image_url"]
    user_trust_score = state.get("user_trust_score", 0.5)

    # ── Step 1: Geo-verification + place type extraction ────────
    geo_valid, geo_address, place_types = await verify_location_with_google_maps(lat, lng)

    if not geo_valid:
        logger.warning("[VALIDATOR] Location invalid")
        return {
            **state,
            "validation_result": "INVALID",
            "geo_verified": False,
            "status": "validation_failed_geo",
        }

    # ── Step 1.5: Semantic location-category mismatch check ──────
    semantic = await check_semantic_location_mismatch(
        category=category,
        place_types=place_types,
        address=geo_address,
        ai_description=state.get("ai_description", ""),
    )
    semantic_flagged = semantic.get("flagged", False)
    if semantic_flagged:
        logger.warning(f"[VALIDATOR] Semantic flag: {semantic.get('reason')}")
        # Flag for HITL but don't block — human decides
        state = {**state, "semantic_flag": True, "semantic_flag_reason": semantic.get("reason")}

    # ── Step 2: Nearby issue search ──────────────────────────────
    nearby_issues = await find_nearby_issues_firestore(lat, lng, category)

    # If same category nearby issue exists, check visual similarity
    same_category_nearby = [i for i in nearby_issues if i["category"] == category]

    # ── Step 3: Visual duplicate detection ──────────────────────
    is_visual_dup, dup_issue_id = False, None
    if same_category_nearby:
        is_visual_dup, dup_issue_id = await check_visual_duplicate(image_url, same_category_nearby)

    if is_visual_dup:
        return {
            **state,
            "validation_result": "DUPLICATE",
            "duplicate_of": dup_issue_id,
            "geo_verified": True,
            "geo_address": geo_address,
            "status": "duplicate_detected",
        }

    # ── Step 4: Spam heuristics ──────────────────────────────────
    # Very low trust + many nearby reports = possible spam
    if user_trust_score < 0.2 and len(nearby_issues) > 5:
        logger.warning(f"[VALIDATOR] Spam suspected: trust={user_trust_score}")
        try:
            from services.scoring_engine import update_user_credibility
            from services.firestore_client import get_firestore_client
            await update_user_credibility(state["user_id"], "SPAM", db=get_firestore_client())
        except Exception as e:
            logger.warning(f"[VALIDATOR] Credibility SPAM update failed: {e}")
        return {
            **state,
            "validation_result": "SPAM",
            "geo_verified": True,
            "geo_address": geo_address,
            "status": "spam_suspected",
        }

    # ── All checks passed ────────────────────────────────────────
    logger.info(f"[VALIDATOR] Issue VALID — address: {geo_address}")

    # ── Urgency Weight Computation ───────────────────────────────
    urgency_weight = None
    try:
        from services.scoring_engine import compute_urgency_weight, update_user_credibility
        from services.firestore_client import get_firestore_client

        urgency_weight = compute_urgency_weight(
            severity=state.get("severity", 1),
            upvotes=0,
            verified_count=0,
            created_at=None,
            user_trust_score=user_trust_score,
        )
        logger.info(f"[VALIDATOR] Urgency weight: {urgency_weight}")

        # Update credibility: valid report
        await update_user_credibility(state["user_id"], "VALID", db=get_firestore_client())
    except Exception as e:
        logger.warning(f"[VALIDATOR] Scoring engine failed: {e}")

    return {
        **state,
        "validation_result": "VALID",
        "geo_verified": True,
        "geo_address": geo_address,
        "status": "validation_passed",
        "urgency_weight": urgency_weight,
    }
