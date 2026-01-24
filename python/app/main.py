"""FastAPI main application for InvoiceAce."""
import os
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Any
import csv
import io

from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.models import (
    InvoiceExtract, UploadResponse, ProcessRequest, VerifyRequest, MetricsResponse
)
from app.utils import (
    get_upload_path, get_output_path, get_cache_path, 
    load_json, save_json, ensure_dir, get_project_root, timeit
)
from app.extract_text import extract_text
from app.ocr_engine import OCREngine
from app.heuristics import (
    extract_invoice_id, extract_date, extract_total_amount,
    extract_currency, extract_vendor_name
)
from app.line_items import extract_line_items_heuristic
from app.confidence import (
    compute_field_confidence, should_use_llm, get_confidence_badge
)
from app.llm_router import LLMRouter
from app.canonicalize import (
    canonicalize_date, canonicalize_currency, canonicalize_amount,
    VendorCanonicalizer
)
from app.validator import validate_field
from app.audit import AuditLogger
from app.safety import get_safety_guard
# Document AI is used as fallback OCR in extract_text.py (EasyOCR/Tesseract are primary)

app = FastAPI(title="InvoiceAce API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploads
uploads_dir = ensure_dir(get_project_root() / "uploads")
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Global instances
ocr_engine = OCREngine()
llm_router = LLMRouter()
vendor_canonicalizer = VendorCanonicalizer()
audit_logger = AuditLogger()

# In-memory storage for job state (use database in production)
job_storage: Dict[str, Dict] = {}
metrics_storage: Dict[str, any] = {
    "total_invoices": 0,
    "total_fields_processed": 0,
    "auto_accepted_count": 0,
    "flagged_count": 0,
    "llm_call_count": 0,
    "total_processing_time": 0.0,
    "total_correction_time": 0.0,
    "correction_count": 0,
}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "InvoiceAce"}


@app.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """Upload invoice file (PDF or image) with safety validation.
    
    Returns:
        job_id, filename, preview_url
    """
    safety_guard = get_safety_guard()
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    # Validate file
    file_path_temp = Path(file.filename or "unknown")
    is_valid, error_msg = safety_guard.validate_file(
        file_path_temp, 
        file_size, 
        file.content_type
    )
    
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # Generate job ID and safe filename
    job_id = str(uuid.uuid4())
    safe_filename = safety_guard.sanitize_filename(file.filename or "invoice.pdf")
    file_hash = safety_guard.compute_file_hash_from_bytes(content)
    safe_filename = safety_guard.generate_safe_filename(safe_filename, file_hash[:16])
    
    # Save file
    file_path = get_upload_path(job_id, safe_filename)
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Store job metadata
    job_storage[job_id] = {
        "job_id": job_id,
        "filename": file.filename,
        "safe_filename": safe_filename,
        "file_path": str(file_path),
        "file_hash": file_hash,
        "file_size": file_size,
        "status": "uploaded",
        "created_at": time.time(),
        "logs": []  # Store processing logs
    }
    
    preview_url = f"/uploads/{file_path.name}"
    
    return UploadResponse(
        job_id=job_id,
        filename=file.filename,
        preview_url=preview_url
    )


@app.post("/ocr")
async def run_ocr(job_id: str = Query(...)):
    """Run OCR only on uploaded file.
    
    Args:
        job_id: Job ID from upload
    
    Returns:
        OCR blocks
    """
    if job_id not in job_storage:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_storage[job_id]
    file_path = Path(job["file_path"])
    
    # Check cache
    cache_path = get_cache_path("ocr", job_id)
    cached = load_json(cache_path)
    if cached:
        job["ocr_blocks"] = cached["blocks"]
        job["status"] = "ocr_complete"
        return {"job_id": job_id, "blocks": cached["blocks"]}
    
    # Run OCR
    start_time = time.time()
    blocks, extraction_time = extract_text(file_path, ocr_engine)
    elapsed = time.time() - start_time
    
    # Convert to dict for JSON
    blocks_dict = [b.dict() if hasattr(b, 'dict') else b for b in blocks]
    
    # Cache result
    save_json(cache_path, {"blocks": blocks_dict, "elapsed": elapsed})
    
    # Update job
    job["ocr_blocks"] = blocks_dict
    job["status"] = "ocr_complete"
    job["ocr_time"] = elapsed
    
    return {"job_id": job_id, "blocks": blocks_dict, "elapsed": elapsed}


@app.post("/process", response_model=InvoiceExtract)
async def process_invoice(job_id: str = Query(...)):
    """Run full processing pipeline.
    
    Args:
        job_id: Job ID from upload
    
    Returns:
        InvoiceExtract with all fields
    """
    if job_id not in job_storage:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_storage[job_id]
    file_path = Path(job["file_path"])
    
    start_total = time.time()
    timings = {}
    
    # Helper function to add logs
    def add_log(message: str, level: str = "info"):
        if "logs" not in job:
            job["logs"] = []
        job["logs"].append({
            "timestamp": time.time(),
            "message": message,
            "level": level
        })
    
    # Step 1: Extract text/OCR (with retry logic and backpressure)
    add_log("Starting invoice processing...", "info")
    ocr_start = time.time()
    if "ocr_blocks" not in job:
        # Check backpressure
        from app.backpressure import get_backpressure_manager
        bp_manager = get_backpressure_manager()
        can_process, wait_time = bp_manager.can_process_ocr()
        if not can_process:
            if wait_time:
                add_log(f"OCR rate limited. Wait {wait_time:.1f}s", "warning")
                raise HTTPException(status_code=429, detail=f"OCR rate limited. Wait {wait_time:.1f}s")
            else:
                add_log("OCR queue full. Please try again later.", "error")
                raise HTTPException(status_code=429, detail="OCR queue full. Please try again later.")
        
        add_log("Extracting text from document...", "info")
        blocks, extraction_time = extract_text(file_path, ocr_engine, log_callback=add_log)
        blocks_dict = [b.dict() for b in blocks]
        job["ocr_blocks"] = blocks_dict
        job["docai_used"] = blocks_dict[0].get("engine") == "docai" if blocks_dict else False
    else:
        blocks_dict = job["ocr_blocks"]
    
    # Convert back to OCRBlock objects
    from app.models import OCRBlock
    blocks = [OCRBlock(**b) for b in blocks_dict]
    
    timings["ocr"] = time.time() - ocr_start
    add_log(f"OCR completed: {len(blocks)} blocks extracted in {timings['ocr']:.2f}s", "success")
    
    # Step 2: Heuristic extraction
    add_log("Running heuristic extraction...", "info")
    heuristics_start = time.time()
    
    invoice_id_result = extract_invoice_id(blocks)
    invoice_date_result = extract_date(blocks, "invoice")
    # Extract total amount AFTER invoice ID (to exclude invoice IDs from totals)
    total_amount_result = extract_total_amount(blocks, invoice_id=invoice_id_result[0])
    currency_result = extract_currency(blocks, total_amount_result[0])
    vendor_name_result = extract_vendor_name(blocks)
    # Extract tax and subtotal
    from app.heuristics import extract_tax_amount, extract_subtotal
    tax_amount_result = extract_tax_amount(blocks, total_amount_result[0])
    subtotal_result = extract_subtotal(blocks, total_amount_result[0])
    
    timings["heuristics"] = time.time() - heuristics_start
    add_log(f"Heuristic extraction completed in {timings['heuristics']:.2f}s", "success")
    
    # Early LLM fallback if heuristics found nothing (fast path)
    heuristic_success = sum(1 for r in [invoice_id_result, invoice_date_result, 
                                        total_amount_result, vendor_name_result] 
                            if r[0] is not None)
    
    # If heuristics found < 2 fields, use LLM early for better results
    if heuristic_success < 2 and len(blocks) > 0:
        early_llm_fields = []
        if not invoice_id_result[0]:
            early_llm_fields.append("invoice_id")
        if not invoice_date_result[0]:
            early_llm_fields.append("invoice_date")
        if not total_amount_result[0]:
            early_llm_fields.append("total_amount")
        if not vendor_name_result[0]:
            early_llm_fields.append("vendor_name")
        
        if early_llm_fields:
            safety_guard = get_safety_guard()
            if safety_guard.check_llm_budget()[0]:
                early_llm_result = llm_router.extract_fields(early_llm_fields, blocks, file_path)
                if early_llm_result:
                    safety_guard.increment_llm_call()
                    # Update results from early LLM
                    if "invoice_id" in early_llm_result and early_llm_result["invoice_id"]:
                        invoice_id_result = (early_llm_result["invoice_id"], 0.7, "Early LLM extraction")
                    if "invoice_date" in early_llm_result and early_llm_result["invoice_date"]:
                        invoice_date_result = (early_llm_result["invoice_date"], 0.7, "Early LLM extraction")
                    if "total_amount" in early_llm_result and early_llm_result.get("total_amount"):
                        total_amount_result = (early_llm_result["total_amount"], 0.7, "Early LLM extraction")
                    if "vendor_name" in early_llm_result and early_llm_result.get("vendor_name"):
                        vendor_name_result = (early_llm_result["vendor_name"], 0.7, "Early LLM extraction")
    
    # Early-exit: If all required fields have high confidence, skip LLM
    early_exit_threshold = 0.85
    # Result tuples are: (value, confidence, reason)
    # Use index [1] for confidence (float), not [2] which is reason (string)
    invoice_id_conf_quick = 0.2 + 0.7 * min(
        invoice_id_result[1] if len(invoice_id_result) > 1 else 0.5,
        1.0 if invoice_id_result[0] else 0.0,
        1.0 if invoice_id_result[0] else 0.0
    )
    total_amount_conf_quick = 0.2 + 0.7 * min(
        total_amount_result[1] if len(total_amount_result) > 1 else 0.5,
        1.0 if total_amount_result[0] else 0.0,
        1.0 if total_amount_result[0] else 0.0
    )
    invoice_date_conf_quick = 0.2 + 0.7 * min(
        invoice_date_result[1] if len(invoice_date_result) > 1 else 0.5,
        1.0 if invoice_date_result[0] else 0.0,
        1.0 if invoice_date_result[0] else 0.0
    )
    vendor_name_conf_quick = 0.2 + 0.7 * min(
        vendor_name_result[1] if len(vendor_name_result) > 1 else 0.5,
        1.0 if vendor_name_result[0] else 0.0,
        1.0 if vendor_name_result[0] else 0.0
    )
    
    # Early-exit if all fields are high confidence
    all_high_conf = all([
        invoice_id_conf_quick >= early_exit_threshold,
        total_amount_conf_quick >= early_exit_threshold,
        invoice_date_conf_quick >= early_exit_threshold,
        vendor_name_conf_quick >= early_exit_threshold
    ])
    
    # Step 3: Confidence scoring
    confidence_start = time.time()
    
    field_confidences = {}
    field_reasons = {}
    field_sources = {}  # Track source per field: 'pdfplumber', 'easyocr', 'tesseract', 'docai', 'heuristic', 'llm'
    llm_fields = []
    
    # Track OCR source
    if blocks:
        ocr_engines = set(b.engine for b in blocks)
        if 'pdfplumber' in ocr_engines:
            ocr_source = 'pdfplumber'
        elif 'tesseract' in ocr_engines:
            ocr_source = 'tesseract'
        elif 'easyocr' in ocr_engines:
            ocr_source = 'easyocr'
        else:
            ocr_source = 'unknown'
        
        # Check if Document AI was used (would be in job metadata)
        if job.get("docai_used", False):
            ocr_source = 'docai'
    else:
        ocr_source = 'none'
    
    # Compute confidence for each field
    invoice_id_conf, invoice_id_reason = compute_field_confidence(
        "invoice_id", invoice_id_result[0], blocks, invoice_id_result
    )
    field_confidences["invoice_id"] = invoice_id_conf
    field_reasons["invoice_id"] = invoice_id_reason
    field_sources["invoice_id"] = "heuristic" if invoice_id_result[0] else "none"
    
    invoice_date_conf, invoice_date_reason = compute_field_confidence(
        "invoice_date", invoice_date_result[0], blocks, invoice_date_result
    )
    field_confidences["invoice_date"] = invoice_date_conf
    field_reasons["invoice_date"] = invoice_date_reason
    field_sources["invoice_date"] = "heuristic" if invoice_date_result[0] else "none"
    
    total_amount_conf, total_amount_reason = compute_field_confidence(
        "total_amount", str(total_amount_result[0]) if total_amount_result[0] else None,
        blocks, total_amount_result
    )
    field_confidences["total_amount"] = total_amount_conf
    field_reasons["total_amount"] = total_amount_reason
    field_sources["total_amount"] = "heuristic" if total_amount_result[0] else "none"
    
    vendor_name_conf, vendor_name_reason = compute_field_confidence(
        "vendor_name", vendor_name_result[0], blocks, vendor_name_result
    )
    field_confidences["vendor_name"] = vendor_name_conf
    field_reasons["vendor_name"] = vendor_name_reason
    
    # Tax and subtotal confidence
    tax_amount_conf, tax_amount_reason = compute_field_confidence(
        "amount_tax", str(tax_amount_result[0]) if tax_amount_result[0] else None,
        blocks, tax_amount_result
    )
    field_confidences["amount_tax"] = tax_amount_conf
    field_reasons["amount_tax"] = tax_amount_reason
    
    subtotal_conf, subtotal_reason = compute_field_confidence(
        "amount_subtotal", str(subtotal_result[0]) if subtotal_result[0] else None,
        blocks, subtotal_result
    )
    field_confidences["amount_subtotal"] = subtotal_conf
    field_reasons["amount_subtotal"] = subtotal_reason
    
    timings["confidence"] = time.time() - confidence_start
    
    # Note: Document AI is used as FALLBACK OCR in extract_text.py (only if local OCR fails/poor)
    # LLMs remain as fallback for heuristics when confidence is low or fields are missing
    
    # Step 4: LLM fallback for low-confidence fields (BATCHED)
    llm_start = time.time()
    llm_used = False
    llm_call_reason = None
    
    # Skip LLM if early-exit conditions met
    if all_high_conf:
        print("  → Early-exit: All fields have high confidence, skipping LLM")
    
    # Collect all fields needing LLM (batched into single call)
    fields_to_extract = []
    llm_reasons = {}
    
    # Skip LLM collection if early-exit
    if not all_high_conf:
        # Check each field with improved trigger logic
        invoice_id_should, invoice_id_reason = should_use_llm(
            field_confidences.get("invoice_id", 0), "invoice_id", True, timings,
            field_missing=(invoice_id_result[0] is None)
        )
        if invoice_id_should:
            fields_to_extract.append("invoice_id")
            llm_reasons["invoice_id"] = invoice_id_reason
        
        invoice_date_should, invoice_date_reason = should_use_llm(
            field_confidences.get("invoice_date", 0), "invoice_date", True, timings,
            field_missing=(invoice_date_result[0] is None)
        )
        if invoice_date_should:
            fields_to_extract.append("invoice_date")
            llm_reasons["invoice_date"] = invoice_date_reason
        
        total_amount_should, total_amount_reason = should_use_llm(
            field_confidences.get("total_amount", 0), "total_amount", True, timings,
            field_missing=(total_amount_result[0] is None)
        )
        if total_amount_should:
            fields_to_extract.append("total_amount")
            llm_reasons["total_amount"] = total_amount_reason
        
        vendor_name_should, vendor_name_reason = should_use_llm(
            field_confidences.get("vendor_name", 0), "vendor_name", True, timings,
            field_missing=(vendor_name_result[0] is None)
        )
        if vendor_name_should:
            fields_to_extract.append("vendor_name")
            llm_reasons["vendor_name"] = vendor_name_reason
        
        # Check tax amount - include in LLM if missing or low confidence
        tax_amount_should, tax_amount_reason = should_use_llm(
            field_confidences.get("amount_tax", 0), "amount_tax", False, timings,
            field_missing=(tax_amount_result[0] is None)
        )
        if tax_amount_should:
            fields_to_extract.append("amount_tax")
            llm_reasons["amount_tax"] = tax_amount_reason
    
    # Batch all fields into single LLM call (with backpressure)
    if fields_to_extract:
        # Check backpressure
        from app.backpressure import get_backpressure_manager
        bp_manager = get_backpressure_manager()
        can_process, wait_time = bp_manager.can_process_llm()
        if not can_process:
            if wait_time:
                print(f"  ⚠️  LLM rate limited. Wait {wait_time:.1f}s")
                # Continue without LLM (use heuristic results)
                llm_result = None
            else:
                print(f"  ⚠️  LLM queue full. Using heuristic results only.")
                llm_result = None
        else:
            llm_call_reason = llm_reasons.get(fields_to_extract[0], "low_conf")
            llm_msg = f"Calling LLM for {len(fields_to_extract)} fields: {', '.join(fields_to_extract)} (reason: {llm_call_reason})"
            print(f"  → {llm_msg}")
            add_log(llm_msg, "info")
            
            try:
                llm_result, llm_time = timeit("llm_batch", llm_router.extract_fields, fields_to_extract, blocks, file_path, 8.0)
                add_log(f"LLM extraction completed in {llm_time:.2f}s", "success")
                
                if llm_result:
                    llm_used = True
                    llm_fields = fields_to_extract
                    
                    # Update values from LLM
                    if "invoice_id" in llm_result and llm_result["invoice_id"]:
                        invoice_id_result = (llm_result["invoice_id"], 0.75, "LLM extraction")
                        field_confidences["invoice_id"] = min(0.85, field_confidences.get("invoice_id", 0) + 0.2)
                        field_sources["invoice_id"] = "llm"
                    if "invoice_date" in llm_result and llm_result["invoice_date"]:
                        invoice_date_result = (llm_result["invoice_date"], 0.75, "LLM extraction")
                        field_confidences["invoice_date"] = min(0.85, field_confidences.get("invoice_date", 0) + 0.2)
                        field_sources["invoice_date"] = "llm"
                    if "total_amount" in llm_result and llm_result.get("total_amount"):
                        llm_total = llm_result["total_amount"]
                        # CRITICAL: Reject if LLM total matches invoice ID
                        if invoice_id_result[0]:
                            import re
                            inv_id_clean = re.sub(r'[^\d]', '', str(invoice_id_result[0]))
                            try:
                                total_int_str = str(int(float(llm_total))) if llm_total else ""
                                if total_int_str == inv_id_clean or (inv_id_clean and total_int_str in inv_id_clean):
                                    # LLM picked invoice ID, keep heuristic result instead
                                    print(f"  ⚠️  LLM total ({llm_total}) matches invoice ID ({invoice_id_result[0]}), using heuristic")
                                elif llm_total and float(llm_total) > 1000000:
                                    # LLM picked suspiciously large amount, keep heuristic
                                    print(f"  ⚠️  LLM total ({llm_total}) too large, using heuristic")
                                else:
                                    total_amount_result = (llm_total, 0.75, "LLM extraction")
                                    field_confidences["total_amount"] = min(0.85, field_confidences.get("total_amount", 0) + 0.2)
                                    field_sources["total_amount"] = "llm"
                            except (ValueError, TypeError):
                                # Invalid LLM result, keep heuristic
                                pass
                        else:
                            total_amount_result = (llm_total, 0.75, "LLM extraction")
                            field_confidences["total_amount"] = min(0.85, field_confidences.get("total_amount", 0) + 0.2)
                            field_sources["total_amount"] = "llm"
                    if "vendor_name" in llm_result and llm_result.get("vendor_name"):
                        vendor_name_result = (llm_result["vendor_name"], 0.75, "LLM extraction")
                        field_confidences["vendor_name"] = min(0.85, field_confidences.get("vendor_name", 0) + 0.2)
                        field_sources["vendor_name"] = "llm"
                    if "amount_tax" in llm_result and llm_result.get("amount_tax"):
                        try:
                            llm_tax = llm_result["amount_tax"]
                            # Convert to float if it's a string
                            if isinstance(llm_tax, str):
                                llm_tax = float(llm_tax.replace(',', '').replace('$', '').strip())
                            tax_amount_result = (llm_tax, 0.75, "LLM extraction")
                            field_confidences["amount_tax"] = min(0.85, field_confidences.get("amount_tax", 0) + 0.2)
                            field_sources["amount_tax"] = "llm"
                        except (ValueError, TypeError) as e:
                            print(f"  ⚠️  Invalid LLM tax amount: {llm_result.get('amount_tax')}, error: {e}")
                            # Keep heuristic result
                
                    # Update reasons from LLM (filter out None values)
                    if "reasons" in llm_result:
                        llm_reasons_clean = {
                            k: (v if v is not None else "") 
                            for k, v in llm_result["reasons"].items() 
                            if v is not None
                        }
                        field_reasons.update(llm_reasons_clean)
                else:
                    print(f"  ⚠️  LLM returned no results")
            except Exception as e:
                print(f"  ✗ LLM batch call failed: {e}")
                llm_time = 0.0
    
    timings["llm"] = time.time() - llm_start
    
    # Step 5: Canonicalization
    canonicalize_start = time.time()
    
    invoice_id = invoice_id_result[0]
    invoice_date = canonicalize_date(invoice_date_result[0])
    total_amount = canonicalize_amount(str(total_amount_result[0])) if total_amount_result[0] else None
    amount_tax = canonicalize_amount(str(tax_amount_result[0])) if tax_amount_result[0] else None
    amount_subtotal = canonicalize_amount(str(subtotal_result[0])) if subtotal_result[0] else None
    currency = canonicalize_currency(currency_result[0])
    
    # Vendor canonicalization
    vendor_name = vendor_name_result[0]
    vendor_id = None
    if vendor_name:
        vendor_id, vendor_name_canon, vendor_conf, vendor_reason = vendor_canonicalizer.canonicalize(vendor_name)
        vendor_name = vendor_name_canon
        field_reasons["vendor_name"] = f"{field_reasons.get('vendor_name', '')}; {vendor_reason}"
    
    # Step 5.5: Compute dedupe hash
    import hashlib
    dedupe_hash = None
    if vendor_id and invoice_id and total_amount and invoice_date:
        hash_str = f"{vendor_id}|{invoice_id}|{total_amount}|{invoice_date}"
        dedupe_hash = hashlib.sha256(hash_str.encode('utf-8')).hexdigest()
    
    # Step 5.6: Duplicate detection will be handled by the database
    # The dedupe_hash is computed and stored, but duplicate checking is done
    # in the server by querying the database for existing documents with the same hash
    is_duplicate = False
    is_near_duplicate = False
    near_duplicates = []
    
    # Step 5.7: Arithmetic validation (subtotal + tax = total)
    arithmetic_mismatch = False
    if amount_subtotal is not None and amount_tax is not None and total_amount is not None:
        expected_total = amount_subtotal + amount_tax
        # Allow small floating point differences (0.01 tolerance)
        if abs(expected_total - total_amount) > 0.01:
            arithmetic_mismatch = True
            print(f"  ⚠️  Arithmetic mismatch: {amount_subtotal} + {amount_tax} = {expected_total} ≠ {total_amount}")
    
    timings["canonicalize"] = time.time() - canonicalize_start
    timings["total"] = time.time() - start_total
    
    # Step 6: Validation
    # (Validation is done but we don't fail on invalid data, just flag it)
    
    # Check if needs human review (low confidence after LLM, duplicates, arithmetic mismatch)
    needs_human_review = False
    if llm_used:
        # If any required field still has low confidence after LLM
        required_fields = ['invoice_id', 'invoice_date', 'total_amount', 'vendor_name']
        for f in required_fields:
            conf = field_confidences.get(f, 0)
            # Handle both float and string confidence values
            if isinstance(conf, str):
                try:
                    conf = float(conf)
                except (ValueError, TypeError):
                    conf = 0.0
            if isinstance(conf, (int, float)) and conf < 0.5:
                needs_human_review = True
                break
    
    # Also flag for review if duplicate, near-duplicate, or arithmetic mismatch
    if is_duplicate or is_near_duplicate or arithmetic_mismatch:
        needs_human_review = True
    
    # Store original result for rollback capability
    if "original_result" not in job:
        # Store original before any corrections
        job["original_result"] = {
            "invoice_id": invoice_id,
            "vendor_name": vendor_name,
            "vendor_id": vendor_id,
            "invoice_date": invoice_date,
            "total_amount": total_amount,
            "amount_subtotal": amount_subtotal,
            "amount_tax": amount_tax,
            "currency": currency
        }
    
    # Filter out None values from field_reasons and convert to strings
    # Pydantic requires Dict[str, str] - all values must be strings
    cleaned_field_reasons = {
        k: (str(v) if v is not None else "") 
        for k, v in field_reasons.items()
    }
    
    # Validate invoice and set validation flags
    missing_invoice_id = not invoice_id or invoice_id.strip() == ""
    missing_total = total_amount is None
    missing_vendor_name = not vendor_name or vendor_name.strip() == ""
    missing_date = not invoice_date or invoice_date.strip() == ""
    is_invalid = missing_invoice_id or missing_total or missing_vendor_name or missing_date
    
    # Build result
    result = InvoiceExtract(
        invoice_id=invoice_id,
        vendor_name=vendor_name,
        vendor_id=vendor_id,
        invoice_date=invoice_date,
        total_amount=total_amount,
        amount_subtotal=amount_subtotal,
        amount_tax=amount_tax,
        currency=currency,
        line_items=extract_line_items_heuristic(blocks) if blocks else [],
        raw_ocr_blocks=blocks,
        field_confidences=field_confidences,
        field_reasons=cleaned_field_reasons,
        field_sources=field_sources,  # Track source per field
        timings=timings,
        llm_used=llm_used,
        llm_fields=llm_fields,
        dedupe_hash=dedupe_hash,
        is_duplicate=is_duplicate,
        is_near_duplicate=is_near_duplicate,  # Add near-duplicate flag
        near_duplicates=[{"job_id": jid, "similarity": sim} for jid, sim in near_duplicates[:5]],  # Top 5
        arithmetic_mismatch=arithmetic_mismatch,
        missing_invoice_id=missing_invoice_id,
        missing_total=missing_total,
        missing_vendor_name=missing_vendor_name,
        missing_date=missing_date,
        is_invalid=is_invalid
    )
    
    # Add human review flag to result dict
    result_dict = result.dict()
    result_dict['needs_human_review'] = needs_human_review
    result_dict['llm_call_reason'] = llm_call_reason
    result_dict['is_duplicate'] = is_duplicate
    result_dict['arithmetic_mismatch'] = arithmetic_mismatch
    result_dict['missing_invoice_id'] = missing_invoice_id
    result_dict['missing_total'] = missing_total
    result_dict['missing_vendor_name'] = missing_vendor_name
    result_dict['missing_date'] = missing_date
    result_dict['is_invalid'] = is_invalid
    
    # Save result
    output_path = get_output_path(job_id, "json")
    save_json(output_path, result_dict)
    
    # Update job
    job["status"] = "processed"
    job["result"] = result_dict
    job["needs_human_review"] = needs_human_review
    add_log("Processing completed successfully!", "success")
    job["llm_call_reason"] = llm_call_reason
    
    # Update metrics with detailed timings
    metrics_storage["total_invoices"] += 1
    metrics_storage["total_fields_processed"] += len(field_confidences)
    metrics_storage["auto_accepted_count"] += sum(1 for c in field_confidences.values() if c >= 0.85)
    metrics_storage["flagged_count"] += sum(1 for c in field_confidences.values() if 0.5 <= c < 0.85)
    if llm_used:
        metrics_storage["llm_call_count"] += 1
    metrics_storage["total_processing_time"] += timings["total"]
    
    # Track timing breakdowns
    if "avg_ocr_time" not in metrics_storage:
        metrics_storage["avg_ocr_time"] = 0.0
        metrics_storage["avg_heuristics_time"] = 0.0
        metrics_storage["avg_llm_time"] = 0.0
        metrics_storage["ocr_time_sum"] = 0.0
        metrics_storage["heuristics_time_sum"] = 0.0
        metrics_storage["llm_time_sum"] = 0.0
        metrics_storage["processing_times"] = []
        metrics_storage["source_counts"] = {}
    
    metrics_storage["ocr_time_sum"] += timings.get("ocr", 0) or timings.get("extraction", 0)
    metrics_storage["heuristics_time_sum"] += timings.get("heuristics", 0)
    metrics_storage["llm_time_sum"] += timings.get("llm", 0)
    
    metrics_storage["avg_ocr_time"] = metrics_storage["ocr_time_sum"] / metrics_storage["total_invoices"]
    metrics_storage["avg_heuristics_time"] = metrics_storage["heuristics_time_sum"] / metrics_storage["total_invoices"]
    if metrics_storage["llm_call_count"] > 0:
        metrics_storage["avg_llm_time"] = metrics_storage["llm_time_sum"] / metrics_storage["llm_call_count"]
    
    # Track processing times for SLO calculation
    metrics_storage["processing_times"].append(timings["total"])
    if len(metrics_storage["processing_times"]) > 1000:  # Keep last 1000 for SLO
        metrics_storage["processing_times"] = metrics_storage["processing_times"][-1000:]
    
    # Track source coverage
    for field_name, source in field_sources.items():
        if source not in metrics_storage["source_counts"]:
            metrics_storage["source_counts"][source] = 0
        metrics_storage["source_counts"][source] += 1
    
    # Log processing
    audit_logger.log_processing(job_id, result.dict(), timings)
    
    return result


@app.get("/status")
async def get_job_status(job_id: str = Query(...)):
    """Get processing status and logs for a job.
    
    Args:
        job_id: Job ID from upload
    
    Returns:
        Job status, current stage, and logs
    """
    # Try to get from memory first
    if job_id in job_storage:
        job = job_storage[job_id]
        return {
            "job_id": job_id,
            "status": job.get("status", "unknown"),
            "logs": job.get("logs", []),
            "has_result": "result" in job,
            "needs_human_review": job.get("needs_human_review", False)
        }
    
    # If not in memory, check if result exists on disk
    output_path = get_output_path(job_id, "json")
    if output_path.exists():
        try:
            result = load_json(output_path)
            # Restore to job_storage
            job_storage[job_id] = {
                "status": "processed",
                "result": result,
                "logs": [],
                "needs_human_review": result.get("needs_human_review", False)
            }
            return {
                "job_id": job_id,
                "status": "processed",
                "logs": [],
                "has_result": True,
                "needs_human_review": result.get("needs_human_review", False)
            }
        except Exception:
            pass
    
    # Job not found
    raise HTTPException(
        status_code=404,
        detail=f"Job not found. Job ID: {job_id}. The job may not exist or the Python service was restarted."
    )


@app.post("/verify")
async def verify_corrections(request: VerifyRequest, auto_promote: bool = Query(False, description="Auto-promote vendor aliases and create heuristic rules")):
    """Apply manual corrections and log to audit trail.
    
    Args:
        request: VerifyRequest with corrections
        auto_promote: If True, automatically create vendor aliases and heuristic rules from corrections
    
    Returns:
        Updated result with learning artifacts
    """
    if request.job_id not in job_storage:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_storage[request.job_id]
    
    if "result" not in job:
        raise HTTPException(status_code=400, detail="Job not processed yet")
    
    result_dict = job["result"]
    start_time = time.time()
    
    # Learning artifacts (if auto_promote is enabled)
    learning_artifacts = {}
    
    # Apply corrections
    for field_name, new_value in request.corrections.items():
        old_value = result_dict.get(field_name)
        
        # Log correction with user_id from request
        audit_logger.log_correction(
            request.job_id,
            field_name,
            old_value,
            new_value,
            user_id=request.user_id,
            reason="manual verification"
        )
        
        # Learning-from-Edits: Capture edit and generate artifacts (if enabled)
        if auto_promote:
            from app.learning import get_edit_learner
            edit_learner = get_edit_learner()
            
            # Get context for learning
            ocr_blocks = [b.dict() if hasattr(b, 'dict') else b for b in job.get("ocr_blocks", [])]
            context = {
                "ocr_blocks": ocr_blocks[:50],  # Limit to 50 blocks for performance
                "invoice_data": result_dict,
                "job_id": request.job_id
            }
            
            # Capture edit and generate artifacts
            artifacts = edit_learner.capture_edit(
                request.job_id,
                field_name,
                old_value,
                new_value,
                request.user_id,
                context
            )
            
            learning_artifacts[field_name] = artifacts
        
        # Update result
        result_dict[field_name] = new_value
        
        # Re-canonicalize if needed
        if field_name == "invoice_date":
            result_dict[field_name] = canonicalize_date(new_value)
        elif field_name == "currency":
            result_dict[field_name] = canonicalize_currency(new_value)
        elif field_name == "total_amount":
            result_dict[field_name] = canonicalize_amount(str(new_value))
        elif field_name == "vendor_name":
            vendor_id, vendor_name, _, _ = vendor_canonicalizer.canonicalize(new_value)
            result_dict["vendor_name"] = vendor_name
            result_dict["vendor_id"] = vendor_id
    
    elapsed = time.time() - start_time
    
    # Recalculate validation flags after corrections
    invoice_id = result_dict.get("invoice_id")
    total_amount = result_dict.get("total_amount")
    vendor_name = result_dict.get("vendor_name")
    invoice_date = result_dict.get("invoice_date")
    
    missing_invoice_id = not invoice_id or (isinstance(invoice_id, str) and invoice_id.strip() == "")
    missing_total = total_amount is None
    missing_vendor_name = not vendor_name or (isinstance(vendor_name, str) and vendor_name.strip() == "")
    missing_date = not invoice_date or (isinstance(invoice_date, str) and invoice_date.strip() == "")
    is_invalid = missing_invoice_id or missing_total or missing_vendor_name or missing_date
    
    # Update validation flags in result
    result_dict['missing_invoice_id'] = missing_invoice_id
    result_dict['missing_total'] = missing_total
    result_dict['missing_vendor_name'] = missing_vendor_name
    result_dict['missing_date'] = missing_date
    result_dict['is_invalid'] = is_invalid
    
    # Update metrics
    metrics_storage["total_correction_time"] += elapsed
    metrics_storage["correction_count"] += 1
    
    # Save updated result
    output_path = get_output_path(request.job_id, "json")
    save_json(output_path, result_dict)
    job["result"] = result_dict
    
    response = {
        "job_id": request.job_id,
        "result": result_dict,
        "correction_time": elapsed
    }
    
    # Include learning artifacts if auto_promote was enabled
    if auto_promote and learning_artifacts:
        response["learning_artifacts"] = learning_artifacts
    
    return response


def get_clean_invoice_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """Extract only the final user-facing invoice data, excluding technical metadata.
    
    Args:
        result: Full extraction result with all metadata
    
    Returns:
        Clean invoice data with only final corrected values
    """
    # Fields to include in user-facing export
    clean_data = {
        "invoice_id": result.get("invoice_id"),
        "vendor_name": result.get("vendor_name"),
        "vendor_id": result.get("vendor_id"),
        "invoice_date": result.get("invoice_date"),
        "total_amount": result.get("total_amount"),
        "amount_subtotal": result.get("amount_subtotal"),
        "amount_tax": result.get("amount_tax"),
        "currency": result.get("currency"),
    }
    
    # Include line items if present, with normalization and filtering
    if result.get("line_items"):
        normalized_line_items = []
        for item in result.get("line_items", []):
            normalized_item = dict(item)  # Create a copy
            
            # Get description and check if it should be filtered
            description = normalized_item.get("description", "").strip() if normalized_item.get("description") else ""
            
            # Filter out empty or invalid descriptions
            if not description or description in ['-', '--', '---', 'N/A', 'n/a', '']:
                continue
            
            # Filter out common non-item phrases (case-insensitive)
            description_lower = description.lower()
            non_item_phrases = [
                'sales', 'tax', 'subtotal', 'total', 'amount', 'payment', 'terms',
                'many thanks', 'thank you', 'thanks for', 'thanks foryour', 'thanks for your',
                'thanks for your business', 'thank you for your business', 'thanks foryour business',
                'to be received', 'within', 'days',
                'please find', 'cost-breakdown', 'work completed', 'earliest convenience',
                'do not hesitate', 'contact me', 'questions', 'dear', 'ms.', 'mr.',
                'your name', 'sincerely', 'regards', 'best regards',
                'look forward', 'doing business', 'due course', 'custom',
                'find below', 'make payment', 'contact', 'hesitate',
                'for your business', 'for business', 'your business'
            ]
            
            # Check if description matches any non-item phrase
            if any(phrase in description_lower for phrase in non_item_phrases):
                continue
            
            # Skip if description is too short and has no meaningful data
            quantity = normalized_item.get("quantity")
            unit_price = normalized_item.get("unit_price")
            total = normalized_item.get("total")
            
            if len(description) < 3 and not quantity and not unit_price and not total:
                continue
            
            # Skip if it's clearly not a line item (no numbers and generic description)
            if not quantity and not unit_price and not total:
                if len(description) < 5 or description_lower in ['sales', 'tax', 'subtotal', 'total']:
                    continue
            
            # Only include if we have at least some meaningful data
            if not (quantity or unit_price or total):
                continue
            
            # Normalize: if unit_price exists but quantity is null/undefined, default quantity to 1
            if (unit_price is not None and quantity is None):
                normalized_item["quantity"] = 1
                quantity = 1
            
            # Calculate total if quantity and unit_price exist but total is missing
            if (quantity is not None and unit_price is not None and total is None):
                normalized_item["total"] = quantity * unit_price
            
            # Update description to cleaned version
            normalized_item["description"] = description
            
            normalized_line_items.append(normalized_item)
        
        clean_data["line_items"] = normalized_line_items
    
    # Remove None values for cleaner output (but keep line_items even if empty list)
    clean_data = {k: v for k, v in clean_data.items() if v is not None or k == "line_items"}
    
    return clean_data


@app.get("/export/csv")
async def export_csv(job_id: str = Query(...), erp_type: str = Query("quickbooks", description="ERP type: quickbooks, sap, oracle, xero"), 
                    skip_safety_check: bool = Query(False)):
    """Export invoice as CSV with safety gates.
    
    Args:
        job_id: Job ID
        erp_type: ERP format (quickbooks, sap, oracle, xero)
        skip_safety_check: Skip safety validation (not recommended)
    
    Returns:
        CSV file download
    """
    try:
        # Try to get result from memory first
        result = None
        if job_id in job_storage:
            job = job_storage[job_id]
            if "result" in job:
                result = job["result"]
        
        # If not in memory, try to load from disk
        if result is None:
            output_path = get_output_path(job_id, "json")
            if output_path.exists():
                try:
                    result = load_json(output_path)
                    # Restore to job_storage for future use
                    if job_id not in job_storage:
                        job_storage[job_id] = {"status": "processed", "result": result}
                    else:
                        job_storage[job_id]["result"] = result
                except Exception as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to load result from disk: {str(e)}"
                    )
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"Job not found. Job ID: {job_id}. The job may not exist or the Python service was restarted."
                )
        
        if not result:
            raise HTTPException(status_code=400, detail="Job not processed yet or result is empty")
        
        # Extract only the clean, user-facing invoice data (final corrected values)
        clean_data = get_clean_invoice_data(result)
        
        # Safety gates: validate before export (using clean data)
        if not skip_safety_check:
            from app.erp_export import validate_export_safety
            is_safe, warnings = validate_export_safety(clean_data)
            if not is_safe:
                raise HTTPException(
                    status_code=400,
                    detail=f"Export blocked: {', '.join(warnings)}. Use skip_safety_check=true to override (not recommended)."
                )
        
        # Use ERP-specific format if requested
        if erp_type in ["quickbooks", "sap", "oracle", "xero"]:
            from app.erp_export import export_to_erp_format
            csv_content = export_to_erp_format(clean_data, erp_type)
            filename = f"invoice_{job_id}_{erp_type}.csv"
        else:
            # Default CSV format - clean user-facing data only
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Header
            writer.writerow(["Field", "Value"])
            
            # Data rows - only final corrected values
            writer.writerow(["Invoice ID", clean_data.get("invoice_id", "")])
            writer.writerow(["Vendor Name", clean_data.get("vendor_name", "")])
            writer.writerow(["Vendor ID", clean_data.get("vendor_id", "")])
            writer.writerow(["Invoice Date", clean_data.get("invoice_date", "")])
            writer.writerow(["Subtotal", clean_data.get("amount_subtotal", "")])
            writer.writerow(["Tax", clean_data.get("amount_tax", "")])
            writer.writerow(["Total Amount", clean_data.get("total_amount", "")])
            writer.writerow(["Currency", clean_data.get("currency", "")])
            
            # Line items (if any)
            if clean_data.get("line_items"):
                writer.writerow([])
                writer.writerow(["Line Items"])
                writer.writerow(["Description", "Quantity", "Unit Price", "Total"])
                for item in clean_data["line_items"]:
                    writer.writerow([
                        item.get("description", ""),
                        item.get("quantity", ""),
                        item.get("unit_price", ""),
                        item.get("total", "")
                    ])
            
            csv_content = output.getvalue()
            filename = f"invoice_{job_id}.csv"
        
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"CSV export error: {str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=error_detail)


@app.get("/export/json")
async def export_json(job_id: str = Query(...)):
    """Export invoice as JSON with final corrected data (user-facing format).
    
    Args:
        job_id: Job ID from upload
    
    Returns:
        JSON file with clean invoice data (final corrected values only)
    """
    try:
        # Try to get result from memory first
        result = None
        if job_id in job_storage:
            job = job_storage[job_id]
            result = job.get("result")
        
        # If not in memory, try to load from disk
        if result is None:
            output_path = get_output_path(job_id, "json")
            if output_path.exists():
                try:
                    result = load_json(output_path)
                    # Restore to job_storage for future use
                    if job_id not in job_storage:
                        job_storage[job_id] = {"status": "processed", "result": result}
                    else:
                        job_storage[job_id]["result"] = result
                except Exception as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to load result from disk: {str(e)}"
                    )
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"Job not found. Job ID: {job_id}. The job may not exist or the Python service was restarted."
                )
        
        if not result:
            raise HTTPException(
                status_code=400,
                detail="Invoice has not been processed yet. Please process the invoice first."
            )
        
        # Extract only the clean, user-facing invoice data (final corrected values)
        clean_data = get_clean_invoice_data(result)
        
        # Return JSON response with proper headers
        import json
        from datetime import datetime
        
        # Custom JSON encoder to handle non-serializable types
        def json_serializer(obj):
            """JSON serializer for objects not serializable by default json code"""
            if isinstance(obj, datetime):
                return obj.isoformat()
            elif hasattr(obj, '__dict__'):
                return obj.__dict__
            elif hasattr(obj, '__str__'):
                return str(obj)
            raise TypeError(f"Type {type(obj)} not serializable")
        
        try:
            json_content = json.dumps(clean_data, indent=2, ensure_ascii=False, default=json_serializer)
        except (TypeError, ValueError) as e:
            # If serialization fails, try to clean the result
            import copy
            cleaned_result = copy.deepcopy(clean_data)
            
            # Convert any remaining non-serializable objects to strings
            if isinstance(cleaned_result, dict):
                for key, value in list(cleaned_result.items()):
                    try:
                        json.dumps(value)  # Test if serializable
                    except (TypeError, ValueError):
                        cleaned_result[key] = str(value)
            
            try:
                json_content = json.dumps(cleaned_result, indent=2, ensure_ascii=False, default=json_serializer)
            except Exception as e2:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to serialize result to JSON: {str(e2)}"
                )
        
        filename = f"invoice_{job_id}.json"
        
        return Response(
            content=json_content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"JSON export error: {str(e)}\n{traceback.format_exc()}"
        raise HTTPException(
            status_code=500,
            detail=error_detail
        )


@app.get("/metrics", response_model=MetricsResponse)
async def get_metrics():
    """Get aggregate metrics with detailed timing.
    
    Returns:
        MetricsResponse
    """
    total = metrics_storage["total_invoices"]
    
    if total == 0:
        return MetricsResponse(
            total_invoices=0,
            total_fields_processed=0,
            auto_accepted_count=0,
            flagged_count=0,
            llm_call_count=0,
            avg_confidence=0.0,
            avg_processing_time=0.0,
            avg_correction_time=None,
            heuristic_coverage=100.0
        )
    
    avg_confidence = (
        metrics_storage["auto_accepted_count"] / metrics_storage["total_fields_processed"]
        if metrics_storage["total_fields_processed"] > 0 else 0.0
    )
    
    avg_processing_time = metrics_storage["total_processing_time"] / total
    
    # Calculate cache hit rates
    ocr_cache_hits = metrics_storage.get("ocr_cache_hits", 0)
    llm_cache_hits = metrics_storage.get("llm_cache_hits", 0)
    ocr_cache_rate = (ocr_cache_hits / total * 100) if total > 0 else 0.0
    llm_cache_rate = (llm_cache_hits / metrics_storage.get("llm_call_count", 1) * 100) if metrics_storage.get("llm_call_count", 0) > 0 else 0.0
    
    avg_correction_time = (
        metrics_storage["total_correction_time"] / metrics_storage["correction_count"]
        if metrics_storage["correction_count"] > 0 else None
    )
    
    heuristic_coverage = (
        (1 - metrics_storage["llm_call_count"] / total) * 100
        if total > 0 else 100.0
    )
    
    # Calculate SLO (90th percentile processing time)
    processing_times = metrics_storage.get("processing_times", [])
    slo_90th = None
    if processing_times and len(processing_times) >= 10:
        sorted_times = sorted(processing_times)
        idx_90 = int(len(sorted_times) * 0.9)
        slo_90th = sorted_times[idx_90]
    
    # Calculate source coverage
    source_counts = metrics_storage.get("source_counts", {})
    total_source_fields = sum(source_counts.values())
    source_coverage = {}
    if total_source_fields > 0:
        for source, count in source_counts.items():
            source_coverage[source] = (count / total_source_fields) * 100
    
    return MetricsResponse(
        total_invoices=total,
        total_fields_processed=metrics_storage["total_fields_processed"],
        auto_accepted_count=metrics_storage["auto_accepted_count"],
        flagged_count=metrics_storage["flagged_count"],
        llm_call_count=metrics_storage["llm_call_count"],
        avg_confidence=avg_confidence,
        avg_processing_time=avg_processing_time,
        avg_correction_time=avg_correction_time,
        heuristic_coverage=heuristic_coverage,
        avg_ocr_time=metrics_storage.get("avg_ocr_time"),
        avg_heuristics_time=metrics_storage.get("avg_heuristics_time"),
        avg_llm_time=metrics_storage.get("avg_llm_time"),
        slo_90th_percentile=slo_90th,
        source_coverage=source_coverage if source_coverage else None
    )


@app.get("/review/queue")
async def get_review_queue(limit: int = Query(20, ge=1, le=100)):
    """Get list of invoices needing human review.
    
    Args:
        limit: Maximum number of invoices to return
    
    Returns:
        List of flagged invoices with details
    """
    flagged = []
    for job_id, job in job_storage.items():
        if job.get("needs_human_review", False) or job.get("status") == "processed":
            result = job.get("result", {})
            if result:
                # Check if any field needs review
                field_confidences = result.get("field_confidences", {})
                low_conf_fields = [f for f, c in field_confidences.items() if c < 0.5]
                
                if (low_conf_fields or 
                    result.get("is_duplicate", False) or 
                    result.get("arithmetic_mismatch", False)):
                    flagged.append({
                        "job_id": job_id,
                        "filename": job.get("filename", "unknown"),
                        "invoice_id": result.get("invoice_id"),
                        "vendor_name": result.get("vendor_name"),
                        "total_amount": result.get("total_amount"),
                        "low_confidence_fields": low_conf_fields,
                        "is_duplicate": result.get("is_duplicate", False),
                        "arithmetic_mismatch": result.get("arithmetic_mismatch", False),
                        "field_confidences": field_confidences,
                        "uploaded_at": job.get("uploaded_at")
                    })
    
    # Sort by priority (duplicates and arithmetic mismatches first, then low confidence)
    flagged.sort(key=lambda x: (
        0 if (x["is_duplicate"] or x["arithmetic_mismatch"]) else 1,
        len(x["low_confidence_fields"]),
        min(x["field_confidences"].values()) if x["field_confidences"] else 1.0
    ))
    
    return {"flagged_invoices": flagged[:limit], "total": len(flagged)}


@app.post("/review/{job_id}/apply")
async def apply_review_corrections(job_id: str, corrections: Dict[str, Any], 
                                  user_id: str = Query("system"),
                                  auto_promote: bool = Query(False, description="Auto-promote vendor aliases and create heuristic rules")):
    """Apply review corrections (alias for /verify with job_id in path).
    
    Args:
        job_id: Job ID
        corrections: Dict of field -> corrected value
        user_id: User ID making corrections
        auto_promote: If True, automatically create vendor aliases and heuristic rules
    
    Returns:
        Updated result with learning artifacts
    """
    # Delegate to verify endpoint
    verify_request = VerifyRequest(
        job_id=job_id,
        corrections=corrections,
        user_id=user_id
    )
    return await verify_corrections(verify_request, auto_promote=auto_promote)


@app.post("/review/{job_id}/rollback")
async def rollback_corrections(job_id: str, user_id: str = Query("system")):
    """Rollback corrections to original extracted values.
    
    Args:
        job_id: Job ID
        user_id: User ID performing rollback
    
    Returns:
        Rolled back result
    """
    if job_id not in job_storage:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = job_storage[job_id]
    
    # Get original result (before corrections)
    original_result = job.get("original_result")
    if not original_result:
        raise HTTPException(status_code=400, detail="No original result to rollback to")
    
    # Log rollback
    audit_logger.log_correction(
        job_id,
        "rollback",
        job.get("result", {}),
        original_result,
        user_id=user_id,
        reason="rollback to original"
    )
    
    # Restore original result
    job["result"] = original_result.copy()
    
    return {"job_id": job_id, "result": original_result, "rolled_back": True}


@app.post("/vendor/promote")
async def promote_vendor(vendor_name: str, canonical_id: Optional[str] = None):
    """Promote a vendor to vendors.csv (add or update).
    
    Args:
        vendor_name: Vendor name to promote
        canonical_id: Optional canonical ID (auto-generated if not provided)
    
    Returns:
        Success message with canonical ID
    """
    from app.utils import get_project_root
    import csv
    
    vendors_path = get_project_root() / "data" / "vendors.csv"
    vendors_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Generate canonical ID if not provided
    if not canonical_id:
        import re
        canonical_id = re.sub(r'[^a-z0-9]', '_', vendor_name.lower().strip())
        canonical_id = re.sub(r'_+', '_', canonical_id).strip('_')
    
    # Load existing vendors
    vendors = []
    vendor_exists = False
    if vendors_path.exists():
        with open(vendors_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get('canonical_id') == canonical_id:
                    # Update existing
                    row['name'] = vendor_name
                    vendor_exists = True
                vendors.append(row)
    
    # Add new vendor if not exists
    if not vendor_exists:
        vendors.append({
            'canonical_id': canonical_id,
            'name': vendor_name,
            'aliases': vendor_name,  # Add name as alias
            'tax_id': ''
        })
    
    # Write back to CSV
    with open(vendors_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['canonical_id', 'name', 'aliases', 'tax_id'])
        writer.writeheader()
        writer.writerows(vendors)
    
    # Reload vendor canonicalizer
    vendor_canonicalizer.load_vendors(vendors_path)
    
    return {
        "success": True,
        "canonical_id": canonical_id,
        "vendor_name": vendor_name,
        "message": "Vendor promoted to vendors.csv"
    }


@app.get("/audit/{job_id}")
async def get_audit_log(job_id: str):
    """Get audit log for a job.
    
    Args:
        job_id: Job ID
    
    Returns:
        Audit log entries
    """
    if job_id not in job_storage:
        raise HTTPException(status_code=404, detail="Job not found")
    
    audit_entries = audit_logger.get_audit_log(job_id)
    
    return {
        "job_id": job_id,
        "audit_entries": audit_entries,
        "total_entries": len(audit_entries)
    }


@app.get("/uploads/{filename}")
async def get_upload(filename: str):
    """Serve uploaded file (for preview).
    
    Args:
        filename: Filename
    
    Returns:
        File response
    """
    file_path = uploads_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)

