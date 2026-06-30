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
                from services.secret_manager import get_firebase_service_account
                import os

                secret_cred = get_firebase_service_account()
                if secret_cred:
                    cred = credentials.Certificate(secret_cred)
                    firebase_admin.initialize_app(cred)
                    logger.info("[FIRESTORE] Initialized with Secret Manager credentials")
                elif os.path.exists(settings.firebase_service_account_path):
                    cred = credentials.Certificate(settings.firebase_service_account_path)
                    firebase_admin.initialize_app(cred)
                    logger.info(f"[FIRESTORE] Initialized with certificate file: {settings.firebase_service_account_path}")
                else:
                    try:
                        firebase_admin.initialize_app()
                        logger.info("[FIRESTORE] Initialized with ambient credentials (auto-detect / ADC)")
                    except Exception as adc_err:
                        logger.warning(f"[FIRESTORE] ADC initialization failed: {adc_err}. Trying ApplicationDefault.")
                        cred = credentials.ApplicationDefault()
                        firebase_admin.initialize_app(cred)
                        logger.info("[FIRESTORE] Initialized with ApplicationDefault")
            _db = firestore.client()
            logger.info("[FIRESTORE] Client initialized successfully")
        except Exception as e:
            logger.error(f"[FIRESTORE] Init failed: {e}")
            raise
    return _db
