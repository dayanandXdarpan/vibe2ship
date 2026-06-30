"""
Prastab Backend — FastAPI Application Entry Point

Startup sequence:
1. Load secrets (Secret Manager → .env fallback)
2. Initialize Firebase Admin SDK
3. Mount API routes
4. Start Uvicorn server
"""
import logging
import uvicorn
from api.routes import app  # noqa — imports FastAPI instance

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
        log_level="info",
    )
