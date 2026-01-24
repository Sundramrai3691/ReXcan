"""Batch extract metrics for gold set."""
import sys
from pathlib import Path
import json
import time
from typing import Dict, List
from collections import defaultdict

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
from app.confidence import compute_field_confidence, should_use_llm, get_confidence_badge
from app.llm_router import LLMRouter
from app.safety import get_safety_guard


def process_gold_file(pdf_path: Path, expected_json_path: Path) -> Dict:
    """Process a single gold file and return metrics."""
    print(f"\nProcessing: {pdf_path.name}")
    
    # Load expected
    with open(expected_json_path, 'r', encoding='utf-8') as f:
        expected = json.load(f)
    
    timings = {}
    start = time.time()
    
    # Extract
    extract_start = time.time()
    ocr_engine = OCREngine()
    blocks = extract_text(pdf_path, ocr_engine)
    timings['extraction'] = time.time() - extract_start
    
    # Heuristics
    heur_start = time.time()
    results = {
        'invoice_id': extract_invoice_id(blocks),
        'invoice_date': extract_date(blocks, "invoice"),
        'total_amount': extract_total_amount(blocks),
        'currency': extract_currency(blocks, None),
        'vendor_name': extract_vendor_name(blocks),
    }
    timings['heuristics'] = time.time() - heur_start
    
    # Confidence
    conf_start = time.time()
    confidences = {}
    for field, (value, h_conf, reason) in results.items():
        if field == 'currency':
            conf, _ = compute_field_confidence(field, value, blocks, (value, h_conf, reason))
        else:
            conf, _ = compute_field_confidence(field, value, blocks, (value, h_conf, reason))
        confidences[field] = conf
    timings['confidence'] = time.time() - conf_start
    
    # LLM
    llm_start = time.time()
    fields_needing_llm = [f for f, c in confidences.items() 
                         if should_use_llm(c, f, is_required=(f != 'currency'))]
    llm_used = False
    llm_fields_extracted = 0
    
    if fields_needing_llm:
        safety_guard = get_safety_guard()
        if safety_guard.should_use_llm(confidences.get(fields_needing_llm[0], 0), fields_needing_llm[0]):
            llm_router = LLMRouter()
            if llm_router.providers:
                llm_result = llm_router.extract_fields(fields_needing_llm, blocks, pdf_path)
                if llm_result:
                    llm_used = True
                    llm_fields_extracted = len([k for k, v in llm_result.items() if v])
                    for field in fields_needing_llm:
                        if field in llm_result and llm_result[field]:
                            results[field] = (llm_result[field], 0.7, "LLM extraction")
    timings['llm'] = time.time() - llm_start
    
    # Canonicalization
    canon_start = time.time()
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
    timings['canonicalization'] = time.time() - canon_start
    
    # Compare - handle different JSON structures
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
    field_results = {}
    
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
            
            if match:
                correct += 1
                field_results[field] = True
            else:
                field_results[field] = False
    
    accuracy = (correct / total * 100) if total > 0 else 0
    timings['total'] = time.time() - start
    
    return {
        'pdf': pdf_path.name,
        'accuracy': accuracy,
        'correct': correct,
        'total': total,
        'field_results': field_results,
        'confidences': confidences,
        'llm_used': llm_used,
        'llm_fields_extracted': llm_fields_extracted,
        'timings': timings,
        'extracted': final,
        'expected': expected
    }


def main():
    """Run batch extraction on all gold files."""
    print("="*70)
    print("BATCH EXTRACTION METRICS")
    print("="*70)
    
    sample_dir = Path(__file__).parent.parent / "sample data"
    pdf_files = sorted(sample_dir.glob("*.pdf"))
    
    if not pdf_files:
        print("No PDF files found in sample data/")
        return
    
    results = []
    all_timings = defaultdict(list)
    all_confidences = defaultdict(list)
    field_accuracies = defaultdict(lambda: {'correct': 0, 'total': 0})
    llm_usage_count = 0
    auto_accept_count = 0
    flag_count = 0
    llm_required_count = 0
    
    for pdf_path in pdf_files:
        json_path = sample_dir / f"{pdf_path.stem}.json"
        if json_path.exists():
            try:
                result = process_gold_file(pdf_path, json_path)
                results.append(result)
                
                # Aggregate metrics
                for timing, value in result['timings'].items():
                    all_timings[timing].append(value)
                
                for field, conf in result['confidences'].items():
                    all_confidences[field].append(conf)
                    badge = get_confidence_badge(conf)
                    if badge == 'auto-accept':
                        auto_accept_count += 1
                    elif badge == 'flag':
                        flag_count += 1
                    else:
                        llm_required_count += 1
                
                for field, is_correct in result['field_results'].items():
                    field_accuracies[field]['total'] += 1
                    if is_correct:
                        field_accuracies[field]['correct'] += 1
                
                if result['llm_used']:
                    llm_usage_count += 1
                    
            except Exception as e:
                print(f"Error processing {pdf_path.name}: {e}")
                import traceback
                traceback.print_exc()
    
    # Print summary
    print("\n" + "="*70)
    print("METRICS SUMMARY")
    print("="*70)
    
    total_pdfs = len(results)
    avg_accuracy = sum(r['accuracy'] for r in results) / total_pdfs if total_pdfs > 0 else 0
    
    print(f"\n📊 Overall Metrics:")
    print(f"  Total PDFs: {total_pdfs}")
    print(f"  Average Accuracy: {avg_accuracy:.1f}%")
    print(f"  LLM Usage Rate: {llm_usage_count}/{total_pdfs} ({llm_usage_count/total_pdfs*100:.1f}%)")
    
    print(f"\n⏱️  Timing Metrics (seconds):")
    for timing in ['extraction', 'heuristics', 'confidence', 'llm', 'canonicalization', 'total']:
        if timing in all_timings:
            avg_time = sum(all_timings[timing]) / len(all_timings[timing])
            print(f"  {timing:20s}: {avg_time:.2f}s (avg)")
    
    print(f"\n🎯 Field Accuracies:")
    for field, stats in field_accuracies.items():
        if stats['total'] > 0:
            acc = stats['correct'] / stats['total'] * 100
            print(f"  {field:20s}: {stats['correct']}/{stats['total']} ({acc:.1f}%)")
    
    print(f"\n📈 Confidence Distribution:")
    print(f"  Auto-accept (>=0.85): {auto_accept_count}")
    print(f"  Flag (0.5-0.85): {flag_count}")
    print(f"  LLM-required (<0.5): {llm_required_count}")
    
    if all_confidences:
        avg_confidences = {field: sum(confs) / len(confs) 
                          for field, confs in all_confidences.items()}
        print(f"\n📊 Average Confidences:")
        for field, avg_conf in avg_confidences.items():
            badge = get_confidence_badge(avg_conf)
            print(f"  {field:20s}: {avg_conf:.3f} ({badge})")
    
    print(f"\n📋 Per-File Results:")
    for result in results:
        status = "✓" if result['accuracy'] >= 50 else "✗"
        print(f"  {status} {result['pdf']:20s} - {result['accuracy']:5.1f}% - {result['timings']['total']:.1f}s")
        if result['llm_used']:
            print(f"      → LLM extracted {result['llm_fields_extracted']} fields")
    
    print("\n" + "="*70)


if __name__ == "__main__":
    main()
