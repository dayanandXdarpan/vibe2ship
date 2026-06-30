"""
Secret Manager Service — Secure API Key Management

Replaces hardcoded environment variable reads with Google Cloud Secret Manager.
In production: all secrets fetched from Secret Manager at runtime.
In development: falls back to .env file values.
"""
import logging
from functools import lru_cache
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_sm_client = None


def get_sm_client():
    """Lazy-init Secret Manager client."""
    global _sm_client
    if _sm_client is None:
        try:
            from google.cloud import secretmanager
            _sm_client = secretmanager.SecretManagerServiceClient()
            logger.info("[SECRET_MANAGER] Client initialized")
        except Exception as e:
            logger.warning(f"[SECRET_MANAGER] Unavailable: {e}. Using .env fallback.")
    return _sm_client


def access_secret(secret_id: str, version: str = "latest") -> str | None:
    """
    Access a secret value from Google Secret Manager.
    Returns None if Secret Manager is unavailable (falls through to .env).
    """
    client = get_sm_client()
    if client is None:
        return None

    if not settings.google_cloud_project:
        return None

    try:
        name = f"projects/{settings.google_cloud_project}/secrets/{secret_id}/versions/{version}"
        response = client.access_secret_version(request={"name": name})
        value = response.payload.data.decode("utf-8").strip()
        logger.info(f"[SECRET_MANAGER] Loaded secret: {secret_id}")
        return value
    except Exception as e:
        logger.warning(f"[SECRET_MANAGER] Failed to load {secret_id}: {e}")
        return None


# ─────────────────────────────────────────────
# Named secret accessors with .env fallback
# ─────────────────────────────────────────────

@lru_cache(maxsize=None)
def get_gemini_api_key() -> str:
    """Get Gemini API key — Secret Manager → .env fallback."""
    return access_secret("GEMINI_API_KEY") or settings.gemini_api_key


@lru_cache(maxsize=None)
def get_google_maps_api_key() -> str:
    """Get Google Maps API key — Secret Manager → .env fallback."""
    return access_secret("GOOGLE_MAPS_API_KEY") or settings.google_maps_api_key


@lru_cache(maxsize=None)
def get_mem0_api_key() -> str:
    """Get Mem0 API key — Secret Manager → .env fallback."""
    return access_secret("MEM0_API_KEY") or settings.mem0_api_key


@lru_cache(maxsize=None)
def get_firebase_service_account() -> dict | None:
    """Get Firebase service account JSON from Secret Manager."""
    import json
    secret_json = access_secret("FIREBASE_SERVICE_ACCOUNT_JSON")
    if secret_json:
        return json.loads(secret_json)
    return None  # Falls back to file-based auth
