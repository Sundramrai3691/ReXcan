"""Comprehensive analysis of invoice extraction on dataset samples."""
import json
import sys
from pathlib import Path
from typing import Dict, List, Any
from datasets import load_dataset
from app.extract_text import extract_text
from app.heuristics import (
    extract_invoice_id, extract_date, extract_total_amount,
    extract_currency, extract_vendor_name
)
from app.llm_router import LLMRouter
from app.canonicalize import VendorCanonicalizer
from app.confidence import compute_field_confidence, should_use_llm
from app.utils import timeit
from dotenv import load_dotenv
import re

load_dotenv()


def parse_ground_truth(parsed_data: str) -> Dict[str, Any]:
    """Parse ground truth from dataset's parsed_data field."""
    try:
        # The parsed_data is a string containing JSON
        # It might be double-encoded
        if isinstance(parsed_data, str):
            # Try to extract JSON part
            json_match = re.search(r'\{.*\}', parsed_data)
            if json_match:
                json_str = json_match.group(0)
                # Replace single quotes with double quotes
                json_str = json_str.replace("'", '"')
                data = json.loads(json_str)
                
                # Navigate to header if exists
                if 'header' in data:
                    header = data['header']
                    return {
                        'invoice_id': header.get('invoice_no', ''),
                        'invoice_date': header.get('invoice_date', ''),
                        'total_amount': header.get('total', ''),
                        'currency': header.get('currency', ''),
                        'vendor_name': header.get('seller', '')
                    }
    except Exception as e:
        pass
    return {}


def normalize_for_comparison(value: Any) -> str:
    """Normalize value for comparison."""
    if value is None:
        return ""
    if isinstance(value, float):
        # Round to 2 decimal places
        return f"{value:.2f}"
    return str(value).strip().lower()


def compare_values(extracted: Any, expected: Any, field_name: str) -> bool:
    """Compare extracted and expected values with field-specific logic."""
    if extracted is None and (expected is None or expected == ""):
        return True
    if extracted is None or expected is None or expected == "":
        return False
    
    extracted_norm = normalize_for_comparison(extracted)
    expected_norm = normalize_for_comparison(expected)
    
    # Exact match
    if extracted_norm == expected_norm:
        return True
    
    # For invoice_id: check if extracted is contained in expected or vice versa
    if field_name == "invoice_id":
        if extracted_norm in expected_norm or expected_norm in extracted_norm:
            return True
    
    # For total_amount: numerical comparison with tolerance
    if field_name == "total_amount":
        try:
            ext_float = float(extracted_norm.replace(',', '.'))
            exp_float = float(expected_norm.replace(',', '.').replace('$', '').replace('€', '').strip())
            # Allow 0.01 tolerance
            return abs(ext_float - exp_float) < 0.01
        except:
            pass
    
    # For dates: try parsing both
    if field_name in ["invoice_date", "due_date"]:
        try:
            from dateutil import parser as date_parser
            ext_date = date_parser.parse(str(extracted), fuzzy=True).date()
            exp_date = date_parser.parse(str(expected), fuzzy=True).date()
            return ext_date == exp_date
        except:
            pass
    
    return False


def analyze_sample(sample: Dict, sample_idx: int, llm_router: LLMRouter, 
                   vendor_canon: VendorCanonicalizer) -> Dict[str, Any]:
    """Analyze a single sample and return detailed results."""
    print(f"\n[{sample_idx+1}/20] Processing sample {sample['id']}...")
    
    # Get ground truth
    parsed_data = sample.get('parsed_data', '')
    ground_truth = parse_ground_truth(parsed_data)
    
    # Save image to temp file
    import tempfile
    image = sample['image']
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        image.save(f.name)
        temp_path = Path(f.name)
    
    try:
        # Extract text
        result = extract_text(temp_path, use_cache=True)
        if isinstance(result, tuple):
            blocks, extraction_time = result
        else:
            blocks = result
            extraction_time = 0.0
        print(f"    → OCR: {len(blocks)} blocks in {extraction_time:.2f}s")
        
        # Extract fields with heuristics
        results = {}
        timings = {"ocr": extraction_time}
        
        # Invoice ID
        inv_id, inv_conf, inv_reason = extract_invoice_id(blocks)
        results['invoice_id'] = {
            'value': inv_id,
            'confidence': inv_conf,
            'reason': inv_reason,
            'method': 'heuristic'
        }
        
        # Invoice Date
        inv_date, date_conf, date_reason = extract_date(blocks, "invoice")
        results['invoice_date'] = {
            'value': inv_date,
            'confidence': date_conf,
            'reason': date_reason,
            'method': 'heuristic'
        }
        
        # Total Amount
        total, total_conf, total_reason = extract_total_amount(blocks)
        results['total_amount'] = {
            'value': total,
            'confidence': total_conf,
            'reason': total_reason,
            'method': 'heuristic'
        }
        
        # Currency
        currency, curr_conf, curr_reason = extract_currency(blocks, total)
        results['currency'] = {
            'value': currency,
            'confidence': curr_conf,
            'reason': curr_reason,
            'method': 'heuristic'
        }
        
        # Vendor Name
        vendor, vendor_conf, vendor_reason = extract_vendor_name(blocks)
        vendor_id = vendor_canon.canonicalize(vendor) if vendor else None
        results['vendor_name'] = {
            'value': vendor,
            'vendor_id': vendor_id,
            'confidence': vendor_conf,
            'reason': vendor_reason,
            'method': 'heuristic'
        }
        
        # Check if LLM needed
        fields_to_extract = []
        llm_results = {}
        
        for field_name, field_data in results.items():
            if field_name == 'currency':  # Skip currency for LLM
                continue
            value = field_data['value']
            confidence = field_data['confidence']
            should_llm, reason = should_use_llm(
                confidence, field_name, 
                is_required=True,
                timings=timings,
                field_missing=(value is None)
            )
            if should_llm:
                fields_to_extract.append(field_name)
        
        # Call LLM if needed
        if fields_to_extract:
            print(f"    → LLM needed for: {', '.join(fields_to_extract)}")
            llm_result, llm_time = timeit("llm_call", llm_router.extract_fields, 
                                         fields_to_extract, blocks, temp_path, timeout=8.0)
            timings['llm'] = llm_time
            if llm_result:
                llm_results = llm_result
                # Update results with LLM values
                for field in fields_to_extract:
                    if field in llm_results and llm_results[field] is not None:
                        old_value = results[field]['value']
                        results[field]['value'] = llm_results[field]
                        results[field]['method'] = 'llm'
                        results[field]['llm_boost'] = True
                        print(f"      ✓ LLM extracted {field}: {llm_results[field]}")
        
        # Compare with ground truth
        comparison = {}
        field_accuracy = {}
        
        for field_name in ['invoice_id', 'invoice_date', 'total_amount', 'currency', 'vendor_name']:
            extracted = results[field_name]['value']
            expected = ground_truth.get(field_name, '')
            
            is_match = compare_values(extracted, expected, field_name)
            comparison[field_name] = {
                'extracted': extracted,
                'expected': expected,
                'match': is_match
            }
            field_accuracy[field_name] = 1.0 if is_match else 0.0
        
        # Calculate overall accuracy
        accuracy = sum(field_accuracy.values()) / len(field_accuracy)
        
        return {
            'sample_id': sample['id'],
            'extracted': {k: v['value'] for k, v in results.items()},
            'methods': {k: v['method'] for k, v in results.items()},
            'confidences': {k: v['confidence'] for k, v in results.items()},
            'reasons': {k: v['reason'] for k, v in results.items()},
            'comparison': comparison,
            'field_accuracy': field_accuracy,
            'overall_accuracy': accuracy,
            'llm_used': len(fields_to_extract) > 0,
            'llm_fields': fields_to_extract,
            'timings': timings,
            'num_blocks': len(blocks)
        }
        
    finally:
        # Cleanup
        temp_path.unlink()


def main():
    """Run comprehensive analysis on 20 samples."""
    print("=" * 80)
    print("COMPREHENSIVE INVOICE EXTRACTION ANALYSIS")
    print("=" * 80)
    
    # Load dataset
    print("\nLoading Hugging Face dataset...")
    ds = load_dataset('mychen76/invoices-and-receipts_ocr_v1', split='train')
    print(f"✓ Loaded dataset with {len(ds)} samples")
    
    # Initialize services
    llm_router = LLMRouter()
    vendor_canon = VendorCanonicalizer()
    
    # Analyze 20 samples
    num_samples = min(20, len(ds))
    all_results = []
    
    for i in range(num_samples):
        sample = ds[i]
        try:
            result = analyze_sample(sample, i, llm_router, vendor_canon)
            all_results.append(result)
        except Exception as e:
            print(f"    ✗ Error: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    # Calculate aggregate metrics
    print("\n" + "=" * 80)
    print("AGGREGATE METRICS")
    print("=" * 80)
    
    total_samples = len(all_results)
    if total_samples == 0:
        print("No samples processed successfully!")
        return
    
    # Field-level accuracy
    field_accuracies = {
        'invoice_id': [],
        'invoice_date': [],
        'total_amount': [],
        'currency': [],
        'vendor_name': []
    }
    
    for result in all_results:
        for field, acc in result['field_accuracy'].items():
            field_accuracies[field].append(acc)
    
    print("\nField-Level Accuracy:")
    for field, accuracies in field_accuracies.items():
        avg_acc = sum(accuracies) / len(accuracies) if accuracies else 0
        correct = sum(accuracies)
        print(f"  {field:20s}: {avg_acc*100:6.2f}% ({correct}/{total_samples})")
    
    # Overall accuracy
    overall_accuracies = [r['overall_accuracy'] for r in all_results]
    avg_overall = sum(overall_accuracies) / len(overall_accuracies)
    print(f"\nOverall Accuracy: {avg_overall*100:.2f}%")
    
    # LLM usage
    llm_used_count = sum(1 for r in all_results if r['llm_used'])
    print(f"LLM Usage Rate: {llm_used_count/total_samples*100:.2f}% ({llm_used_count}/{total_samples})")
    
    # Method breakdown
    method_counts = {'heuristic': 0, 'llm': 0}
    for result in all_results:
        for method in result['methods'].values():
            method_counts[method] = method_counts.get(method, 0) + 1
    
    print(f"\nExtraction Methods:")
    print(f"  Heuristic: {method_counts.get('heuristic', 0)}")
    print(f"  LLM: {method_counts.get('llm', 0)}")
    
    # Average timings
    avg_timings = {}
    for result in all_results:
        for key, value in result['timings'].items():
            if key not in avg_timings:
                avg_timings[key] = []
            avg_timings[key].append(value)
    
    print(f"\nAverage Timings:")
    for key, values in avg_timings.items():
        avg = sum(values) / len(values) if values else 0
        print(f"  {key:15s}: {avg:.2f}s")
    
    # Detailed per-sample analysis
    print("\n" + "=" * 80)
    print("DETAILED PER-SAMPLE ANALYSIS")
    print("=" * 80)
    
    for i, result in enumerate(all_results, 1):
        print(f"\n--- Sample {i}: ID={result['sample_id']} ---")
        print(f"Overall Accuracy: {result['overall_accuracy']*100:.1f}%")
        print(f"LLM Used: {result['llm_used']} ({', '.join(result['llm_fields']) if result['llm_fields'] else 'none'})")
        print(f"Processing Time: {sum(result['timings'].values()):.2f}s")
        print(f"OCR Blocks: {result['num_blocks']}")
        
        print("\nField Details:")
        for field in ['invoice_id', 'invoice_date', 'total_amount', 'currency', 'vendor_name']:
            comp = result['comparison'][field]
            method = result['methods'][field]
            conf = result['confidences'][field]
            match = "✓" if comp['match'] else "✗"
            
            print(f"  {field:15s} {match} | Method: {method:9s} | Conf: {conf:.2f}")
            print(f"    Expected: {comp['expected'] or '(empty)'}")
            print(f"    Extracted: {comp['extracted'] or '(null)'}")
            if not comp['match']:
                print(f"    Reason: {result['reasons'][field]}")
    
    # Missing/Incorrect fields analysis
    print("\n" + "=" * 80)
    print("MISSING/INCORRECT FIELDS ANALYSIS")
    print("=" * 80)
    
    missing_by_field = {field: 0 for field in field_accuracies.keys()}
    incorrect_by_field = {field: 0 for field in field_accuracies.keys()}
    
    for result in all_results:
        for field, comp in result['comparison'].items():
            if comp['extracted'] is None and comp['expected']:
                missing_by_field[field] += 1
            elif not comp['match']:
                incorrect_by_field[field] += 1
    
    print("\nMissing Fields (expected but not extracted):")
    for field, count in missing_by_field.items():
        if count > 0:
            print(f"  {field:20s}: {count}/{total_samples} ({count/total_samples*100:.1f}%)")
    
    print("\nIncorrect Fields (extracted but wrong):")
    for field, count in incorrect_by_field.items():
        if count > 0:
            print(f"  {field:20s}: {count}/{total_samples} ({count/total_samples*100:.1f}%)")
    
    # Save detailed results
    output_file = Path("detailed_analysis_results.json")
    with open(output_file, 'w') as f:
        json.dump({
            'summary': {
                'total_samples': total_samples,
                'field_accuracies': {k: sum(v)/len(v) if v else 0 for k, v in field_accuracies.items()},
                'overall_accuracy': avg_overall,
                'llm_usage_rate': llm_used_count/total_samples,
                'method_counts': method_counts,
                'avg_timings': {k: sum(v)/len(v) if v else 0 for k, v in avg_timings.items()}
            },
            'samples': all_results
        }, f, indent=2)
    
    print(f"\n✓ Detailed results saved to {output_file}")
    print("=" * 80)


if __name__ == "__main__":
    main()

