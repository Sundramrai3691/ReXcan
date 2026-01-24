"""Batch test all PDFs in sample data against their JSON files."""
import sys
from pathlib import Path
import json
import time
import os
from typing import Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).parent))

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

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
import os


def process_single_pdf(pdf_path: Path, expected_json_path: Path) -> Dict:
    """Process a single PDF and compare with expected JSON."""
    print(f"\n{'='*70}")
    print(f"Processing: {pdf_path.name}")
    print(f"{'='*70}")
    
    # Load expected
    with open(expected_json_path, 'r', encoding='utf-8') as f:
        expected = json.load(f)
    
    start_time = time.time()
    
    # Extract text
    print("\n[1] Text Extraction...")
    ocr_engine = OCREngine()
    blocks = extract_text(pdf_path, ocr_engine)
    extraction_time = time.time() - start_time
    print(f"  ✓ {len(blocks)} blocks in {extraction_time:.1f}s")
    
    if len(blocks) == 0:
        return {
            'pdf': pdf_path.name,
            'success': False,
            'accuracy': 0.0,
            'time': extraction_time,
            'errors': ['No text extracted']
        }
    
    # Heuristics
    print("\n[2] Heuristic Extraction...")
    results = {
        'invoice_id': extract_invoice_id(blocks),
        'invoice_date': extract_date(blocks, "invoice"),
        'total_amount': extract_total_amount(blocks),
        'currency': extract_currency(blocks, None),
        'vendor_name': extract_vendor_name(blocks),
    }
    
    # Confidence
    print("\n[3] Confidence Scoring...")
    confidences = {}
    for field, (value, h_conf, reason) in results.items():
        conf, _ = compute_field_confidence(field, value, blocks, (value, h_conf, reason))
        confidences[field] = conf
    
    # LLM Fallback
    print("\n[4] LLM Fallback...")
    fields_needing_llm = [f for f, c in confidences.items() 
                         if should_use_llm(c, f, is_required=(f != 'currency'))]
    
    llm_used = False
    if fields_needing_llm:
        print(f"  → Fields needing LLM: {fields_needing_llm}")
        llm_router = LLMRouter()
        print(f"  → Available LLM providers: {llm_router.providers if llm_router.providers else 'None'}")
        if llm_router.providers:
            try:
                llm_result = llm_router.extract_fields(fields_needing_llm, blocks, pdf_path)
                if llm_result:
                    llm_used = True
                    print(f"  ✓ LLM extracted {len([k for k, v in llm_result.items() if v])} fields")
                    for field in fields_needing_llm:
                        if field in llm_result and llm_result[field]:
                            results[field] = (llm_result[field], 0.7, "LLM extraction")
                else:
                    print(f"  ✗ LLM extraction returned no results")
            except Exception as e:
                print(f"  ✗ LLM extraction failed: {str(e)[:100]}")
        else:
            print(f"  ⚠ No LLM providers available (check .env file)")
    
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
    
    # Compare
    print("\n[6] Comparison...")
    matches = {
        'invoice_number': (expected.get('invoice_number', ''), final.get('invoice_id') or ''),
        'company': (expected.get('company', ''), final.get('vendor_name') or ''),
        'date': (expected.get('date', ''), final.get('invoice_date') or ''),
        'total': (expected.get('total', ''), str(final.get('total_amount', '')) if final.get('total_amount') else ''),
    }
    
    correct = 0
    total = 0
    field_results = {}
    
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
                    # Handle both string and float comparisons
                    try:
                        exp_num = float(exp_lower.replace(',', '.').replace(' ', '').replace('€', '').replace('$', ''))
                        got_num = float(got_lower.replace(',', '.').replace(' ', '').replace('€', '').replace('$', ''))
                        # Allow small floating point differences
                        if abs(exp_num - got_num) < 0.01:
                            match = True
                    except:
                        exp_num = exp_lower.replace(',', '.').replace(' ', '')
                        got_num = got_lower.replace(',', '.').replace(' ', '')
                        if exp_num == got_num:
                            match = True
            
            if match:
                correct += 1
                field_results[field] = '✓'
            else:
                field_results[field] = '✗'
    
    accuracy = (correct / total * 100) if total > 0 else 0
    total_time = time.time() - start_time
    
    print(f"  Accuracy: {correct}/{total} ({accuracy:.1f}%)")
    print(f"  Time: {total_time:.1f}s")
    print(f"  LLM Used: {llm_used}")
    
    return {
        'pdf': pdf_path.name,
        'success': accuracy >= 50,
        'accuracy': accuracy,
        'time': total_time,
        'extraction_time': extraction_time,
        'llm_used': llm_used,
        'field_results': field_results,
        'extracted': final,
        'expected': expected
    }


def main():
    """Test all PDFs in sample data."""
    print("\n" + "="*70)
    print("BATCH TEST: All PDFs in Sample Data")
    print("="*70)
    
    sample_dir = Path("sample data")
    pdf_files = sorted(sample_dir.glob("*.pdf"))
    
    if not pdf_files:
        print("No PDF files found in sample data/")
        return
    
    results = []
    
    for pdf_path in pdf_files:
        json_path = sample_dir / f"{pdf_path.stem}.json"
        if json_path.exists():
            try:
                result = process_single_pdf(pdf_path, json_path)
                results.append(result)
            except Exception as e:
                print(f"\n✗ Error processing {pdf_path.name}: {e}")
                results.append({
                    'pdf': pdf_path.name,
                    'success': False,
                    'accuracy': 0.0,
                    'errors': [str(e)]
                })
        else:
            print(f"\n⚠ Skipping {pdf_path.name} (no corresponding JSON)")
    
    # Summary
    print("\n" + "="*70)
    print("BATCH TEST SUMMARY")
    print("="*70)
    
    total_pdfs = len(results)
    passed = sum(1 for r in results if r.get('success', False))
    total_accuracy = sum(r.get('accuracy', 0) for r in results) / total_pdfs if total_pdfs > 0 else 0
    avg_time = sum(r.get('time', 0) for r in results) / total_pdfs if total_pdfs > 0 else 0
    llm_used_count = sum(1 for r in results if r.get('llm_used', False))
    
    print(f"\nTotal PDFs: {total_pdfs}")
    print(f"Passed: {passed}/{total_pdfs}")
    print(f"Average Accuracy: {total_accuracy:.1f}%")
    print(f"Average Time: {avg_time:.1f}s")
    print(f"LLM Used: {llm_used_count}/{total_pdfs}")
    
    print("\nDetailed Results:")
    for result in results:
        status = "✓" if result.get('success') else "✗"
        print(f"{status} {result['pdf']:20s} - {result.get('accuracy', 0):5.1f}% - {result.get('time', 0):5.1f}s")
        if 'field_results' in result:
            for field, status in result['field_results'].items():
                print(f"    {status} {field}")
    
    print("\n" + "="*70)
    if passed == total_pdfs:
        print("✓ ALL TESTS PASSED")
    else:
        print(f"✗ {total_pdfs - passed} TEST(S) FAILED")
    print("="*70)


if __name__ == "__main__":
    main()

