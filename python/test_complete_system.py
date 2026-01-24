"""Complete system test with detailed diagnostics."""
import sys
from pathlib import Path
import json
import time
import os

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


def check_llm_availability():
    """Check which LLM providers are available."""
    providers = []
    if os.getenv("GROQ_API_KEY"):
        providers.append("Groq")
    if os.getenv("GEMINI_API_KEY"):
        providers.append("Gemini")
    if os.getenv("OPENAI_API_KEY"):
        providers.append("OpenAI")
    if os.getenv("ANTHROPIC_API_KEY"):
        providers.append("Anthropic")
    return providers


def diagnose_extraction(pdf_path: Path):
    """Diagnose text extraction issues."""
    print("\n" + "="*70)
    print("DIAGNOSTIC: Text Extraction")
    print("="*70)
    
    ocr_engine = OCREngine()
    blocks = extract_text(pdf_path, ocr_engine)
    
    print(f"\nExtracted {len(blocks)} blocks")
    print(f"Total characters: {sum(len(b.text) for b in blocks)}")
    
    # Show all extracted text
    print("\nAll extracted text blocks:")
    for i, block in enumerate(blocks[:30], 1):  # First 30 blocks
        text = block.text.strip()
        if text:
            print(f"  {i:2d}. [{block.engine:10s}] {text}")
    
    if len(blocks) > 30:
        print(f"  ... and {len(blocks) - 30} more blocks")
    
    return blocks


def test_heuristics_against_text(blocks, expected_json_path: Path):
    """Test heuristics with extracted text and show what's found."""
    print("\n" + "="*70)
    print("DIAGNOSTIC: Heuristic Extraction")
    print("="*70)
    
    with open(expected_json_path, 'r') as f:
        expected = json.load(f)
    
    # Test each field
    print("\n[Invoice ID]")
    invoice_id = extract_invoice_id(blocks)
    print(f"  Extracted: {invoice_id[0]}")
    print(f"  Confidence: {invoice_id[1]:.2f}")
    print(f"  Reason: {invoice_id[2]}")
    print(f"  Expected: {expected.get('invoice_number', 'N/A')}")
    print(f"  Match: {'✓' if invoice_id[0] and expected.get('invoice_number', '').lower() in str(invoice_id[0]).lower() else '✗'}")
    
    print("\n[Invoice Date]")
    invoice_date = extract_date(blocks, "invoice")
    print(f"  Extracted: {invoice_date[0]}")
    print(f"  Confidence: {invoice_date[1]:.2f}")
    print(f"  Reason: {invoice_date[2]}")
    print(f"  Expected: {expected.get('date', 'N/A')}")
    
    print("\n[Total Amount]")
    total_amount = extract_total_amount(blocks)
    print(f"  Extracted: {total_amount[0]}")
    print(f"  Confidence: {total_amount[1]:.2f}")
    print(f"  Reason: {total_amount[2]}")
    print(f"  Expected: {expected.get('total', 'N/A')}")
    
    print("\n[Vendor Name]")
    vendor_name = extract_vendor_name(blocks)
    print(f"  Extracted: {vendor_name[0]}")
    print(f"  Confidence: {vendor_name[1]:.2f}")
    print(f"  Reason: {vendor_name[2]}")
    print(f"  Expected: {expected.get('company', 'N/A')}")
    
    return {
        'invoice_id': invoice_id,
        'invoice_date': invoice_date,
        'total_amount': total_amount,
        'vendor_name': vendor_name
    }


def test_full_pipeline_with_llm(pdf_path: Path, expected_json_path: Path):
    """Test complete pipeline including LLM fallback."""
    print("\n" + "="*70)
    print("COMPLETE PIPELINE TEST")
    print("="*70)
    
    # Check LLM availability
    llm_providers = check_llm_availability()
    print(f"\nLLM Providers Available: {llm_providers if llm_providers else 'None (add API keys to .env)'}")
    
    # Load expected
    with open(expected_json_path, 'r') as f:
        expected = json.load(f)
    
    start_time = time.time()
    
    # Step 1: Extract
    print("\n[1/7] Text Extraction...")
    ocr_engine = OCREngine()
    blocks = extract_text(pdf_path, ocr_engine)
    print(f"  ✓ {len(blocks)} blocks extracted")
    
    if len(blocks) == 0:
        print("  ✗ FAIL: No text extracted!")
        return False
    
    # Step 2: Heuristics
    print("\n[2/7] Heuristic Extraction...")
    results = {
        'invoice_id': extract_invoice_id(blocks),
        'invoice_date': extract_date(blocks, "invoice"),
        'total_amount': extract_total_amount(blocks),
        'currency': extract_currency(blocks, None),
        'vendor_name': extract_vendor_name(blocks),
    }
    
    # Step 3: Confidence
    print("\n[3/7] Confidence Scoring...")
    confidences = {}
    for field, (value, h_conf, reason) in results.items():
        if field == 'currency':
            conf, _ = compute_field_confidence(field, value, blocks, (value, h_conf, reason))
        else:
            conf, _ = compute_field_confidence(field, value, blocks, (value, h_conf, reason))
        confidences[field] = conf
        print(f"  {field:15s}: {conf:.2f} ({'auto' if conf >= 0.85 else 'flag' if conf >= 0.5 else 'llm'})")
    
    # Step 4: LLM Fallback
    print("\n[4/7] LLM Fallback Check...")
    fields_needing_llm = []
    for field, conf in confidences.items():
        if should_use_llm(conf, field, is_required=(field != 'currency')):
            fields_needing_llm.append(field)
    
    if fields_needing_llm:
        print(f"  → Fields needing LLM: {fields_needing_llm}")
        if llm_providers:
            print(f"  → Calling LLM ({llm_providers[0]})...")
            llm_router = LLMRouter()
            llm_result = llm_router.extract_fields(fields_needing_llm, blocks)
            if llm_result:
                print(f"  ✓ LLM extraction completed")
                # Update results
                for field in fields_needing_llm:
                    if field in llm_result and llm_result[field]:
                        old_val = results[field][0]
                        results[field] = (llm_result[field], 0.7, "LLM extraction")
                        print(f"    {field}: '{old_val}' → '{llm_result[field]}'")
            else:
                print(f"  ✗ LLM extraction failed")
        else:
            print(f"  ⚠ LLM not available (no API keys)")
    else:
        print(f"  ✓ No LLM fallback needed")
    
    # Step 5: Canonicalization
    print("\n[5/7] Canonicalization...")
    final = {
        'invoice_id': results['invoice_id'][0],
        'invoice_date': canonicalize_date(results['invoice_date'][0]),
        'total_amount': canonicalize_amount(str(results['total_amount'][0])) if results['total_amount'][0] else None,
        'currency': canonicalize_currency(results['currency'][0]),
    }
    
    vendor_canonicalizer = VendorCanonicalizer()
    if results['vendor_name'][0]:
        vendor_id, vendor_name, _, _ = vendor_canonicalizer.canonicalize(results['vendor_name'][0])
        final['vendor_name'] = vendor_name
        final['vendor_id'] = vendor_id
    else:
        final['vendor_name'] = None
        final['vendor_id'] = None
    
    # Step 6: Validation
    print("\n[6/7] Validation...")
    print(json.dumps(final, indent=2, default=str))
    
    # Step 7: Comparison
    print("\n[7/7] Comparison with Expected...")
    print("="*70)
    
    matches = {
        'invoice_number': (expected.get('invoice_number', ''), final.get('invoice_id')),
        'company': (expected.get('company', ''), final.get('vendor_name')),
        'date': (expected.get('date', ''), final.get('invoice_date')),
        'total': (expected.get('total', ''), str(final.get('total_amount', ''))),
    }
    
    correct = 0
    total = 0
    
    for field, (exp, got) in matches.items():
        if exp:
            total += 1
            exp_lower = str(exp).lower().strip()
            got_lower = str(got).lower().strip() if got else ""
            
            # Fuzzy match
            match = False
            if got_lower and exp_lower:
                if exp_lower in got_lower or got_lower in exp_lower:
                    match = True
                elif field == 'total':
                    # Handle number formats
                    exp_num = exp_lower.replace(',', '.').replace(' ', '')
                    got_num = got_lower.replace(',', '.').replace(' ', '')
                    if exp_num == got_num:
                        match = True
            
            if match:
                correct += 1
                print(f"✓ {field:20s}: '{exp}' ≈ '{got}'")
            else:
                print(f"✗ {field:20s}: Expected '{exp}' ≠ Got '{got}'")
    
    accuracy = (correct / total * 100) if total > 0 else 0
    elapsed = time.time() - start_time
    
    print(f"\n{'='*70}")
    print(f"RESULTS: {correct}/{total} correct ({accuracy:.1f}%)")
    print(f"Time: {elapsed:.2f}s")
    print(f"LLM Used: {len(fields_needing_llm) > 0 and llm_providers}")
    print(f"{'='*70}\n")
    
    return accuracy >= 50


def main():
    """Run complete system test."""
    pdf_path = Path("sample data/1.pdf")
    expected_path = Path("sample data/1.json")
    
    if not pdf_path.exists():
        print(f"Error: {pdf_path} not found!")
        return
    
    if not expected_path.exists():
        print(f"Error: {expected_path} not found!")
        return
    
    # Diagnostic: Show extracted text
    blocks = diagnose_extraction(pdf_path)
    
    # Diagnostic: Test heuristics
    test_heuristics_against_text(blocks, expected_path)
    
    # Full pipeline test
    success = test_full_pipeline_with_llm(pdf_path, expected_path)
    
    print("\n" + "="*70)
    if success:
        print("✓ SYSTEM TEST PASSED")
    else:
        print("✗ SYSTEM TEST FAILED - Review diagnostics above")
    print("="*70)


if __name__ == "__main__":
    main()

