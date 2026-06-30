"""
Proof-of-Resolution Agent — Before/After Gemini Vision Comparison

When a municipal authority marks an issue as "Resolved" and uploads an
after-photo, this agent:

1. Downloads both the original (before) image and the resolution (after) image
2. Sends both to Gemini 1.5 Pro Vision for comparative analysis
3. Returns a structured verdict: RESOLVED | PARTIAL | UNRESOLVED
4. If UNRESOLVED: keeps the ticket open and generates a feedback note

This closes the accountability loop — "Resolved" means AI-verified.
"""
import logging
import base64
import httpx
import json
import re
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

COMPARISON_PROMPT = """
You are a civic infrastructure quality inspector performing a before/after verification.

You have been given TWO images:
- IMAGE 1 (BEFORE): The original issue reported by a citizen
- IMAGE 2 (AFTER): A photo submitted by a municipal worker as proof of resolution

Your task is to determine whether the issue visible in IMAGE 1 has been adequately resolved in IMAGE 2.

Evaluate the following:
1. Is the same location/infrastructure visible in both images?
2. Is the specific issue (e.g., pothole, water leak, broken streetlight) visibly fixed?
3. Are there any remaining signs of the original problem?

Respond with EXACTLY this JSON structure and nothing else:
{
  "verdict": "<RESOLVED | PARTIAL | UNRESOLVED>",
  "confidence": <float 0.0-1.0>,
  "same_location": <true | false>,
  "issue_fixed": <true | false>,
  "remaining_issues": "<description of any remaining problems, or empty string>",
  "verification_note": "<one sentence summary for the public audit trail>",
  "quality_score": <integer 1-5 where 5 is fully resolved>
}

RESOLVED = issue is fully fixed, same location confirmed
PARTIAL = work started but issue not fully resolved
UNRESOLVED = no visible improvement, or location mismatch suspected
"""


async def fetch_image_base64(url: str) -> tuple[str, str]:
    """Download image and return (base64_data, mime_type)."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        content_type = resp.headers.get("content-type", "image/jpeg")
        if "png" in content_type:
            mime = "image/png"
        elif "webp" in content_type:
            mime = "image/webp"
        else:
            mime = "image/jpeg"
        return base64.b64encode(resp.content).decode("utf-8"), mime
    except Exception as e:
        logger.error(f"[PROOF] Image download failed ({url}): {e}")
        return "", "image/jpeg"


async def verify_resolution_proof(
    issue_id: str,
    before_image_url: str,
    after_image_url: str,
    category: str = "unknown",
    original_description: str = "",
) -> dict:
    """
    Core function: Compare before and after images using Gemini Vision.

    Returns:
    {
        "verdict": "RESOLVED" | "PARTIAL" | "UNRESOLVED",
        "confidence": float,
        "same_location": bool,
        "issue_fixed": bool,
        "remaining_issues": str,
        "verification_note": str,
        "quality_score": int (1-5),
        "ai_verified": bool,
        "error": str | None,
    }
    """
    logger.info(f"[PROOF] Verifying resolution for issue {issue_id}")

    if not settings.gemini_api_key:
        logger.warning("[PROOF] No Gemini API key — skipping visual verification")
        return _fallback_result("No AI key configured — manual verification required")

    if not before_image_url or not after_image_url:
        return _fallback_result("Missing before or after image URL")

    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)

        # Download both images
        before_b64, before_mime = await fetch_image_base64(before_image_url)
        after_b64, after_mime = await fetch_image_base64(after_image_url)

        if not before_b64 or not after_b64:
            return _fallback_result("Could not download one or both images")

        model = genai.GenerativeModel("gemini-1.5-pro")

        # Build multimodal prompt with both images
        prompt_parts = [
            COMPARISON_PROMPT,
            f"\nOriginal issue category: {category}",
            f"Original citizen description: {original_description or 'Not provided'}",
            "\n\n--- IMAGE 1 (BEFORE — original issue) ---",
            {"mime_type": before_mime, "data": before_b64},
            "\n\n--- IMAGE 2 (AFTER — resolution proof) ---",
            {"mime_type": after_mime, "data": after_b64},
        ]

        response = model.generate_content(prompt_parts)
        raw = response.text.strip()
        logger.info(f"[PROOF] Gemini response: {raw[:200]}")

        # Parse JSON
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not json_match:
            return _fallback_result(f"Gemini returned non-JSON: {raw[:100]}")

        result = json.loads(json_match.group())

        return {
            "verdict": result.get("verdict", "UNRESOLVED"),
            "confidence": float(result.get("confidence", 0.5)),
            "same_location": bool(result.get("same_location", False)),
            "issue_fixed": bool(result.get("issue_fixed", False)),
            "remaining_issues": result.get("remaining_issues", ""),
            "verification_note": result.get("verification_note", ""),
            "quality_score": int(result.get("quality_score", 1)),
            "ai_verified": True,
            "error": None,
        }

    except json.JSONDecodeError as e:
        logger.error(f"[PROOF] JSON parse error: {e}")
        return _fallback_result(f"AI response parse error: {str(e)}")
    except Exception as e:
        logger.error(f"[PROOF] Gemini call failed: {e}")
        return _fallback_result(f"AI verification error: {str(e)}")


def _fallback_result(reason: str) -> dict:
    """Return a safe fallback when AI verification fails."""
    return {
        "verdict": "UNVERIFIED",
        "confidence": 0.0,
        "same_location": None,
        "issue_fixed": None,
        "remaining_issues": "",
        "verification_note": reason,
        "quality_score": 0,
        "ai_verified": False,
        "error": reason,
    }
