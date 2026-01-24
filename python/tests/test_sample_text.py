"""Test sample_text.pdf extraction."""
import sys
from pathlib import Path
import json

sys.path.insert(0, str(Path(__file__).parent.parent))

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


def test_sample_text():
    """Test extraction on sample_text.pdf."""
    pdf_path = Path("sample data/sample_text.pdf")
    expected_path = Path("sample data/sample_text.json")
    
    if not pdf_path.exists():
        print(f"Error: {pdf_path} not found!")
        return False
    
    if not expected_path.exists():
        print(f"Error: {expected_path} not found!")
        return False
    
    print("="*70)
    print("Testing sample_text.pdf")
    print("="*70)
    
    # Load expected
    with open(expected_path, 'r', encoding='utf-8') as f:
        expected = json.load(f)
    
    print(f"\nExpected:")
    print(json.dumps(expected, indent=2))
    
    # Extract
    print("\n[1] Text Extraction...")
    ocr_engine = OCREngine()
    blocks = extract_text(pdf_path, ocr_engine)
    print(f"  ✓ {len(blocks)} blocks extracted")
    
    if len(blocks) == 0:
        print("  ✗ FAIL: No text extracted!")
        return False
    
    # Show first 20 blocks
    print("\n  First 20 blocks:")
    for i, block in enumerate(blocks[:20], 1):
        print(f"    {i:2d}. [{block.engine:10s}] {block.text[:60]}")
    
    # Heuristics
    print("\n[2] Heuristic Extraction...")
    results = {
        'invoice_id': extract_invoice_id(blocks),
        'invoice_date': extract_date(blocks, "invoice"),
        'total_amount': extract_total_amount(blocks),
        'currency': extract_currency(blocks, None),
        'vendor_name': extract_vendor_name(blocks),
    }
    
    print("\n  Results:")
    for field, (value, conf, reason) in results.items():
        print(f"    {field:15s}: {value} (conf: {conf:.2f}, reason: {reason})")
    
    # Confidence
    print("\n[3] Confidence Scoring...")
    confidences = {}
    for field, (value, h_conf, reason) in results.items():
        conf, _ = compute_field_confidence(field, value, blocks, (value, h_conf, reason))
        confidences[field] = conf
        badge = "auto" if conf >= 0.85 else "flag" if conf >= 0.5 else "llm"
        print(f"    {field:15s}: {conf:.2f} ({badge})")
    
    # LLM Fallback
    print("\n[4] LLM Fallback Check...")
    fields_needing_llm = [f for f, c in confidences.items() 
                         if should_use_llm(c, f, is_required=(f != 'currency'))]
    
    if fields_needing_llm:
        print(f"  → Fields needing LLM: {fields_needing_llm}")
        llm_router = LLMRouter()
        if llm_router.providers:
            print(f"  → Calling LLM ({llm_router.providers[0]})...")
            llm_result = llm_router.extract_fields(fields_needing_llm, blocks, pdf_path)
            if llm_result:
                print(f"  ✓ LLM extraction completed")
                for field in fields_needing_llm:
                    if field in llm_result and llm_result[field]:
                        old_val = results[field][0]
                        results[field] = (llm_result[field], 0.7, "LLM extraction")
                        print(f"    {field}: '{old_val}' → '{llm_result[field]}'")
        else:
            print(f"  ⚠ No LLM providers available")
    else:
        print(f"  ✓ No LLM fallback needed")
    
    # Canonicalization
    print("\n[5] Canonicalization...")
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
    
    print("\n  Final Results:")
    print(json.dumps(final, indent=2, default=str))
    
    # Compare - handle different JSON structures
    print("\n[6] Comparison...")
    
    # Try different expected JSON structures
    invoice_number_exp = expected.get('invoice_number') or expected.get('invoice', {}).get('invoice_number', '')
    company_exp = expected.get('company') or expected.get('seller', {}).get('name', '') or expected.get('bill_to', {}).get('company', '')
    date_exp = expected.get('date') or expected.get('invoice', {}).get('issue_date', '')
    total_exp = expected.get('total') or expected.get('summary', {}).get('total', '')
    
    matches = {
        'invoice_number': (invoice_number_exp, final.get('invoice_id')),
        'company': (company_exp, final.get('vendor_name')),
        'date': (date_exp, final.get('invoice_date')),
        'total': (str(total_exp) if total_exp else '', str(final.get('total_amount', '')) if final.get('total_amount') else ''),
    }
    
    correct = 0
    total = 0
    
    for field, (exp, got) in matches.items():
        if exp:
            total += 1
            exp_lower = str(exp).lower().strip()
            got_lower = str(got).lower().strip() if got else ""
            
            match = False
            if got_lower and exp_lower:
                if exp_lower in got_lower or got_lower in exp_lower:
                    match = True
                elif field == 'total':
                    try:
                        exp_num = float(exp_lower.replace(',', '.').replace(' ', '').replace('€', '').replace('$', ''))
                        got_num = float(got_lower.replace(',', '.').replace(' ', '').replace('€', '').replace('$', ''))
                        if abs(exp_num - got_num) < 0.01:
                            match = True
                    except:
                        pass
            
            status = "✓" if match else "✗"
            print(f"  {status} {field:20s}: Expected '{exp}' vs Got '{got}'")
            if match:
                correct += 1
    
    accuracy = (correct / total * 100) if total > 0 else 0
    print(f"\n  Accuracy: {correct}/{total} ({accuracy:.1f}%)")
    
    print("\n" + "="*70)
    if accuracy >= 75:
        print("✓ TEST PASSED")
    else:
        print("✗ TEST FAILED")
    print("="*70)
    
    return accuracy >= 75


if __name__ == "__main__":
    test_sample_text()

