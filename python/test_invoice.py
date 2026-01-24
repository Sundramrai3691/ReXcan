"""Test script for invoice processing."""
import sys
from pathlib import Path
import json
import warnings
from PIL import Image

# Suppress PIL decompression bomb warning
Image.MAX_IMAGE_PIXELS = None
warnings.filterwarnings('ignore', category=Image.DecompressionBombWarning)

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from app.extract_text import extract_text
from app.ocr_engine import OCREngine
from app.heuristics import (
    extract_invoice_id, extract_date, extract_total_amount,
    extract_currency, extract_vendor_name
)
from app.canonicalize import (
    canonicalize_date, canonicalize_currency, canonicalize_amount,
    VendorCanonicalizer
)
from app.confidence import compute_field_confidence, should_use_llm
from app.llm_router import LLMRouter


def process_invoice(pdf_path: Path):
    """Process a single invoice."""
    print(f"\n{'='*60}")
    print(f"Processing: {pdf_path.name}")
    print(f"{'='*60}\n")
    
    # Step 1: Extract text
    print("Step 1: Extracting text...")
    print("  → Initializing OCR engine...")
    ocr_engine = OCREngine()
    print(f"  → EasyOCR: {'✓' if ocr_engine.use_easyocr else '✗ (disabled)'}")
    print(f"  → Tesseract: {'✓' if ocr_engine.use_tesseract else '✗ (disabled)'}")
    print("  → Extracting text from PDF (this may take a moment)...")
    blocks = extract_text(pdf_path, ocr_engine)
    print(f"  ✓ Extracted {len(blocks)} OCR blocks")
    
    if len(blocks) == 0:
        print("  ✗ No text extracted!")
        return None
    
    # Step 2: Heuristic extraction
    print("\nStep 2: Running heuristics...")
    invoice_id_result = extract_invoice_id(blocks)
    invoice_date_result = extract_date(blocks, "invoice")
    due_date_result = extract_date(blocks, "due")
    total_amount_result = extract_total_amount(blocks)
    currency_result = extract_currency(blocks, total_amount_result[0])
    vendor_name_result = extract_vendor_name(blocks)
    
    print(f"  Invoice ID: {invoice_id_result[0]} (conf: {invoice_id_result[1]:.2f})")
    print(f"  Invoice Date: {invoice_date_result[0]} (conf: {invoice_date_result[1]:.2f})")
    print(f"  Due Date: {due_date_result[0]} (conf: {due_date_result[1]:.2f})")
    print(f"  Total Amount: {total_amount_result[0]} (conf: {total_amount_result[1]:.2f})")
    print(f"  Currency: {currency_result[0]} (conf: {currency_result[1]:.2f})")
    print(f"  Vendor: {vendor_name_result[0]} (conf: {vendor_name_result[1]:.2f})")
    
    # Step 3: Confidence scoring
    print("\nStep 3: Computing confidence scores...")
    field_confidences = {}
    field_reasons = {}
    
    invoice_id_conf, invoice_id_reason = compute_field_confidence(
        "invoice_id", invoice_id_result[0], blocks, invoice_id_result
    )
    field_confidences["invoice_id"] = invoice_id_conf
    field_reasons["invoice_id"] = invoice_id_reason
    
    invoice_date_conf, invoice_date_reason = compute_field_confidence(
        "invoice_date", invoice_date_result[0], blocks, invoice_date_result
    )
    field_confidences["invoice_date"] = invoice_date_conf
    field_reasons["invoice_date"] = invoice_date_reason
    
    total_amount_conf, total_amount_reason = compute_field_confidence(
        "total_amount", str(total_amount_result[0]) if total_amount_result[0] else None,
        blocks, total_amount_result
    )
    field_confidences["total_amount"] = total_amount_conf
    field_reasons["total_amount"] = total_amount_reason
    
    vendor_name_conf, vendor_name_reason = compute_field_confidence(
        "vendor_name", vendor_name_result[0], blocks, vendor_name_result
    )
    field_confidences["vendor_name"] = vendor_name_conf
    field_reasons["vendor_name"] = vendor_name_reason
    
    print(f"  Invoice ID confidence: {invoice_id_conf:.2f}")
    print(f"  Invoice Date confidence: {invoice_date_conf:.2f}")
    print(f"  Total Amount confidence: {total_amount_conf:.2f}")
    print(f"  Vendor Name confidence: {vendor_name_conf:.2f}")
    
    # Step 4: LLM fallback (if needed)
    llm_used = False
    llm_fields = []
    fields_to_extract = []
    
    if should_use_llm(invoice_id_conf, "invoice_id"):
        fields_to_extract.append("invoice_id")
    if should_use_llm(invoice_date_conf, "invoice_date"):
        fields_to_extract.append("invoice_date")
    if should_use_llm(total_amount_conf, "total_amount"):
        fields_to_extract.append("total_amount")
    if should_use_llm(vendor_name_conf, "vendor_name"):
        fields_to_extract.append("vendor_name")
    
    if fields_to_extract:
        print(f"\nStep 4: LLM fallback for low-confidence fields: {fields_to_extract}")
        llm_router = LLMRouter()
        llm_result = llm_router.extract_fields(fields_to_extract, blocks)
        if llm_result:
            llm_used = True
            llm_fields = fields_to_extract
            print(f"  ✓ LLM extraction completed")
            # Update values from LLM
            if "invoice_id" in llm_result and llm_result["invoice_id"]:
                invoice_id_result = (llm_result["invoice_id"], 0.7, "LLM extraction")
            if "invoice_date" in llm_result and llm_result["invoice_date"]:
                invoice_date_result = (llm_result["invoice_date"], 0.7, "LLM extraction")
            if "total_amount" in llm_result and llm_result.get("total_amount"):
                total_amount_result = (llm_result["total_amount"], 0.7, "LLM extraction")
            if "vendor_name" in llm_result and llm_result.get("vendor_name"):
                vendor_name_result = (llm_result["vendor_name"], 0.7, "LLM extraction")
    else:
        print("\nStep 4: No LLM fallback needed (all fields have sufficient confidence)")
    
    # Step 5: Canonicalization
    print("\nStep 5: Canonicalizing data...")
    invoice_id = invoice_id_result[0]
    invoice_date = canonicalize_date(invoice_date_result[0])
    due_date = canonicalize_date(due_date_result[0]) if due_date_result[0] else None
    total_amount = canonicalize_amount(str(total_amount_result[0])) if total_amount_result[0] else None
    currency = canonicalize_currency(currency_result[0])
    
    vendor_canonicalizer = VendorCanonicalizer()
    vendor_name = vendor_name_result[0]
    vendor_id = None
    if vendor_name:
        vendor_id, vendor_name, _, _ = vendor_canonicalizer.canonicalize(vendor_name)
    
    result = {
        "invoice_id": invoice_id,
        "vendor_name": vendor_name,
        "vendor_id": vendor_id,
        "invoice_date": invoice_date,
        "due_date": due_date,
        "total_amount": total_amount,
        "currency": currency,
        "field_confidences": field_confidences,
        "field_reasons": field_reasons,
        "llm_used": llm_used,
        "llm_fields": llm_fields
    }
    
    print("\n" + "="*60)
    print("FINAL RESULT:")
    print("="*60)
    print(json.dumps(result, indent=2, default=str))
    
    return result


if __name__ == "__main__":
    pdf_path = Path("sample data/1.pdf")
    expected_path = Path("sample data/1.json")
    
    if not pdf_path.exists():
        print(f"Error: {pdf_path} not found!")
        sys.exit(1)
    
    # Process invoice
    result = process_invoice(pdf_path)
    
    # Compare with expected output
    if expected_path.exists():
        print("\n" + "="*60)
        print("EXPECTED OUTPUT:")
        print("="*60)
        with open(expected_path, 'r') as f:
            expected = json.load(f)
        print(json.dumps(expected, indent=2))
        
        print("\n" + "="*60)
        print("COMPARISON:")
        print("="*60)
        if result:
            print(f"Invoice ID: Expected '{expected.get('invoice_number', 'N/A')}', Got '{result.get('invoice_id', 'N/A')}'")
            print(f"Vendor: Expected '{expected.get('company', 'N/A')}', Got '{result.get('vendor_name', 'N/A')}'")
            print(f"Date: Expected '{expected.get('date', 'N/A')}', Got '{result.get('invoice_date', 'N/A')}'")
            print(f"Total: Expected '{expected.get('total', 'N/A')}', Got '{result.get('total_amount', 'N/A')}'")

