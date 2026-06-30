"""
PixelRAG Service — Visual Duplicate Detection

Embeds issue images using Vertex AI multimodal embeddings
and stores/queries them in ChromaDB for similarity matching.
"""
import logging
import base64
import httpx
import chromadb
from chromadb.config import Settings as ChromaSettings
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

COLLECTION_NAME = "issue_images"
_chroma_client = None
_collection = None


def get_chroma_client():
    global _chroma_client, _collection
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False)
        )
        _collection = _chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"}
        )
        logger.info(f"[PIXEL_RAG] ChromaDB collection '{COLLECTION_NAME}' ready")
    return _chroma_client, _collection


async def get_image_embedding(image_url: str) -> list[float]:
    """
    Generate image embedding using Vertex AI multimodal embedding model.
    Falls back to a hash-based pseudo-embedding for dev without GCP.
    """
    try:
        import vertexai
        from vertexai.vision_models import MultiModalEmbeddingModel, Image

        vertexai.init(
            project=settings.google_cloud_project,
            location=settings.vertex_ai_location
        )
        model = MultiModalEmbeddingModel.from_pretrained("multimodalembedding@001")

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(image_url)
        
        image = Image(image_bytes=resp.content)
        embeddings = model.get_embeddings(image=image)
        return embeddings.image_embedding

    except Exception as e:
        logger.warning(f"[PIXEL_RAG] Vertex AI embedding failed: {e}. Using fallback.")
        # Deterministic pseudo-embedding from URL hash (dev fallback)
        import hashlib
        hash_bytes = hashlib.sha256(image_url.encode()).digest()
        # Create 1408-dim normalized vector (matches multimodal embedding size)
        seed = int.from_bytes(hash_bytes[:4], "big")
        import random
        rng = random.Random(seed)
        raw = [rng.gauss(0, 1) for _ in range(1408)]
        norm = sum(x**2 for x in raw) ** 0.5
        return [x / norm for x in raw]


async def index_issue_image(issue_id: str, image_url: str, lat: float, lng: float) -> None:
    """
    Add a new issue image to the ChromaDB vector index.
    Called after an issue is confirmed as VALID.
    """
    _, collection = get_chroma_client()

    try:
        embedding = await get_image_embedding(image_url)
        collection.add(
            ids=[issue_id],
            embeddings=[embedding],
            metadatas=[{
                "issue_id": issue_id,
                "image_url": image_url,
                "lat": lat,
                "lng": lng,
            }]
        )
        logger.info(f"[PIXEL_RAG] Indexed image for issue {issue_id}")
    except Exception as e:
        logger.error(f"[PIXEL_RAG] Indexing failed for {issue_id}: {e}")


async def query_visual_similarity(
    image_url: str,
    threshold: float = None,
    top_k: int = 3
) -> str | None:
    """
    Query ChromaDB for visually similar issues.
    Returns the issue_id of the best match if above threshold, else None.
    """
    threshold = threshold or settings.duplicate_visual_threshold
    _, collection = get_chroma_client()

    if collection.count() == 0:
        logger.info("[PIXEL_RAG] Collection empty — no duplicates possible")
        return None

    try:
        embedding = await get_image_embedding(image_url)
        results = collection.query(
            query_embeddings=[embedding],
            n_results=min(top_k, collection.count()),
            include=["distances", "metadatas"]
        )

        distances = results.get("distances", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]

        if not distances:
            return None

        # ChromaDB cosine distance: 0 = identical, 2 = opposite
        # Similarity = 1 - distance
        best_similarity = 1 - distances[0]
        best_meta = metadatas[0] if metadatas else {}

        logger.info(f"[PIXEL_RAG] Best match similarity: {best_similarity:.3f} (threshold: {threshold})")

        if best_similarity >= threshold:
            return best_meta.get("issue_id")

        return None

    except Exception as e:
        logger.error(f"[PIXEL_RAG] Query failed: {e}")
        return None
