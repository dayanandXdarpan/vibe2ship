"""Firestore client singleton."""
import firebase_admin
from firebase_admin import credentials, firestore
from config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

_db = None


def get_firestore_client():
    global _db
    if _db is None:
        try:
            if not firebase_admin._apps:
                cred = credentials.Certificate(settings.firebase_service_account_path)
                firebase_admin.initialize_app(cred)
            _db = firestore.client()
            logger.info("[FIRESTORE] Client initialized")
        except Exception as e:
            logger.error(f"[FIRESTORE] Init failed: {e}")
            raise
    return _db
