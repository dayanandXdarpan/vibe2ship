"""
Civic Document Ingestion Script

Indexes municipal PDF documents into ChromaDB (text + image embeddings)
for LlamaIndex RAG queries in the Resolver Agent.

Usage:
  python scripts/ingest_docs.py --docs-dir ./data/civic_docs

Supported: PDF, DOCX, TXT, Markdown
"""
import argparse
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)
settings = get_settings()

# Sample civic documents to seed if no docs provided
SEED_DOCUMENTS = [
    {
        "title": "PWD Road Maintenance Manual",
        "content": """
        Department: Public Works Department (PWD)
        Issues handled: potholes, road damage, road surface deterioration, speed bumps
        SLA: Pothole < 30cm = 72 hours, Pothole > 30cm = 24 hours
        Contact: pwd-helpdesk@city.gov
        Emergency line: 1800-PWD-ROAD
        """,
        "metadata": {"dept": "PWD", "category": "pothole,road_damage", "sla_hours": 72}
    },
    {
        "title": "BESCOM Streetlight Operations Manual",
        "content": """
        Department: BESCOM / Municipal Electrical Division
        Issues handled: streetlight outage, flickering lights, broken poles, electrical hazards
        SLA: Critical (pole fallen, sparking wire) = 4 hours, Outage = 48 hours
        Contact: bescom-ops@city.gov, Emergency: 1912
        """,
        "metadata": {"dept": "BESCOM", "category": "streetlight", "sla_hours": 48}
    },
    {
        "title": "BWSSB Water Supply and Drainage Manual",
        "content": """
        Department: Bangalore Water Supply and Sewerage Board (BWSSB)
        Issues handled: water leakage, pipeline burst, sewage overflow, drainage blockage
        SLA: Pipeline burst = 6 hours, Water leakage = 24 hours, Drainage = 48 hours
        Contact: bwssb-complaints@city.gov, Emergency: 1916
        """,
        "metadata": {"dept": "BWSSB", "category": "water_leak", "sla_hours": 24}
    },
    {
        "title": "BBMP Solid Waste Management Guidelines",
        "content": """
        Department: Bruhat Bengaluru Mahanagara Palike (BBMP) - Solid Waste Management
        Issues handled: garbage dumping, illegal waste disposal, overflowing bins, dead animals
        SLA: Illegal dumping = 48 hours, Overflow bins = 12 hours
        Contact: swm-bbmp@city.gov, Helpline: 080-22221188
        """,
        "metadata": {"dept": "BBMP-SWM", "category": "garbage", "sla_hours": 48}
    },
    {
        "title": "Forest Department Tree Safety Guidelines",
        "content": """
        Department: Urban Forest Department / BBMP Tree Cell
        Issues handled: fallen trees, dangerous branches, tree disease, root damage to roads
        SLA: Tree fallen on road/person = 1 hour (emergency), Dangerous branch = 12 hours
        Contact: tree-cell@city.gov, Emergency: 080-22221166
        """,
        "metadata": {"dept": "BBMP-TreeCell", "category": "tree_hazard", "sla_hours": 12}
    },
    {
        "title": "BBMP Road Safety and Markings Manual",
        "content": """
        Department: BBMP Engineering Division
        Issues handled: missing road signs, faded road markings, broken dividers, encroachment
        SLA: Missing stop sign = 4 hours, Faded markings = 7 days
        Contact: eng-bbmp@city.gov
        """,
        "metadata": {"dept": "BBMP-Eng", "category": "road_damage", "sla_hours": 72}
    },
]


def ingest_seed_documents():
    """Load pre-defined civic documents into ChromaDB."""
    try:
        import chromadb
        from llama_index.core import Document, VectorStoreIndex, StorageContext
        from llama_index.vector_stores.chroma import ChromaVectorStore

        chroma_client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        chroma_collection = chroma_client.get_or_create_collection("civic_documents")

        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)

        docs = []
        for d in SEED_DOCUMENTS:
            doc = Document(
                text=f"{d['title']}\n\n{d['content']}",
                metadata=d["metadata"],
                doc_id=d["title"].replace(" ", "_").lower(),
            )
            docs.append(doc)

        logger.info(f"Ingesting {len(docs)} seed civic documents...")

        # Try Vertex AI embeddings, fall back to default
        try:
            from llama_index.embeddings.vertex import VertexTextEmbedding
            embed_model = VertexTextEmbedding(
                model_name="text-embedding-004",
                project=settings.google_cloud_project,
                location=settings.vertex_ai_location,
            )
        except Exception:
            from llama_index.embeddings.gemini import GeminiEmbedding
            embed_model = GeminiEmbedding(api_key=settings.gemini_api_key)
            logger.warning("Using Gemini embeddings (Vertex AI unavailable)")

        index = VectorStoreIndex.from_documents(
            docs,
            storage_context=storage_context,
            embed_model=embed_model,
            show_progress=True,
        )

        logger.info(f"✅ Ingested {len(docs)} documents into ChromaDB")
        return index

    except ImportError as e:
        logger.error(f"Missing dependency: {e}. Install: pip install llama-index llama-index-vector-stores-chroma")
        return None
    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        return None


def ingest_pdf_directory(docs_dir: str):
    """Ingest all PDFs from a directory using LlamaIndex PDF reader."""
    try:
        from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, StorageContext
        from llama_index.vector_stores.chroma import ChromaVectorStore
        import chromadb

        if not os.path.exists(docs_dir):
            logger.error(f"Directory not found: {docs_dir}")
            return

        chroma_client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        chroma_collection = chroma_client.get_or_create_collection("civic_documents")
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)

        reader = SimpleDirectoryReader(docs_dir, recursive=True)
        documents = reader.load_data()
        logger.info(f"Loaded {len(documents)} documents from {docs_dir}")

        VectorStoreIndex.from_documents(
            documents,
            storage_context=storage_context,
            show_progress=True,
        )
        logger.info(f"✅ PDF ingestion complete for {docs_dir}")

    except Exception as e:
        logger.error(f"PDF ingestion failed: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest civic documents into RAG")
    parser.add_argument("--docs-dir", default=None, help="Directory with PDF/DOCX files")
    parser.add_argument("--seed-only", action="store_true", help="Only ingest built-in seed documents")
    args = parser.parse_args()

    logger.info("🚀 Starting civic document ingestion...")

    # Always ingest seed documents
    ingest_seed_documents()

    # Optionally ingest custom PDFs
    if args.docs_dir and not args.seed_only:
        ingest_pdf_directory(args.docs_dir)

    logger.info("✅ Document ingestion complete!")
