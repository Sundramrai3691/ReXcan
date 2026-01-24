"""Validate InvoiceAce against Hugging Face dataset."""
import json
import re
import time
import os
import tempfile
from pathlib import Path
from typing import Dict, List, Any
from PIL import Image
from datasets import load_dataset
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from app.extract_text import extract_text
from app.heuristics import (
    extract_invoice_id, extract_date, extract_total_amount,
    extract_currency, extract_vendor_name
)
from app.confidence import compute_field_confidence, should_use_llm
from app.utils import timeit
from app.llm_router import LLMRouter
from app.canonicalize import (
    canonicalize_date, canonicalize_currency, canonicalize_amount,
    VendorCanonicalizer
)

def process_invoice_from_dataset(sample: Dict, llm_router: LLMRouter, vendor_canon: VendorCanonicalizer) -> Dict:
    """Process a single invoice from the dataset.
    
    Args:
        sample: Dataset sample with 'image' and 'ground_truth'
        llm_router: LLM router instance
        vendor_canon: Vendor canonicalizer
    
    Returns:
        Extracted fields with confidence scores
    """
    # Extract text from image
    # Note: The dataset provides PIL images, we need to save them temporarily
    
    # Handle different dataset structures
    if isinstance(sample, dict):
        image = sample.get('image')
        image_path = sample.get('image_path', '')
        # Debug: check what we got
        if image is None:
            print(f"    Debug: sample keys = {list(sample.keys())}")
            print(f"    Debug: 'image' in sample = {'image' in sample}")
    else:
        # If sample is not a dict, try to get image from it
        image = getattr(sample, 'image', None)
        image_path = getattr(sample, 'image_path', '')
    
    if image is None:
        return {
            'invoice_id': None,
            'invoice_date': None,
            'total_amount': None,
            'currency': None,
            'vendor_name': None,
            'confidence_scores': {},
            'llm_used': False,
            'error': 'No image found'
        }
    
    if isinstance(image, Image.Image):
        # Save to temp file
        tmp_file = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
        tmp_file.close()
        image.save(tmp_file.name, 'PNG')
        image_path = tmp_file.name
    elif not image_path or not os.path.exists(image_path):
        return {
            'invoice_id': None,
            'invoice_date': None,
            'total_amount': None,
            'currency': None,
            'vendor_name': None,
            'confidence_scores': {},
            'llm_used': False,
            'error': 'Invalid image path'
        }
    
    try:
        # Extract text (returns blocks, time)
        blocks, extraction_time = extract_text(image_path, use_cache=True)
        
        # Clean up temp file
        if isinstance(image, Image.Image) and os.path.exists(image_path):
            try:
                os.unlink(image_path)
            except:
                pass
    except Exception as e:
        # Clean up temp file on error
        if isinstance(image, Image.Image) and os.path.exists(image_path):
            try:
                os.unlink(image_path)
            except:
                pass
        return {
            'invoice_id': None,
            'invoice_date': None,
            'total_amount': None,
            'currency': None,
            'vendor_name': None,
            'confidence_scores': {},
            'llm_used': False,
            'error': f'Extraction failed: {str(e)}'
        }
    
    if not blocks:
        return {
            'invoice_id': None,
            'invoice_date': None,
            'total_amount': None,
            'currency': None,
            'vendor_name': None,
            'confidence_scores': {},
            'llm_used': False
        }
    
    # Extract fields using heuristics (with timing)
    from app.utils import timeit
    from app.heuristics import extract_tax_amount, extract_subtotal
    
    heuristics_start = time.time()
    invoice_id_result, _ = timeit("extract_invoice_id", extract_invoice_id, blocks)
    invoice_date_result, _ = timeit("extract_date", extract_date, blocks, "invoice")
    # Extract total amount AFTER invoice ID (to exclude invoice IDs from totals)
    total_amount_result, _ = timeit("extract_total_amount", extract_total_amount, blocks, invoice_id_result[0])
    currency_result, _ = timeit("extract_currency", extract_currency, blocks, total_amount_result[0])
    vendor_name_result, _ = timeit("extract_vendor_name", extract_vendor_name, blocks)
    # Extract tax and subtotal
    tax_amount_result, _ = timeit("extract_tax_amount", extract_tax_amount, blocks, total_amount_result[0])
    subtotal_result, _ = timeit("extract_subtotal", extract_subtotal, blocks, total_amount_result[0])
    heuristics_time = time.time() - heuristics_start
    
    # Compute confidence scores
    invoice_id_conf, _ = compute_field_confidence(
        'invoice_id', invoice_id_result[0], blocks, invoice_id_result, False
    )
    invoice_date_conf, _ = compute_field_confidence(
        'invoice_date', invoice_date_result[0], blocks, invoice_date_result, False
    )
    total_amount_conf, _ = compute_field_confidence(
        'total_amount', str(total_amount_result[0]) if total_amount_result[0] else None,
        blocks, total_amount_result, False
    )
    currency_conf, _ = compute_field_confidence(
        'currency', currency_result[0], blocks, currency_result, False
    )
    vendor_name_conf, _ = compute_field_confidence(
        'vendor_name', vendor_name_result[0], blocks, vendor_name_result, False
    )
    
    # LLM fallback for low confidence fields OR when field is missing
    llm_used = False
    llm_fields = {}
    needs_human_review = False
    
    # LLM fallback with improved trigger logic
    fields_needing_llm = []
    timings_dict = {'extraction': extraction_time, 'heuristics': heuristics_time}
    
    invoice_id_should, invoice_id_reason = should_use_llm(
        invoice_id_conf, 'invoice_id', True, timings_dict,
        field_missing=(invoice_id_result[0] is None)
    )
    if invoice_id_should:
        fields_needing_llm.append('invoice_id')
    
    invoice_date_should, invoice_date_reason = should_use_llm(
        invoice_date_conf, 'invoice_date', True, timings_dict,
        field_missing=(invoice_date_result[0] is None)
    )
    if invoice_date_should:
        fields_needing_llm.append('invoice_date')
    
    total_amount_should, total_amount_reason = should_use_llm(
        total_amount_conf, 'total_amount', True, timings_dict,
        field_missing=(total_amount_result[0] is None)
    )
    if total_amount_should:
        fields_needing_llm.append('total_amount')
    
    vendor_name_should, vendor_name_reason = should_use_llm(
        vendor_name_conf, 'vendor_name', True, timings_dict,
        field_missing=(vendor_name_result[0] is None)
    )
    if vendor_name_should:
        fields_needing_llm.append('vendor_name')
    
    # Batch all fields into single LLM call
    if fields_needing_llm:
        try:
            print(f"    → Calling LLM for {len(fields_needing_llm)} fields: {', '.join(fields_needing_llm)}")
            llm_result = llm_router.extract_fields(fields_needing_llm, blocks, image_path, timeout=8.0)
            if llm_result:
                llm_used = True
                llm_fields = llm_result
                
                # Update results with LLM values
                if 'invoice_id' in llm_result and llm_result['invoice_id']:
                    invoice_id_result = (llm_result['invoice_id'], 0.75, 'LLM extraction')
                    invoice_id_conf = min(0.85, invoice_id_conf + 0.2)  # Boost confidence
                if 'invoice_date' in llm_result and llm_result['invoice_date']:
                    invoice_date_result = (llm_result['invoice_date'], 0.75, 'LLM extraction')
                    invoice_date_conf = min(0.85, invoice_date_conf + 0.2)
                if 'total_amount' in llm_result and llm_result.get('total_amount'):
                    llm_total = llm_result['total_amount']
                    # CRITICAL: Reject if LLM total matches invoice ID
                    if invoice_id_result[0]:
                        inv_id_clean = re.sub(r'[^\d]', '', str(invoice_id_result[0]))
                        try:
                            total_int_str = str(int(float(llm_total))) if llm_total else ""
                            if total_int_str == inv_id_clean or (inv_id_clean and total_int_str in inv_id_clean):
                                # LLM picked invoice ID, keep heuristic result instead
                                print(f"      ⚠️  LLM total ({llm_total}) matches invoice ID ({invoice_id_result[0]}), using heuristic")
                            elif llm_total and float(llm_total) > 1000000:
                                # LLM picked suspiciously large amount, keep heuristic
                                print(f"      ⚠️  LLM total ({llm_total}) too large, using heuristic")
                            else:
                                total_amount_result = (llm_total, 0.75, 'LLM extraction')
                                total_amount_conf = min(0.85, total_amount_conf + 0.2)
                        except (ValueError, TypeError):
                            # Invalid LLM result, keep heuristic
                            pass
                    else:
                        total_amount_result = (llm_total, 0.75, 'LLM extraction')
                        total_amount_conf = min(0.85, total_amount_conf + 0.2)
                if 'vendor_name' in llm_result and llm_result.get('vendor_name'):
                    vendor_name_result = (llm_result['vendor_name'], 0.75, 'LLM extraction')
                    vendor_name_conf = min(0.85, vendor_name_conf + 0.2)
        except Exception as e:
            print(f"    ⚠️  LLM extraction failed: {e}")
    
    # Check if still low confidence after LLM - mark for human review
    final_confidences = {
        'invoice_id': invoice_id_conf,
        'invoice_date': invoice_date_conf,
        'total_amount': total_amount_conf,
        'vendor_name': vendor_name_conf
    }
    
    # If any required field still has low confidence (< 0.5) after LLM, mark for human review
    if any(conf < 0.5 for field, conf in final_confidences.items() if field in ['invoice_id', 'invoice_date', 'total_amount', 'vendor_name']):
        needs_human_review = True
    
    # Canonicalize
    from app.canonicalize import canonicalize_amount
    import hashlib
    
    invoice_date_canon = canonicalize_date(invoice_date_result[0]) if invoice_date_result[0] else None
    currency_canon = canonicalize_currency(currency_result[0]) if currency_result[0] else None
    total_amount_canon = canonicalize_amount(str(total_amount_result[0])) if total_amount_result[0] else None
    amount_tax_canon = canonicalize_amount(str(tax_amount_result[0])) if tax_amount_result[0] else None
    amount_subtotal_canon = canonicalize_amount(str(subtotal_result[0])) if subtotal_result[0] else None
    
    vendor_id, vendor_name_canon, vendor_conf, vendor_reason = vendor_canon.canonicalize(
        vendor_name_result[0] if vendor_name_result[0] else ''
    )
    
    # Compute dedupe hash
    dedupe_hash = None
    if vendor_id and invoice_id_result[0] and total_amount_canon and invoice_date_canon:
        hash_str = f"{vendor_id}|{invoice_id_result[0]}|{total_amount_canon}|{invoice_date_canon}"
        dedupe_hash = hashlib.sha256(hash_str.encode('utf-8')).hexdigest()
    
    # Arithmetic validation
    arithmetic_mismatch = False
    if amount_subtotal_canon is not None and amount_tax_canon is not None and total_amount_canon is not None:
        expected_total = amount_subtotal_canon + amount_tax_canon
        if abs(expected_total - total_amount_canon) > 0.01:
            arithmetic_mismatch = True
    
    return {
        'invoice_id': invoice_id_result[0],
        'invoice_date': invoice_date_canon,
        'total_amount': total_amount_canon,
        'amount_subtotal': amount_subtotal_canon,
        'amount_tax': amount_tax_canon,
        'currency': currency_canon,
        'vendor_name': vendor_name_canon or vendor_name_result[0],
        'vendor_id': vendor_id,
        'dedupe_hash': dedupe_hash,
        'is_duplicate': False,  # Would need to check against stored hashes
        'arithmetic_mismatch': arithmetic_mismatch,
        'confidence_scores': {
            'invoice_id': invoice_id_conf,
            'invoice_date': invoice_date_conf,
            'total_amount': total_amount_conf,
            'currency': currency_conf,
            'vendor_name': vendor_name_conf,
        },
        'llm_used': llm_used,
        'llm_fields': list(llm_fields.keys()),
        'needs_human_review': needs_human_review
    }


def compare_with_ground_truth(extracted: Dict, ground_truth: Any) -> Dict:
    """Compare extracted fields with ground truth.
    
    Args:
        extracted: Extracted fields
        ground_truth: Ground truth from dataset (can be dict, string, or parsed_data)
    
    Returns:
        Comparison results with accuracy metrics
    """
    gt = {}
    
    # Parse ground truth - handle different formats
    import ast
    
    if isinstance(ground_truth, str):
        try:
            # First, parse the outer JSON
            parsed = json.loads(ground_truth)
            # If it's the parsed_data format, extract the json field
            if isinstance(parsed, dict) and 'json' in parsed:
                json_str = parsed['json']
                # The json field contains a Python dict string with single quotes
                # Use ast.literal_eval to parse it safely
                gt = ast.literal_eval(json_str)
            else:
                gt = parsed
        except Exception as e1:
            try:
                # If outer JSON parsing failed, try direct ast.literal_eval
                gt = ast.literal_eval(ground_truth)
            except Exception as e2:
                gt = {}
    elif isinstance(ground_truth, dict):
        gt = ground_truth
        # If it has parsed_data, extract from there
        if 'parsed_data' in gt:
            try:
                parsed_data = json.loads(gt['parsed_data'])
                if 'json' in parsed_data:
                    json_str = parsed_data['json'].replace("'", '"')
                    gt = json.loads(json_str)
            except:
                pass
    
    # Extract expected values from dataset format
    # Dataset format: header.invoice_no, header.invoice_date, header.seller, summary.total_gross_worth
    header = gt.get('header', {})
    summary = gt.get('summary', {})
    
    expected = {
        'invoice_id': header.get('invoice_no', '') or gt.get('invoice_number', '') or gt.get('invoice_id', ''),
        'invoice_date': header.get('invoice_date', '') or gt.get('date', '') or gt.get('invoice_date', ''),
        'total_amount': summary.get('total_gross_worth', '') or summary.get('total_net_worth', '') or gt.get('total', '') or gt.get('total_amount', ''),
        'currency': gt.get('currency', '') or header.get('currency', ''),
        'vendor_name': header.get('seller', '') or gt.get('seller', {}).get('name', '') if isinstance(gt.get('seller'), dict) else gt.get('seller', '') or gt.get('vendor_name', '') or gt.get('company', ''),
    }
    
    # Compare
    matches = {}
    for field in ['invoice_id', 'invoice_date', 'total_amount', 'currency', 'vendor_name']:
        exp = str(expected.get(field, '')).strip()
        got_val = extracted.get(field)
        got = str(got_val).strip() if got_val is not None else ''
        
        # If expected is empty and extracted is null/empty, don't count as match
        if not exp and not got:
            matches[field] = False  # Don't count empty matches
            continue
        
        # If expected has value but extracted is null/empty, it's a mismatch
        if exp and not got:
            matches[field] = False
            continue
        
        # Normalize for comparison
        exp_norm = exp.lower().replace(' ', '').replace('-', '').replace('_', '')
        got_norm = got.lower().replace(' ', '').replace('-', '').replace('_', '')
        
        # Special handling for dates - normalize formats
        if field == 'invoice_date':
            # Both formats are valid, just normalize for comparison
            try:
                from dateutil import parser as date_parser
                exp_parsed = date_parser.parse(exp, fuzzy=True)
                got_parsed = date_parser.parse(got, fuzzy=True)
                matches[field] = exp_parsed.date() == got_parsed.date()
                continue
            except:
                # Fallback to string comparison
                pass
        
        # Special handling for amounts
        if field == 'total_amount':
            try:
                # Handle European format (comma as decimal)
                exp_clean = exp_norm.replace('$', '').replace('€', '').replace('£', '').replace(' ', '').strip()
                got_clean = got_norm.replace('$', '').replace('€', '').replace('£', '').replace(' ', '').strip()
                
                # Check if comma is decimal separator
                if ',' in exp_clean and '.' in exp_clean:
                    if exp_clean.rfind(',') > exp_clean.rfind('.'):
                        exp_clean = exp_clean.replace('.', '').replace(',', '.')
                    else:
                        exp_clean = exp_clean.replace(',', '')
                elif ',' in exp_clean:
                    parts = exp_clean.split(',')
                    if len(parts) == 2 and len(parts[1]) <= 2:
                        exp_clean = exp_clean.replace(',', '.')
                    else:
                        exp_clean = exp_clean.replace(',', '')
                else:
                    exp_clean = exp_clean.replace(',', '')
                
                if ',' in got_clean and '.' in got_clean:
                    if got_clean.rfind(',') > got_clean.rfind('.'):
                        got_clean = got_clean.replace('.', '').replace(',', '.')
                    else:
                        got_clean = got_clean.replace(',', '')
                elif ',' in got_clean:
                    parts = got_clean.split(',')
                    if len(parts) == 2 and len(parts[1]) <= 2:
                        got_clean = got_clean.replace(',', '.')
                    else:
                        got_clean = got_clean.replace(',', '')
                else:
                    got_clean = got_clean.replace(',', '')
                
                exp_num = float(exp_clean)
                got_num = float(got_clean)
                # Allow 1% tolerance for rounding differences
                matches[field] = abs(exp_num - got_num) < max(0.01, exp_num * 0.01)
            except Exception as e:
                # Fallback to string comparison
                matches[field] = exp_norm == got_norm or (exp_norm in got_norm) or (got_norm in exp_norm)
        else:
            matches[field] = exp_norm == got_norm or (exp_norm in got_norm) or (got_norm in exp_norm)
    
    return {
        'matches': matches,
        'expected': expected,
        'extracted': {k: extracted.get(k) for k in ['invoice_id', 'invoice_date', 'total_amount', 'currency', 'vendor_name']},
        'accuracy': sum(matches.values()) / len(matches) if matches else 0.0
    }


def validate_dataset(max_samples: int = 50):
    """Validate InvoiceAce against Hugging Face dataset.
    
    Args:
        max_samples: Maximum number of samples to process
    """
    print("Loading Hugging Face dataset...")
    try:
        dataset = load_dataset("mychen76/invoices-and-receipts_ocr_v1", split="train")
        print(f"✓ Loaded dataset with {len(dataset)} samples")
        
        # Inspect first sample to understand structure
        if len(dataset) > 0:
            print("\nInspecting first sample structure...")
            first_sample = dataset[0]
            print(f"Sample type: {type(first_sample)}")
            if isinstance(first_sample, dict):
                print(f"Sample keys: {list(first_sample.keys())}")
                for key in list(first_sample.keys())[:5]:
                    val = first_sample[key]
                    print(f"  {key}: {type(val)} - {str(val)[:100] if not isinstance(val, Image.Image) else 'PIL.Image'}")
    except Exception as e:
        print(f"✗ Failed to load dataset: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Initialize components
    llm_router = LLMRouter()
    vendor_canon = VendorCanonicalizer()
    
    results = []
    total_accuracy = 0.0
    llm_usage_count = 0
    
    print(f"\nProcessing {min(max_samples, len(dataset))} samples...")
    
    processed_count = 0
    num_samples = min(max_samples, len(dataset))
    for i in range(num_samples):
        print(f"\n[{i+1}/{num_samples}] Processing sample {i}...")
        
        try:
            # Get sample by index (slicing returns strings, not dicts)
            sample = dataset[i]
            
            # Process invoice
            start_time = time.time()
            extracted = process_invoice_from_dataset(sample, llm_router, vendor_canon)
            processing_time = time.time() - start_time
            
            # Check if extraction actually happened
            if 'error' in extracted:
                print(f"  ⚠️  Error: {extracted['error']}")
                results.append({
                    'sample_id': i,
                    'error': extracted['error'],
                    'accuracy': 0.0,
                    'processing_time': processing_time
                })
                continue
            
            processed_count += 1
            
            # Compare with ground truth
            if isinstance(sample, dict):
                ground_truth = sample.get('parsed_data') or sample.get('ground_truth', {}) or sample.get('gt', {}) or sample.get('label', {})
            else:
                ground_truth = getattr(sample, 'parsed_data', None) or getattr(sample, 'ground_truth', None) or getattr(sample, 'gt', None) or getattr(sample, 'label', {})
            
            if ground_truth is None:
                ground_truth = {}
            
            comparison = compare_with_ground_truth(extracted, ground_truth)
            
            accuracy = comparison['accuracy']
            total_accuracy += accuracy
            
            if extracted['llm_used']:
                llm_usage_count += 1
            
            results.append({
                'sample_id': i,
                'extracted': extracted,
                'comparison': comparison,
                'accuracy': accuracy,
                'processing_time': processing_time
            })
            
            print(f"  Accuracy: {accuracy:.2%}")
            print(f"  Time: {processing_time:.2f}s")
            print(f"  LLM Used: {extracted['llm_used']}")
            print(f"  Matches: {sum(comparison['matches'].values())}/{len(comparison['matches'])}")
            
        except Exception as e:
            print(f"  ✗ Error processing sample {i}: {e}")
            import traceback
            traceback.print_exc()
            results.append({
                'sample_id': i,
                'error': str(e),
                'accuracy': 0.0,
                'processing_time': 0.0
            })
            continue
    
    # Summary
    successful_results = [r for r in results if 'error' not in r]
    avg_accuracy = total_accuracy / len(successful_results) if successful_results else 0.0
    llm_usage_rate = llm_usage_count / len(successful_results) if successful_results else 0.0
    
    print("\n" + "="*60)
    print("VALIDATION SUMMARY")
    print("="*60)
    print(f"Total Samples Processed: {len(results)}")
    print(f"Successful Extractions: {len(successful_results)}")
    print(f"Failed Extractions: {len(results) - len(successful_results)}")
    print(f"Average Accuracy: {avg_accuracy:.2%}")
    print(f"LLM Usage Rate: {llm_usage_rate:.2%}")
    print(f"Samples with LLM: {llm_usage_count}/{len(successful_results)}")
    
    # Field-level accuracy
    field_matches = {'invoice_id': 0, 'invoice_date': 0, 'total_amount': 0, 'currency': 0, 'vendor_name': 0}
    field_total = {'invoice_id': 0, 'invoice_date': 0, 'total_amount': 0, 'currency': 0, 'vendor_name': 0}
    
    for r in results:
        if 'comparison' in r:
            for field, match in r['comparison']['matches'].items():
                field_total[field] += 1
                if match:
                    field_matches[field] += 1
    
    print("\nField-level Accuracy:")
    for field, matches in field_matches.items():
        total = field_total[field]
        if total > 0:
            acc = matches / total
            print(f"  {field:20s}: {acc:.2%} ({matches}/{total})")
    
    # Save results
    output_path = Path("validation_results.json")
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {output_path}")
    
    return results


if __name__ == "__main__":
    import sys
    max_samples = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    validate_dataset(max_samples=max_samples)

