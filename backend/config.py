"""
Configuration management for Prastab backend.
Loads environment variables and provides typed settings.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Google Cloud
    google_cloud_project: str = ""
    google_cloud_region: str = "us-central1"
    vertex_ai_location: str = "us-central1"
    gemini_api_key: str = ""

    # Firebase
    firebase_service_account_path: str = "./firebase-service-account.json"
    firestore_database_id: str = "(default)"

    # Google Cloud Storage
    gcs_bucket_name: str = "community-hero-media"

    # Google Maps
    google_maps_api_key: str = ""

    # ChromaDB
    chroma_persist_dir: str = "./chroma_db"
    chroma_host: str = "localhost"
    chroma_port: int = 8000

    # Mem0
    mem0_api_key: str = ""

    # App Config
    app_env: str = "development"
    backend_cors_origins: str = "http://localhost:5173"
    max_retry_attempts: int = 3
    confidence_high_threshold: float = 0.80
    confidence_low_threshold: float = 0.65
    duplicate_radius_meters: float = 150.0
    duplicate_visual_threshold: float = 0.88

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
