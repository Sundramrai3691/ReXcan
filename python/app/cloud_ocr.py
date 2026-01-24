# python/app/cloud_ocr.py
import time
import base64
import hashlib
import json
import os
from pathlib import Path
from typing import Dict, Any, Optional

try:
    from google.cloud import documentai_v1 as documentai
    from google.api_core.client_options import ClientOptions
    DOCAI_AVAILABLE = True
except ImportError:
    DOCAI_AVAILABLE = False

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Use your processor details
# Either set these from env or hardcode (env recommended)
PROJECT_ID = os.getenv("GCP_PROJECT_ID", "285541154429")
LOCATION = os.getenv("GCP_LOCATION", "us")
PROCESSOR_ID = os.getenv("GCP_PROCESSOR_ID", "31a03f923e64708c")
# API endpoint base for us
API_ENDPOINT = os.getenv("GCP_DOCAI_API_ENDPOINT", "us-documentai.googleapis.com")

# Full resource name: projects/{project}/locations/{location}/processors/{processor}
PROCESSOR_NAME = f"projects/{PROJECT_ID}/locations/{LOCATION}/processors/{PROCESSOR_ID}"

def _cache_path_for_bytes(b: bytes) -> Path:
    h = hashlib.sha256(b).hexdigest()
    return CACHE_DIR / f"docai_{h}.json"

def _save_cache(path: Path, data: Dict[str, Any]):
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)

def _load_cache(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

def call_document_ai(pdf_bytes: bytes, mime_type: str = "application/pdf", use_cache: bool = True) -> Optional[Dict[str, Any]]:
    """
    Call Document AI processor and return structured output.

    Returns dict:
      {
        "text": "full extracted text",
        "entities": [ {"type": "...", "text": "...", "confidence": 0.98}, ... ],
        "pages": [ { "page_number": int, "blocks": [...] }, ... ],
        "timings": {"start":..., "total":...},
        "raw_response": <small parsed form>  # optional
      }
    """
    if not DOCAI_AVAILABLE:
        print("  ⚠️  Document AI not available (google-cloud-documentai not installed)")
        return None
    
    cache_path = _cache_path_for_bytes(pdf_bytes)
    if use_cache:
        cached = _load_cache(cache_path)
        if cached:
            cached["timings"] = cached.get("timings", {})
            cached["timings"]["cached"] = True
            return cached

    start = time.time()
    try:
        client_options = ClientOptions(api_endpoint=API_ENDPOINT)
        client = documentai.DocumentProcessorServiceClient(client_options=client_options)

        # Build request
        raw_doc = documentai.RawDocument(content=pdf_bytes, mime_type=mime_type)
        request = documentai.ProcessRequest(name=PROCESSOR_NAME, raw_document=raw_doc)

        # Execute
        result = client.process_document(request=request)
    except Exception as e:
        print(f"  ✗ Document AI call failed: {str(e)[:100]}")
        return None

    end = time.time()
    doc = result.document

    # Assemble plain text
    full_text = doc.text or ""

    # Collect entities (if processor extracts entities)
    entities = []
    # Document AI uses document.entities with field_type and mention_text
    for ent in getattr(doc, "entities", []) or []:
        entities.append({
            "type": ent.type_ if hasattr(ent, "type_") else getattr(ent, "type", None),
            "text": getattr(ent, "mention_text", None) if hasattr(ent, "mention_text") else getattr(ent, "text", None),
            "confidence": getattr(ent, "confidence", None)
        })

    # Basic page/block parsing: flatten pages -> layout text segments
    pages = []
    for p_idx, page in enumerate(doc.pages or []):
        blocks = []
        for block in page.layout.blocks or []:
            block_text = ""
            for p in block.paragraphs or []:
                for w in p.layout.text_anchor.text_segments or []:
                    # text segment indices map into document.text
                    start_idx = int(w.start_index or 0)
                    end_idx = int(w.end_index or 0)
                    block_text += full_text[start_idx:end_idx]
            bbox = None
            if block.layout.bounding_poly and block.layout.bounding_poly.normalized_vertices:
                bbox = [(v.x, v.y) for v in block.layout.bounding_poly.normalized_vertices]
            blocks.append({"text": block_text.strip(), "bbox_norm": bbox})
        pages.append({"page_number": p_idx + 1, "blocks": blocks})

    out = {
        "text": full_text,
        "entities": entities,
        "pages": pages,
        "timings": {"start": start, "total": end - start},
        # Do not store full raw response in cache in prod; for debugging it's fine.
        "raw_response_summary": {
            "entity_count": len(entities),
            "page_count": len(pages)
        }
    }

    # cache
    try:
        _save_cache(cache_path, out)
    except Exception:
        pass

    return out

