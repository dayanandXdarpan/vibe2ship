"""
Reporter Agent — Multimodal Vision Analysis

Uses Gemini 1.5 Pro Vision via Vertex AI to analyze issue images/videos.
Classifies category, severity, confidence, and generates descriptions.
"""
import logging
import json
import base64
import httpx
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Issue category definitions for AI prompt
ISSUE_CATEGORIES = {
    "pothole": {"dept": "PWD", "base_sla": 72},
    "streetlight": {"dept": "BESCOM", "base_sla": 48},
    "water_leak": {"dept": "BWSSB", "base_sla": 24},
    "garbage": {"dept": "BBMP_SWM", "base_sla": 24},
    "graffiti": {"dept": "BBMP_CIVIL", "base_sla": 168},
    "road_damage": {"dept": "PWD", "base_sla": 96},
    "drainage": {"dept": "BWSSB", "base_sla": 48},
    "tree_hazard": {"dept": "BBMP_HORT", "base_sla": 24},
    "encroachment": {"dept": "BBMP_ENGG", "base_sla": 120},
    "other": {"dept": "BBMP_GENERAL", "base_sla": 120},
}

ANALYSIS_PROMPT = """
You are an AI system for a civic issue reporting platform. Analyze this image of a community infrastructure problem.

Analyze the image for any Personally Identifiable Information (PII) such as human faces, car license plates, or specific residential house/flat numbers. If detected, set `pii_detected` to true and describe what needs to be blurred/masked in `pii_flagged_details` so that a blurring library or human reviewer can mask it in production.

Return a JSON response with EXACTLY these fields:
{
  "category": "<one of: pothole, streetlight, water_leak, garbage, graffiti, road_damage, drainage, tree_hazard, encroachment, other>",
  "severity": <integer 1-5 where 1=minor, 5=critical emergency>,
  "confidence": <float 0.0-1.0 indicating your confidence in this classification>,
  "description": "<clear, factual 1-2 sentence description of the issue visible in the image>",
  "tags": ["<relevant tag1>", "<relevant tag2>"],
  "safety_risk": <boolean, true if there is immediate public safety risk>,
  "suggested_dept": "<government department abbreviation>",
  "needs_clarification": <boolean, true if image is too blurry or unclear to classify>,
  "clarification_reason": "<if needs_clarification is true, explain what is unclear>",
  "pii_detected": <boolean, true if any faces, car license plates, or visible residential numbers are present in the image>,
  "pii_flagged_details": "<short description of PII detected for blurring, or null>"
}

USER DESCRIPTION (if provided): {user_description}

Respond ONLY with valid JSON. No markdown, no explanation.
"""


async def fetch_image_as_base64(image_url: str) -> tuple[str, str]:
    """Download image from URL and return as base64 string with mime type."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(image_url)
        response.raise_for_status()

    content_type = response.headers.get("content-type", "image/jpeg")
    # Normalize mime type
    if "jpeg" in content_type or "jpg" in content_type:
        mime_type = "image/jpeg"
    elif "png" in content_type:
        mime_type = "image/png"
    elif "webp" in content_type:
        mime_type = "image/webp"
    else:
        mime_type = "image/jpeg"

    b64_data = base64.b64encode(response.content).decode("utf-8")
    return b64_data, mime_type


async def analyze_with_gemini(image_url: str, user_description: str = None) -> dict:
    """
    Call Gemini 1.5 Flash Vision to analyze the issue image.
    Falls back to Gemini 1.5 Pro if Flash confidence is low (< 0.70) or if Flash fails.
    Enforces a 10-second timeout on each call and fails gracefully to manual triage.
    """
    import google.generativeai as genai
    import asyncio
    import json
    import re

    genai.configure(api_key=settings.gemini_api_key)

    prompt = ANALYSIS_PROMPT.format(
        user_description=user_description or "Not provided"
    )

    b64_data = ""
    mime_type = "image/jpeg"
    try:
        b64_data, mime_type = await fetch_image_as_base64(image_url)
    except Exception as e:
        logger.error(f"[REPORTER] Image download failed: {e}. Routing to manual triage.")
        return {
            "category": "other",
            "severity": 1,
            "confidence": 0.0,
            "description": "Requires Human Triage: Image download failed.",
            "tags": ["error", "download_failed", "fallback_triage"],
            "safety_risk": False,
            "suggested_dept": "BBMP_GENERAL",
            "needs_clarification": False,
            "clarification_reason": f"Image download error: {str(e)}",
            "pii_detected": False,
            "pii_flagged_details": None,
            "fallback_triage": True
        }

    def clean_and_parse_json(text: str) -> dict:
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        return json.loads(text)

    # 1. Try Gemini 1.5 Flash first
    try:
        logger.info("[REPORTER] Trying primary model: gemini-1.5-flash")
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = await asyncio.wait_for(
            model.generate_content_async([
                {"mime_type": mime_type, "data": b64_data},
                prompt
            ]),
            timeout=10.0
        )
        result = clean_and_parse_json(response.text)
        confidence = float(result.get("confidence", 0.0))
        
        if confidence >= 0.70 and not result.get("needs_clarification"):
            logger.info(f"[REPORTER] Gemini 1.5 Flash succeeded with high confidence: {confidence:.2f}")
            return result
        else:
            logger.info(f"[REPORTER] Gemini 1.5 Flash confidence low ({confidence:.2f}) — escalating to Pro")
    except Exception as e:
        logger.warning(f"[REPORTER] Gemini 1.5 Flash failed: {e} — falling back to Pro")

    # 2. Fallback/Escalate to Gemini 1.5 Pro
    try:
        logger.info("[REPORTER] Running fallback/escalated model: gemini-1.5-pro")
        model = genai.GenerativeModel("gemini-1.5-pro")
        response = await asyncio.wait_for(
            model.generate_content_async([
                {"mime_type": mime_type, "data": b64_data},
                prompt
            ]),
            timeout=10.0
        )
        return clean_and_parse_json(response.text)
    except asyncio.TimeoutError:
        logger.error("[REPORTER] Gemini analysis timed out (10s limit). Routing to manual triage.")
        return {
            "category": "other",
            "severity": 1,
            "confidence": 0.0,
            "description": "Requires Human Triage: AI analysis timed out.",
            "tags": ["timeout", "fallback_triage"],
            "safety_risk": False,
            "suggested_dept": "BBMP_GENERAL",
            "needs_clarification": False,
            "clarification_reason": "Gemini API timed out after 10 seconds",
            "pii_detected": False,
            "pii_flagged_details": None,
            "fallback_triage": True
        }
    except Exception as e:
        logger.error(f"[REPORTER] Gemini analysis failed: {e}. Routing to manual triage.")
        return {
            "category": "other",
            "severity": 1,
            "confidence": 0.0,
            "description": f"Requires Human Triage: AI analysis failed ({str(e)[:50]}).",
            "tags": ["error", "fallback_triage"],
            "safety_risk": False,
            "suggested_dept": "BBMP_GENERAL",
            "needs_clarification": False,
            "clarification_reason": f"AI analysis error: {str(e)}",
            "pii_detected": False,
            "pii_flagged_details": None,
            "fallback_triage": True
        }


VOICE_TRANSCRIPTION_PROMPT = """
You are a multilingual transcription assistant for a civic issue reporting platform.
The user has submitted a voice note (possibly in Hindi, Marathi, Tamil, Telugu, Bengali, or English).

Your tasks:
1. Transcribe the audio to text (maintain meaning, not verbatim if unclear)
2. Translate to English if not already in English
3. Extract the core civic issue description from the speech

Respond with ONLY valid JSON:
{
  "transcription": "<original text in source language>",
  "english_translation": "<English translation of what was said>",
  "detected_language": "<language code: en/hi/mr/ta/te/bn>",
  "issue_summary": "<1-2 sentence summary of the civic issue described>"
}
"""


async def transcribe_voice_note(audio_b64: str, mime_type: str = "audio/webm") -> str:
    """
    Transcribe a voice note using Gemini multimodal.
    Returns the English translation/summary of what the user said.
    """
    import google.generativeai as genai
    import json

    genai.configure(api_key=settings.gemini_api_key)

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content([
            VOICE_TRANSCRIPTION_PROMPT,
            {"mime_type": mime_type, "data": audio_b64},
        ])

        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = json.loads(raw)
        transcription = result.get("issue_summary") or result.get("english_translation", "")
        lang = result.get("detected_language", "en")
        logger.info(f"[REPORTER] Voice note transcribed ({lang}): {transcription[:80]}")
        return transcription

    except Exception as e:
        logger.warning(f"[REPORTER] Voice transcription failed: {e}")
        return ""


async def run_reporter_agent(state: dict) -> dict:
    """
    Reporter Agent node for LangGraph.
    
    Analyzes the issue image with Gemini Vision and populates
    category, severity, confidence, description fields in state.
    """
    logger.info(f"[REPORTER] Starting analysis for issue {state['issue_id']}")

    try:
        # ── Voice Note Transcription ─────────────────────────────
        combined_description = state.get("user_description", "") or ""
        voice_note_b64 = state.get("voice_note_b64")
        if voice_note_b64:
            voice_note_mime = state.get("voice_note_mime", "audio/webm")
            transcription = await transcribe_voice_note(voice_note_b64, voice_note_mime)
            if transcription:
                if combined_description:
                    combined_description = f"{combined_description}. Voice note: {transcription}"
                else:
                    combined_description = transcription
                logger.info(f"[REPORTER] Voice note merged into description")

        analysis = await analyze_with_gemini(
            image_url=state["image_url"],
            user_description=combined_description or None
        )

        category = analysis.get("category", "other")
        category_info = ISSUE_CATEGORIES.get(category, ISSUE_CATEGORIES["other"])

        # Auto-boost severity if safety risk detected
        severity = analysis.get("severity", 1)
        if analysis.get("safety_risk") and severity < 4:
            severity = max(severity, 4)
            logger.info(f"[REPORTER] Safety risk detected — severity auto-boosted to {severity}")

        result = {
            **state,
            "category": category,
            "severity": severity,
            "confidence": analysis.get("confidence", 0.0),
            "ai_description": analysis.get("description", ""),
            "tags": analysis.get("tags", []),
            "suggested_dept": analysis.get("suggested_dept", category_info["dept"]),
            "pii_detected": analysis.get("pii_detected", False),
            "pii_flagged_details": analysis.get("pii_flagged_details"),
            "fallback_triage": analysis.get("fallback_triage", False),
            "status": "reporter_complete",
        }

        logger.info(
            f"[REPORTER] Done — category={category}, "
            f"severity={severity}, confidence={result['confidence']:.2f}, "
            f"pii={result['pii_detected']}, fallback={result['fallback_triage']}"
        )
        return result

    except Exception as e:
        logger.error(f"[REPORTER] Unexpected error: {e}")
        return {
            **state,
            "confidence": 0.0,
            "error": str(e),
            "fallback_triage": True,
            "status": "reporter_error",
        }
