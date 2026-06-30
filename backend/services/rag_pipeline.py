"""
RAG Pipeline — LlamaIndex + ChromaDB for Civic Knowledge Base

Provides department routing and SLA lookup from pre-indexed
city manuals and municipal department documents.
"""
import logging
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

CIVIC_DOCS_COLLECTION = "civic_documents"
_query_engine = None


def build_query_engine():
    """Initialize LlamaIndex query engine with ChromaDB backend."""
    global _query_engine
    if _query_engine is not None:
        return _query_engine

    try:
        import chromadb
        from llama_index.core import VectorStoreIndex, StorageContext
        from llama_index.vector_stores.chroma import ChromaVectorStore
        from llama_index.embeddings.vertex import VertexTextEmbedding

        chroma_client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        chroma_collection = chroma_client.get_or_create_collection(CIVIC_DOCS_COLLECTION)

        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)

        # Use Vertex AI embeddings if available, otherwise fallback
        try:
            embed_model = VertexTextEmbedding(
                model_name="text-embedding-004",
                project=settings.google_cloud_project,
                location=settings.vertex_ai_location,
            )
        except Exception:
            from llama_index.embeddings.gemini import GeminiEmbedding
            embed_model = GeminiEmbedding(api_key=settings.gemini_api_key)

        index = VectorStoreIndex.from_vector_store(
            vector_store,
            storage_context=storage_context,
            embed_model=embed_model,
        )
        _query_engine = index.as_query_engine(similarity_top_k=3)
        logger.info("[RAG] Query engine initialized successfully")

    except Exception as e:
        logger.warning(f"[RAG] LlamaIndex setup failed: {e}. RAG will be unavailable.")
        _query_engine = None

    return _query_engine


async def query_civic_rag(query: str, top_k: int = 3) -> dict | None:
    """
    Query the civic knowledge base for department routing info.
    Returns a dict with dept, dept_full, sla_hours or None.
    """
    engine = build_query_engine()
    if engine is None:
        return None

    try:
        response = engine.query(
            f"Which department handles '{query}' issues? "
            f"What is the SLA in hours? Return: department name, full name, SLA hours."
        )
        raw = str(response).strip()
        logger.info(f"[RAG] Query result: {raw[:200]}")

        # Simple extraction — in production, structure with output parsers
        result = {"rag_response": raw}

        # Try to extract SLA
        import re
        sla_match = re.search(r"(\d+)\s*hours?", raw, re.IGNORECASE)
        if sla_match:
            result["sla_hours"] = int(sla_match.group(1))

        return result

    except Exception as e:
        logger.error(f"[RAG] Query failed: {e}")
        return None
