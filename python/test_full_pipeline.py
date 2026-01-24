"""Complete pipeline test against expected JSON output."""
import sys
from pathlib import Path
import json
import time

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


def test_against_expected(pdf_path: Path, expected_json_path: Path):
    """Test full pipeline against expected output."""
    print("\n" + "="*70)
    print(f"FULL PIPELINE TEST: {pdf_path.name}")
    print("="*70)
    
    # Load expected output
    with open(expected_json_path, 'r', encoding='utf-8') as f:
        expected = json.load(f)
    
    print(f"\nExpected Output:")
    print(json.dumps(expected, indent=2, ensure_ascii=False))
    
    # Step 1: Extract text
    print(f"\n[1/6] Extracting text from PDF...")
    start_time = time.time()
    ocr_engine = OCREngine()
    blocks = extract_text(pdf_path, ocr_engine)
    extraction_time = time.time() - start_time
    print(f"  ✓ Extracted {len(blocks)} blocks in {extraction_time:.2f}s")
    
    if len(blocks) == 0:
        print("  ✗ FAIL: No text extracted!")
        return False
    
    # Show sample text
    print(f"\n  Sample extracted text (first 200 chars):")
    sample_text = " ".join([b.text for b in blocks[:20]])
    print(f"  '{sample_text[:200]}...'")
    
    # Step 2: Heuristic extraction
    print(f"\n[2/6] Running heuristics...")
    invoice_id_result = extract_invoice_id(blocks)
    invoice_date_result = extract_date(blocks, "invoice")
    due_date_result = extract_date(blocks, "due")
    total_amount_result = extract_total_amount(blocks)
    currency_result = extract_currency(blocks, total_amount_result[0])
    vendor_name_result = extract_vendor_name(blocks)
    
    print(f"  Invoice ID: {invoice_id_result[0]} (conf: {invoice_id_result[1]:.2f})")
    print(f"  Invoice Date: {invoice_date_result[0]} (conf: {invoice_date_result[1]:.2f})")
    print(f"  Total Amount: {total_amount_result[0]} (conf: {total_amount_result[1]:.2f})")
    print(f"  Currency: {currency_result[0]} (conf: {currency_result[1]:.2f})")
    print(f"  Vendor: {vendor_name_result[0]} (conf: {vendor_name_result[1]:.2f})")
    
    # Step 3: Confidence scoring
    print(f"\n[3/6] Computing confidence scores...")
    field_confidences = {}
    invoice_id_conf, _ = compute_field_confidence(
        "invoice_id", invoice_id_result[0], blocks, invoice_id_result
    )
    field_confidences["invoice_id"] = invoice_id_conf
    
    invoice_date_conf, _ = compute_field_confidence(
        "invoice_date", invoice_date_result[0], blocks, invoice_date_result
    )
    field_confidences["invoice_date"] = invoice_date_conf
    
    total_amount_conf, _ = compute_field_confidence(
        "total_amount", str(total_amount_result[0]) if total_amount_result[0] else None,
        blocks, total_amount_result
    )
    field_confidences["total_amount"] = total_amount_conf
    
    vendor_name_conf, _ = compute_field_confidence(
        "vendor_name", vendor_name_result[0], blocks, vendor_name_result
    )
    field_confidences["vendor_name"] = vendor_name_conf
    
    print(f"  Invoice ID confidence: {invoice_id_conf:.2f}")
    print(f"  Invoice Date confidence: {invoice_date_conf:.2f}")
    print(f"  Total Amount confidence: {total_amount_conf:.2f}")
    print(f"  Vendor Name confidence: {vendor_name_conf:.2f}")
    
    # Step 4: LLM fallback (if needed)
    print(f"\n[4/6] Checking LLM fallback requirements...")
    fields_to_extract = []
    if should_use_llm(invoice_id_conf, "invoice_id"):
        fields_to_extract.append("invoice_id")
    if should_use_llm(invoice_date_conf, "invoice_date"):
        fields_to_extract.append("invoice_date")
    if should_use_llm(total_amount_conf, "total_amount"):
        fields_to_extract.append("total_amount")
    if should_use_llm(vendor_name_conf, "vendor_name"):
        fields_to_extract.append("vendor_name")
    
    llm_used = False
    if fields_to_extract:
        print(f"  → LLM fallback needed for: {fields_to_extract}")
        llm_router = LLMRouter()
        llm_result = llm_router.extract_fields(fields_to_extract, blocks)
        if llm_result:
            llm_used = True
            print(f"  ✓ LLM extraction completed")
            # Update values
            if "invoice_id" in llm_result and llm_result["invoice_id"]:
                invoice_id_result = (llm_result["invoice_id"], 0.7, "LLM extraction")
            if "invoice_date" in llm_result and llm_result["invoice_date"]:
                invoice_date_result = (llm_result["invoice_date"], 0.7, "LLM extraction")
            if "total_amount" in llm_result and llm_result.get("total_amount"):
                total_amount_result = (llm_result["total_amount"], 0.7, "LLM extraction")
            if "vendor_name" in llm_result and llm_result.get("vendor_name"):
                vendor_name_result = (llm_result["vendor_name"], 0.7, "LLM extraction")
    else:
        print(f"  ✓ No LLM fallback needed (all fields have sufficient confidence)")
    
    # Step 5: Canonicalization
    print(f"\n[5/6] Canonicalizing data...")
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
        "currency": currency
    }
    
    # Step 6: Compare with expected
    print(f"\n[6/6] Comparing with expected output...")
    print(f"\n{'='*70}")
    print("COMPARISON RESULTS")
    print(f"{'='*70}\n")
    
    # Map expected fields to our fields
    comparisons = [
        ("invoice_number", "invoice_id", expected.get("invoice_number", "")),
        ("company", "vendor_name", expected.get("company", "")),
        ("date", "invoice_date", expected.get("date", "")),
        ("total", "total_amount", expected.get("total", "")),
    ]
    
    matches = 0
    total = 0
    
    for exp_key, our_key, exp_val in comparisons:
        if exp_val:
            total += 1
            our_val = str(result.get(our_key, "")).lower().strip() if result.get(our_key) else ""
            exp_val_lower = str(exp_val).lower().strip()
            
            # Fuzzy matching
            match = False
            if our_val and exp_val_lower:
                # Exact match
                if our_val == exp_val_lower:
                    match = True
                # Contains match
                elif exp_val_lower in our_val or our_val in exp_val_lower:
                    match = True
                # Number match (for amounts)
                elif exp_key == "total":
                    # Handle European format: "1,35" vs "1.35"
                    our_num = our_val.replace(',', '.').replace(' ', '')
                    exp_num = exp_val_lower.replace(',', '.').replace(' ', '')
                    if our_num == exp_num:
                        match = True
            
            if match:
                matches += 1
                print(f"✓ {exp_key:20s}: Expected '{exp_val}' ≈ Got '{result.get(our_key, 'N/A')}'")
            else:
                print(f"✗ {exp_key:20s}: Expected '{exp_val}' ≠ Got '{result.get(our_key, 'N/A')}'")
    
    accuracy = (matches / total * 100) if total > 0 else 0
    print(f"\n{'='*70}")
    print(f"Accuracy: {matches}/{total} ({accuracy:.1f}%)")
    print(f"LLM Used: {llm_used}")
    print(f"Total Time: {time.time() - start_time:.2f}s")
    print(f"{'='*70}\n")
    
    return accuracy >= 50  # At least 50% match


if __name__ == "__main__":
    pdf_path = Path("sample data/1.pdf")
    expected_path = Path("sample data/1.json")
    
    if not pdf_path.exists():
        print(f"Error: {pdf_path} not found!")
        sys.exit(1)
    
    if not expected_path.exists():
        print(f"Error: {expected_path} not found!")
        sys.exit(1)
    
    success = test_against_expected(pdf_path, expected_path)
    sys.exit(0 if success else 1)

