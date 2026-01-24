#!/usr/bin/env python3
"""Gold dataset evaluation harness - computes per-field precision/recall."""
import json
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
from collections import defaultdict

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.extract_text import extract_text
from app.ocr_engine import OCREngine
from app.heuristics import (
    extract_invoice_id, extract_date, extract_total_amount,
    extract_currency, extract_vendor_name, extract_tax_amount, extract_subtotal
)
from app.confidence import compute_field_confidence, should_use_llm
from app.llm_router import LLMRouter
from app.canonicalize import (
    canonicalize_date, canonicalize_currency, canonicalize_amount,
    VendorCanonicalizer
)
from app.utils import timeit
from app.main import process_invoice  # Import the processing function


def load_gold_truth(gold_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Load gold truth from JSON files in gold directory.
    
    Expected format: {filename}.json with fields:
    {
        "invoice_id": "...",
        "invoice_date": "YYYY-MM-DD",
        "total_amount": 123.45,
        "currency": "USD",
        "vendor_name": "...",
        "amount_subtotal": 100.0,
        "amount_tax": 23.45,
        "line_items": [...]
    }
    """
    gold_truth = {}
    
    for json_file in gold_dir.glob("*.json"):
        filename = json_file.stem
        try:
            with open(json_file, 'r') as f:
                gold_truth[filename] = json.load(f)
        except Exception as e:
            print(f"  ⚠️  Failed to load {json_file}: {e}")
    
    return gold_truth


def compare_field(extracted: Any, expected: Any, field_name: str) -> bool:
    """Compare extracted vs expected field value.
    
    Returns:
        True if match, False otherwise
    """
    if extracted is None and expected is None:
        return True
    if extracted is None or expected is None:
        return False
    
    # Normalize types
    if field_name in ['total_amount', 'amount_subtotal', 'amount_tax']:
        try:
            extracted_float = float(extracted) if extracted else None
            expected_float = float(expected) if expected else None
            if extracted_float is None or expected_float is None:
                return False
            # Allow small tolerance for floating point
            return abs(extracted_float - expected_float) < 0.01
        except (ValueError, TypeError):
            return False
    
    if field_name == 'invoice_date':
        # Normalize dates
        extracted_str = str(extracted).strip()
        expected_str = str(expected).strip()
        # Try to match various date formats
        return extracted_str == expected_str or extracted_str[:10] == expected_str[:10]
    
    # String comparison (case-insensitive, whitespace-normalized)
    extracted_str = str(extracted).strip().lower()
    expected_str = str(expected).strip().lower()
    return extracted_str == expected_str


def evaluate_invoice(pdf_path: Path, gold_truth: Dict[str, Any], 
                    ocr_engine: OCREngine, llm_router: LLMRouter,
                    vendor_canon: VendorCanonicalizer) -> Dict[str, Any]:
    """Evaluate a single invoice against gold truth.
    
    Returns:
        Evaluation result dict
    """
    result = {
        "filename": pdf_path.name,
        "fields": {},
        "matches": {},
        "sources": {},  # Track source per field (heuristic/llm/pdfplumber/easyocr/docai)
        "timings": {},
        "llm_used": False,
        "llm_fields": []
    }
    
    try:
        # Extract text/OCR
        blocks, ocr_time = extract_text(pdf_path, ocr_engine)
        result["timings"]["ocr"] = ocr_time
        
        # Track OCR source
        if blocks:
            engines_used = set(b.engine for b in blocks)
            result["sources"]["ocr"] = list(engines_used)
        
        # Heuristic extraction
        heuristics_start = time.time()
        invoice_id_result = extract_invoice_id(blocks)
        invoice_date_result = extract_date(blocks, "invoice")
        due_date_result = extract_date(blocks, "due")
        total_amount_result = extract_total_amount(blocks, invoice_id=invoice_id_result[0])
        currency_result = extract_currency(blocks, total_amount_result[0])
        vendor_name_result = extract_vendor_name(blocks)
        tax_amount_result = extract_tax_amount(blocks, total_amount_result[0])
        subtotal_result = extract_subtotal(blocks, total_amount_result[0])
        heuristics_time = time.time() - heuristics_start
        result["timings"]["heuristics"] = heuristics_time
        
        # Track heuristic sources
        for field_name, field_result in [
            ("invoice_id", invoice_id_result),
            ("invoice_date", invoice_date_result),
            ("total_amount", total_amount_result),
            ("currency", currency_result),
            ("vendor_name", vendor_name_result),
            ("amount_tax", tax_amount_result),
            ("amount_subtotal", subtotal_result)
        ]:
            if field_result[0] is not None:
                result["sources"][field_name] = "heuristic"
        
        # Canonicalize
        invoice_id = invoice_id_result[0]
        invoice_date = canonicalize_date(invoice_date_result[0]) if invoice_date_result[0] else None
        total_amount = canonicalize_amount(total_amount_result[0]) if total_amount_result[0] else None
        currency = canonicalize_currency(currency_result[0]) if currency_result[0] else None
        vendor_name = vendor_name_result[0]
        vendor_id = vendor_canon.get_canonical_id(vendor_name) if vendor_name else None
        amount_tax = canonicalize_amount(tax_amount_result[0]) if tax_amount_result[0] else None
        amount_subtotal = canonicalize_amount(subtotal_result[0]) if subtotal_result[0] else None
        
        # Store extracted values
        result["fields"] = {
            "invoice_id": invoice_id,
            "invoice_date": invoice_date,
            "total_amount": total_amount,
            "currency": currency,
            "vendor_name": vendor_name,
            "amount_tax": amount_tax,
            "amount_subtotal": amount_subtotal
        }
        
        # Compute confidence
        field_confidences = {}
        for field_name, field_result in [
            ("invoice_id", invoice_id_result),
            ("invoice_date", invoice_date_result),
            ("total_amount", total_amount_result),
            ("currency", currency_result),
            ("vendor_name", vendor_name_result)
        ]:
            conf, _ = compute_field_confidence(field_name, field_result[0], blocks, field_result)
            field_confidences[field_name] = conf
        
        # LLM fallback for low-confidence fields
        llm_start = time.time()
        fields_to_extract = []
        for field_name, conf in field_confidences.items():
            should, reason = should_use_llm(conf, field_name, True, result["timings"], 
                                          field_missing=(result["fields"].get(field_name) is None))
            if should:
                fields_to_extract.append(field_name)
        
        if fields_to_extract:
            llm_result = llm_router.extract_fields(fields_to_extract, blocks, pdf_path, timeout=8.0)
            if llm_result:
                result["llm_used"] = True
                result["llm_fields"] = fields_to_extract
                # Update fields from LLM
                for field_name in fields_to_extract:
                    if field_name in llm_result and llm_result[field_name]:
                        result["fields"][field_name] = llm_result[field_name]
                        result["sources"][field_name] = "llm"
        
        llm_time = time.time() - llm_start
        result["timings"]["llm"] = llm_time
        result["timings"]["total"] = ocr_time + heuristics_time + llm_time
        
        # Compare with gold truth
        for field_name in ["invoice_id", "invoice_date", "total_amount", "currency", "vendor_name",
                          "amount_tax", "amount_subtotal"]:
            extracted = result["fields"].get(field_name)
            expected = gold_truth.get(field_name)
            match = compare_field(extracted, expected, field_name)
            result["matches"][field_name] = match
        
        # Compute accuracy
        matches = sum(1 for m in result["matches"].values() if m)
        total_fields = len(result["matches"])
        result["accuracy"] = matches / total_fields if total_fields > 0 else 0.0
        
    except Exception as e:
        result["error"] = str(e)
        result["accuracy"] = 0.0
    
    return result


def main():
    """Run evaluation on gold dataset."""
    import time
    
    gold_dir = Path(__file__).parent / "data" / "gold"
    if not gold_dir.exists():
        print(f"❌ Gold directory not found: {gold_dir}")
        return
    
    # Load gold truth
    print("📊 Loading gold truth...")
    gold_truth = load_gold_truth(gold_dir)
    print(f"  ✓ Loaded {len(gold_truth)} gold truth files")
    
    if not gold_truth:
        print("  ⚠️  No gold truth files found. Expected format: {filename}.json")
        return
    
    # Initialize components
    print("\n🔧 Initializing components...")
    ocr_engine = OCREngine()
    llm_router = LLMRouter()
    vendor_canon = VendorCanonicalizer()
    
    # Find PDFs
    pdf_files = list(gold_dir.glob("*.pdf"))
    if not pdf_files:
        print(f"  ⚠️  No PDF files found in {gold_dir}")
        return
    
    print(f"  ✓ Found {len(pdf_files)} PDF files")
    
    # Evaluate each invoice
    print("\n📋 Evaluating invoices...")
    results = []
    field_stats = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
    source_stats = defaultdict(int)
    
    for i, pdf_path in enumerate(pdf_files, 1):
        filename = pdf_path.stem
        if filename not in gold_truth:
            print(f"  ⚠️  Skipping {pdf_path.name} (no gold truth)")
            continue
        
        print(f"  [{i}/{len(pdf_files)}] Processing {pdf_path.name}...", end="", flush=True)
        result = evaluate_invoice(pdf_path, gold_truth[filename], ocr_engine, 
                                 llm_router, vendor_canon)
        results.append(result)
        
        # Update field stats
        for field_name, match in result["matches"].items():
            extracted = result["fields"].get(field_name)
            expected = gold_truth[filename].get(field_name)
            
            if match:
                field_stats[field_name]["tp"] += 1
            else:
                if extracted is not None:
                    field_stats[field_name]["fp"] += 1
                if expected is not None:
                    field_stats[field_name]["fn"] += 1
        
        # Update source stats
        for field_name, source in result["sources"].items():
            if field_name != "ocr":
                source_stats[source] += 1
        
        accuracy_pct = result["accuracy"] * 100
        status = "✓" if result["accuracy"] >= 0.8 else "⚠" if result["accuracy"] >= 0.5 else "✗"
        print(f" {status} {accuracy_pct:.1f}%")
    
    # Compute aggregate metrics
    print("\n📊 Computing aggregate metrics...")
    
    # Per-field precision/recall
    field_metrics = {}
    for field_name, stats in field_stats.items():
        tp = stats["tp"]
        fp = stats["fp"]
        fn = stats["fn"]
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        
        field_metrics[field_name] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn
        }
    
    # Overall accuracy
    overall_accuracy = sum(r["accuracy"] for r in results) / len(results) if results else 0.0
    
    # Source coverage
    total_fields = sum(len(r["matches"]) for r in results)
    heuristic_coverage = source_stats.get("heuristic", 0) / total_fields if total_fields > 0 else 0.0
    llm_coverage = source_stats.get("llm", 0) / total_fields if total_fields > 0 else 0.0
    
    # Performance metrics
    avg_ocr_time = sum(r["timings"].get("ocr", 0) for r in results) / len(results) if results else 0.0
    avg_heuristics_time = sum(r["timings"].get("heuristics", 0) for r in results) / len(results) if results else 0.0
    avg_llm_time = sum(r["timings"].get("llm", 0) for r in results) / len(results) if results else 0.0
    avg_total_time = sum(r["timings"].get("total", 0) for r in results) / len(results) if results else 0.0
    
    # LLM usage
    llm_used_count = sum(1 for r in results if r["llm_used"])
    llm_usage_rate = llm_used_count / len(results) if results else 0.0
    
    # Build report
    report = {
        "summary": {
            "total_invoices": len(results),
            "overall_accuracy": overall_accuracy,
            "heuristic_coverage": heuristic_coverage,
            "llm_coverage": llm_coverage,
            "llm_usage_rate": llm_usage_rate,
            "avg_processing_time": avg_total_time,
            "avg_ocr_time": avg_ocr_time,
            "avg_heuristics_time": avg_heuristics_time,
            "avg_llm_time": avg_llm_time,
            "slo_90th_percentile": sorted([r["timings"].get("total", 0) for r in results])[int(len(results) * 0.9)] if results else 0.0
        },
        "field_metrics": field_metrics,
        "source_stats": dict(source_stats),
        "results": results
    }
    
    # Save report
    report_path = Path(__file__).parent / "data" / "outputs" / "evaluation_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    
    # Print summary
    print("\n" + "=" * 70)
    print("📊 EVALUATION REPORT")
    print("=" * 70)
    print(f"\nOverall Accuracy: {overall_accuracy * 100:.2f}%")
    print(f"Heuristic Coverage: {heuristic_coverage * 100:.2f}%")
    print(f"LLM Coverage: {llm_coverage * 100:.2f}%")
    print(f"LLM Usage Rate: {llm_usage_rate * 100:.2f}%")
    print(f"\nAverage Processing Time: {avg_total_time:.2f}s")
    print(f"   OCR: {avg_ocr_time:.2f}s")
    print(f"   Heuristics: {avg_heuristics_time:.2f}s")
    print(f"   LLM: {avg_llm_time:.2f}s")
    print(f"\n90th Percentile (SLO): {report['summary']['slo_90th_percentile']:.2f}s")
    
    print("\nPer-Field Metrics:")
    for field_name, metrics in field_metrics.items():
        print(f"  {field_name:20s}: P={metrics['precision']:.3f}, R={metrics['recall']:.3f}, F1={metrics['f1']:.3f}")
    
    print(f"\n✅ Report saved to: {report_path}")
    print("=" * 70)


if __name__ == "__main__":
    import time
    main()

