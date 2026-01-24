"""Text extraction orchestration: pdfplumber + EasyOCR/Tesseract (primary) + Document AI fallback."""
import pdfplumber
import numpy as np
from pathlib import Path
from typing import List, Optional, Tuple
import warnings
import time
import hashlib
import json
from PIL import Image
from app.models import OCRBlock
from app.preprocess import pdf_to_images, preprocess_image
from app.ocr_engine import OCREngine
from app.text_reconstruction import merge_fragmented_words, clean_ocr_text
from app.utils import (
    get_cache_path, load_json, save_json, compute_file_sha256,
    compute_text_sha1, timeit
)
from app.cloud_ocr import call_document_ai, DOCAI_AVAILABLE
from app.retry import retry_ocr_call

# Suppress PIL decompression bomb warning
Image.MAX_IMAGE_PIXELS = None
warnings.filterwarnings('ignore', category=Image.DecompressionBombWarning)


def extract_with_pdfplumber(pdf_path: Path) -> List[OCRBlock]:
    """Extract text from PDF using pdfplumber (text-layer extraction).
    
    Args:
        pdf_path: Path to PDF file
    
    Returns:
        List of OCRBlock objects
    """
    blocks = []
    
    try:
        import pdfplumber
        
        with pdfplumber.open(str(pdf_path)) as pdf:
            num_pages = len(pdf.pages)
            for page_num, page in enumerate(pdf.pages, 1):
                # Try extracting text first to verify it's a text PDF
                page_text = page.extract_text()
                
                # Extract words with positions
                words = page.extract_words()
                
                if words and len(words) > 0:
                    # Group words into lines/blocks for better structure
                    current_line = []
                    current_y = None
                    line_threshold = 10  # Pixels
                    
                    for word in words:
                        # Ensure all required keys exist
                        if not all(k in word for k in ['text', 'x0', 'top', 'x1', 'bottom']):
                            continue
                        
                        word_y = (word['top'] + word['bottom']) / 2
                        word_text = str(word['text']).strip()
                        
                        if not word_text:
                            continue
                        
                        if current_y is None or abs(word_y - current_y) < line_threshold:
                            # Same line
                            current_line.append(word)
                            current_y = word_y
                        else:
                            # New line - save current line as block
                            if current_line:
                                try:
                                    block_text = " ".join([w['text'] for w in current_line])
                                    if block_text.strip():
                                        x0 = min(w['x0'] for w in current_line)
                                        top = min(w['top'] for w in current_line)
                                        x1 = max(w['x1'] for w in current_line)
                                        bottom = max(w['bottom'] for w in current_line)
                                        
                                        blocks.append(OCRBlock(
                                            text=block_text.strip(),
                                            bbox=[float(x0), float(top), float(x1), float(bottom)],
                                            confidence=0.95,  # High confidence for text-layer
                                            engine="pdfplumber"
                                        ))
                                except Exception:
                                    pass
                            
                            # Start new line
                            current_line = [word]
                            current_y = word_y
                    
                    # Save last line
                    if current_line:
                        try:
                            block_text = " ".join([w['text'] for w in current_line])
                            if block_text.strip():
                                x0 = min(w['x0'] for w in current_line)
                                top = min(w['top'] for w in current_line)
                                x1 = max(w['x1'] for w in current_line)
                                bottom = max(w['bottom'] for w in current_line)
                                
                                blocks.append(OCRBlock(
                                    text=block_text.strip(),
                                    bbox=[float(x0), float(top), float(x1), float(bottom)],
                                    confidence=0.95,
                                    engine="pdfplumber"
                                ))
                        except Exception:
                            pass
                
    except Exception as e:
        print(f"pdfplumber extraction failed: {e}")
        import traceback
        traceback.print_exc()
    
    return blocks


def extract_with_ocr(pdf_path: Path, ocr_engine: OCREngine, timeout: float = 8.0) -> List[OCRBlock]:
    """Extract text from PDF using OCR with timeout and LLM fallback.
    
    Args:
        pdf_path: Path to PDF file
        ocr_engine: Initialized OCR engine
        timeout: Maximum time for OCR (seconds)
    
    Returns:
        List of OCRBlock objects
    """
    all_blocks = []
    
    try:
        # Convert PDF to images with lower DPI for speed
        print("    → Converting PDF to images (150 DPI for speed)...", end="", flush=True)
        images = pdf_to_images(pdf_path, dpi=150)  # Lower DPI = faster
        print(f" ✓ ({len(images)} page(s))")
        
        # Parallelize OCR for multiple pages (if more than 1 page)
        if len(images) > 1:
            from concurrent.futures import ThreadPoolExecutor, as_completed
            def process_page(img_idx_pair):
                idx, img = img_idx_pair
                try:
                    processed = preprocess_image(img, mode="fast")
                    start = time.time()
                    tesseract_blocks = []
                    
                    if ocr_engine.use_tesseract:
                        try:
                            tesseract_blocks = ocr_engine.tesseract_extract(processed)
                            if len(tesseract_blocks) > 5:
                                tesseract_blocks = merge_fragmented_words(tesseract_blocks)
                        except Exception:
                            pass
                    
                    elapsed = time.time() - start
                    return (idx, tesseract_blocks, elapsed)
                except Exception as e:
                    return (idx, [], 0.0)
            
            # Process pages in parallel (max 3 workers to avoid overwhelming)
            with ThreadPoolExecutor(max_workers=min(3, len(images))) as executor:
                futures = {executor.submit(process_page, (i, img)): i for i, img in enumerate(images, 1)}
                results = {}
                for future in as_completed(futures):
                    idx, blocks, elapsed = future.result()
                    results[idx] = (blocks, elapsed)
                    print(f"    → Page {idx}/{len(images)}: {len(blocks)} blocks ({elapsed:.1f}s)", flush=True)
                    all_blocks.extend(blocks)
        else:
            # Single page - process normally
            for i, image in enumerate(images, 1):
                print(f"    → Processing page {i}/{len(images)}...", end="", flush=True)
                try:
                    import time
                    
                    # Use minimal preprocessing for speed
                    processed = preprocess_image(image, mode="fast")
                    
                    start = time.time()
                    tesseract_blocks = []
                    
                    # Try Tesseract with timeout (fastest) and retry logic
                    if ocr_engine.use_tesseract:
                        try:
                            # Use retry wrapper for robustness
                            tesseract_blocks = retry_ocr_call(
                                ocr_engine.tesseract_extract,
                                processed,
                                max_retries=2
                            ) or []
                            elapsed = time.time() - start
                            
                            if elapsed > timeout:
                                print(f" ⚠ Slow ({elapsed:.1f}s > {timeout}s)", flush=True)
                            elif len(tesseract_blocks) > 5:
                                tesseract_blocks = merge_fragmented_words(tesseract_blocks)
                                all_blocks.extend(tesseract_blocks)
                                print(f" ✓ Tesseract ({len(tesseract_blocks)} blocks, {elapsed:.1f}s)", flush=True)
                                continue
                        except Exception:
                            pass
                    
                    # If Tesseract failed or too slow, skip EasyOCR (it's even slower)
                    # Instead, return minimal blocks and let LLM handle it
                    if not tesseract_blocks or len(tesseract_blocks) <= 5:
                        print(f" ⚠ Low quality OCR, will use LLM fallback", flush=True)
                        # Return whatever we have, LLM will extract from image directly
                        if tesseract_blocks:
                            all_blocks.extend(tesseract_blocks)
                        
                except Exception as page_error:
                    print(f" ✗ (Error: {str(page_error)[:30]})", flush=True)
                    continue
    except Exception as e:
        print(f"\n    ✗ OCR extraction failed: {e}")
    
    return all_blocks


def _convert_docai_to_blocks(docai_result: dict, page_width: float = 1000, page_height: float = 1000) -> List[OCRBlock]:
    """Convert Document AI result to OCRBlock format.
    
    Args:
        docai_result: Document AI result dict
        page_width: Page width for bbox normalization (default 1000)
        page_height: Page height for bbox normalization (default 1000)
    
    Returns:
        List of OCRBlock objects
    """
    blocks = []
    
    # Extract from pages/blocks structure
    for page in docai_result.get("pages", []):
        for block_data in page.get("blocks", []):
            text = block_data.get("text", "").strip()
            if not text:
                continue
            
            # Get bbox (normalized 0-1 coordinates from Document AI)
            bbox_norm = block_data.get("bbox_norm")
            if bbox_norm and isinstance(bbox_norm, list) and len(bbox_norm) >= 2:
                # bbox_norm is list of [x, y] coordinates (normalized 0-1)
                # Find min/max x and y
                try:
                    if isinstance(bbox_norm[0], (list, tuple)):
                        # List of coordinate pairs
                        xs = [p[0] for p in bbox_norm if len(p) >= 2]
                        ys = [p[1] for p in bbox_norm if len(p) >= 2]
                        if xs and ys:
                            x0 = min(xs) * page_width
                            y0 = min(ys) * page_height
                            x1 = max(xs) * page_width
                            y1 = max(ys) * page_height
                            bbox = [float(x0), float(y0), float(x1), float(y1)]
                        else:
                            bbox = [0.0, 0.0, float(page_width), float(page_height)]
                    else:
                        # Flat list [x0, y0, x1, y1] normalized
                        if len(bbox_norm) >= 4:
                            bbox = [
                                float(bbox_norm[0] * page_width),
                                float(bbox_norm[1] * page_height),
                                float(bbox_norm[2] * page_width),
                                float(bbox_norm[3] * page_height)
                            ]
                        else:
                            bbox = [0.0, 0.0, float(page_width), float(page_height)]
                except (IndexError, TypeError, ValueError):
                    bbox = [0.0, 0.0, float(page_width), float(page_height)]
            else:
                # Default bbox if not available
                bbox = [0.0, 0.0, float(page_width), float(page_height)]
            
            blocks.append(OCRBlock(
                text=text,
                bbox=bbox,
                confidence=0.90,  # High confidence for Document AI
                engine="documentai"
            ))
    
    # If no structured blocks, create blocks from full text (split by lines)
    if not blocks and docai_result.get("text"):
        full_text = docai_result["text"]
        lines = [l.strip() for l in full_text.split('\n') if l.strip()]
        if lines:
            line_height = page_height / max(len(lines), 1)
            for i, line in enumerate(lines):
                y_pos = i * line_height
                blocks.append(OCRBlock(
                    text=line,
                    bbox=[0.0, float(y_pos), float(page_width), float(y_pos + line_height)],
                    confidence=0.90,
                    engine="documentai"
                ))
    
    return blocks


def extract_text(file_path: Path, ocr_engine: Optional[OCREngine] = None, use_cache: bool = True, log_callback: Optional[callable] = None) -> Tuple[List[OCRBlock], float]:
    """Orchestrate text extraction: pdfplumber → EasyOCR/Tesseract (primary) → Document AI fallback.
    
    Args:
        file_path: Path to PDF or image file
        ocr_engine: Optional OCR engine (will create if None)
        use_cache: Whether to use OCR cache
    
    Returns:
        (List of OCRBlock objects, elapsed_time)
    """
    file_path = Path(file_path)
    start_time = time.time()
    blocks = []
    
    # Check cache first
    if use_cache:
        file_hash = compute_file_sha256(file_path)
        cache_path = get_cache_path("raw_ocr", file_hash)
        cached = load_json(cache_path)
        if cached and 'blocks' in cached:
            print(f"    → Using cached OCR ({len(cached['blocks'])} blocks)")
            blocks = [OCRBlock(**b) for b in cached['blocks']]
            elapsed = time.time() - start_time
            return blocks, elapsed
    
    # Check if it's an image file (not PDF)
    file_ext = file_path.suffix.lower()
    is_image = file_ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp']
    
    # Initialize variables
    total_text_length = 0
    pdf_time = 0.0
    
    # Step 1: Try pdfplumber first (fast, works for text-based PDFs)
    if not is_image:
        msg = "Trying pdfplumber (text-layer extraction)..."
        print(f"    → {msg}", end="", flush=True)
        if log_callback:
            log_callback(msg, "info")
        try:
            blocks, pdf_time = timeit("pdfplumber", extract_with_pdfplumber, file_path)
            total_text_length = sum(len(b.text) for b in blocks) if blocks else 0
            success_msg = f"✓ pdfplumber ({total_text_length} characters, {len(blocks)} blocks, {pdf_time:.2f}s)"
            print(f" {success_msg}")
            if log_callback:
                log_callback(success_msg, "success")
        except Exception as e:
            error_msg = f"✗ pdfplumber failed: {e}"
            print(f" {error_msg}")
            if log_callback:
                log_callback(error_msg, "error")
            blocks = []
            total_text_length = 0
            pdf_time = 0.0
    
    # Step 2: If pdfplumber found little/no text, use local OCR (PRIMARY: EasyOCR/Tesseract)
    if is_image or total_text_length < 50 or len(blocks) < 5:  # Threshold: need some text
        msg = "Using local OCR (Tesseract/EasyOCR - primary)..."
        print(f"    → {msg}", end="", flush=True)
        if log_callback:
            log_callback(msg, "info")
        if ocr_engine is None:
            ocr_engine = OCREngine()
        
        try:
            if is_image:
                # For images, use OCR directly
                img = Image.open(str(file_path))
                img_array = np.array(img)
                img_processed = preprocess_image(img_array, mode="balanced")
                ocr_blocks = ocr_engine.extract(img_processed)
                if ocr_blocks:
                    ocr_blocks = merge_fragmented_words(ocr_blocks)
                    blocks = ocr_blocks
            else:
                # For PDFs, convert to images then OCR
                ocr_blocks, ocr_time = timeit("ocr", extract_with_ocr, file_path, ocr_engine, 8.0)
                
                # If OCR took too long or got poor results, flag for Document AI fallback
                if ocr_time > 8.0 or len(ocr_blocks) < 10:
                    print(f" ⚠ Slow/poor ({ocr_time:.1f}s, {len(ocr_blocks)} blocks) - Document AI fallback available")
                
                # Merge results (prefer pdfplumber if both exist)
                if ocr_blocks:
                    if blocks:
                        # Combine, but prefer pdfplumber for overlapping regions
                        blocks.extend(ocr_blocks)
                    else:
                        blocks = ocr_blocks
            
            if blocks:
                print(f" ✓ ({len(blocks)} blocks)")
            else:
                print(" ✗ No blocks extracted")
        except Exception as e:
            print(f" ✗ ({e})")
    else:
        print("    → Sufficient text found, skipping OCR")
    
    # Step 3: Document AI fallback (only if local OCR failed or was poor)
    if (not blocks or len(blocks) < 10) and not is_image and DOCAI_AVAILABLE:
        print("    → Falling back to Google Document AI...", end="", flush=True)
        try:
            with open(file_path, "rb") as f:
                pdf_bytes = f.read()
            
            mime_type = "application/pdf"
            docai_result = call_document_ai(pdf_bytes, mime_type=mime_type, use_cache=use_cache)
            
            if docai_result and docai_result.get("text"):
                # Convert Document AI result to OCRBlock format
                docai_blocks = _convert_docai_to_blocks(docai_result)
                if docai_blocks:
                    docai_time = docai_result.get("timings", {}).get("total", 0)
                    print(f" ✓ Document AI ({len(docai_blocks)} blocks, {docai_time:.2f}s)")
                    blocks = docai_blocks
                else:
                    print(" ⚠ No blocks extracted")
            else:
                print(" ⚠ Document AI returned no text")
        except Exception as e:
            print(f" ✗ ({str(e)[:50]})")
    
    # Cache results
    if use_cache and blocks:
        file_hash = compute_file_sha256(file_path)
        cache_path = get_cache_path("raw_ocr", file_hash)
        cache_data = {
            'blocks': [b.dict() for b in blocks],
            'timestamp': time.time(),
            'file_hash': file_hash,
            'source': 'local_ocr' if blocks and blocks[0].engine != 'documentai' else 'documentai'
        }
        save_json(cache_path, cache_data)
    
    elapsed = time.time() - start_time
    return blocks, elapsed

