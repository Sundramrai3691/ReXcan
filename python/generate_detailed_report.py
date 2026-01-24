"""Generate detailed analysis report from validation results."""
import json
from pathlib import Path
from typing import Dict, List, Any

def generate_report(results_file: str = "validation_results.json"):
    """Generate comprehensive analysis report."""
    with open(results_file, 'r') as f:
        results = json.load(f)
    
    if not results:
        print("No results found!")
        return
    
    num_samples = len(results)
    
    # Field-level analysis
    field_stats = {
        'invoice_id': {'correct': 0, 'total': 0, 'missing': 0, 'incorrect': 0},
        'invoice_date': {'correct': 0, 'total': 0, 'missing': 0, 'incorrect': 0},
        'total_amount': {'correct': 0, 'total': 0, 'missing': 0, 'incorrect': 0},
        'currency': {'correct': 0, 'total': 0, 'missing': 0, 'incorrect': 0},
        'vendor_name': {'correct': 0, 'total': 0, 'missing': 0, 'incorrect': 0},
    }
    
    # Method tracking
    method_usage = {'heuristic': 0, 'llm': 0}
    
    # Per-sample details
    sample_details = []
    
    for result in results:
        sample_id = result.get('sample_id', 'unknown')
        extracted = result.get('extracted', {})
        comparison = result.get('comparison', {})
        matches = comparison.get('matches', {})
        expected = comparison.get('expected', {})
        extracted_vals = comparison.get('extracted', {})
        
        # Track field accuracy
        for field in field_stats.keys():
            field_stats[field]['total'] += 1
            if matches.get(field, False):
                field_stats[field]['correct'] += 1
            elif extracted_vals.get(field) is None and expected.get(field):
                field_stats[field]['missing'] += 1
            else:
                field_stats[field]['incorrect'] += 1
        
        # Track methods
        llm_used = result.get('llm_used', False)
        if llm_used:
            method_usage['llm'] += 1
        else:
            method_usage['heuristic'] += 1
        
        # Store sample details
        sample_details.append({
            'sample_id': sample_id,
            'accuracy': result.get('accuracy', 0),
            'matches': matches,
            'expected': expected,
            'extracted': extracted_vals,
            'llm_used': llm_used,
            'processing_time': result.get('processing_time', 0)
        })
    
    # Generate report
    print("=" * 100)
    print("COMPREHENSIVE INVOICE EXTRACTION ANALYSIS REPORT")
    print("=" * 100)
    print(f"\nTotal Samples Analyzed: {num_samples}")
    
    # Overall metrics
    overall_accuracy = sum(r.get('accuracy', 0) for r in results) / num_samples if results else 0
    print(f"Overall Accuracy: {overall_accuracy*100:.2f}%")
    print(f"Average Processing Time: {sum(r.get('processing_time', 0) for r in results) / num_samples:.2f}s")
    
    # Field-level metrics
    print("\n" + "=" * 100)
    print("FIELD-LEVEL ACCURACY BREAKDOWN")
    print("=" * 100)
    print(f"\n{'Field':<20} {'Accuracy':<12} {'Correct':<10} {'Missing':<10} {'Incorrect':<10} {'Total':<10}")
    print("-" * 100)
    
    for field, stats in field_stats.items():
        accuracy = (stats['correct'] / stats['total'] * 100) if stats['total'] > 0 else 0
        print(f"{field:<20} {accuracy:>10.2f}%  {stats['correct']:>8}/{stats['total']:<2}  "
              f"{stats['missing']:>8}  {stats['incorrect']:>8}  {stats['total']:>8}")
    
    # Method usage
    print("\n" + "=" * 100)
    print("EXTRACTION METHOD USAGE")
    print("=" * 100)
    total_method_calls = method_usage['heuristic'] + method_usage['llm']
    if total_method_calls > 0:
        print(f"Heuristic-only: {method_usage['heuristic']} ({method_usage['heuristic']/num_samples*100:.1f}%)")
        print(f"LLM-assisted: {method_usage['llm']} ({method_usage['llm']/num_samples*100:.1f}%)")
    
    # Per-sample analysis
    print("\n" + "=" * 100)
    print("DETAILED PER-SAMPLE ANALYSIS")
    print("=" * 100)
    
    for i, detail in enumerate(sample_details, 1):
        print(f"\n--- Sample {i}: ID={detail['sample_id']} ---")
        print(f"Overall Accuracy: {detail['accuracy']*100:.1f}%")
        print(f"Processing Time: {detail['processing_time']:.2f}s")
        print(f"LLM Used: {'Yes' if detail['llm_used'] else 'No'}")
        
        print("\nField-by-Field Breakdown:")
        for field in field_stats.keys():
            match = detail['matches'].get(field, False)
            expected = detail['expected'].get(field, '(empty)')
            extracted = detail['extracted'].get(field, '(null)')
            status = "✓ MATCH" if match else "✗ MISMATCH"
            
            print(f"  {field:15s} {status}")
            print(f"    Expected: {str(expected)[:60]}")
            print(f"    Extracted: {str(extracted)[:60]}")
    
    # Missing/Incorrect analysis
    print("\n" + "=" * 100)
    print("MISSING & INCORRECT FIELDS ANALYSIS")
    print("=" * 100)
    
    print("\nMissing Fields (Expected but not extracted):")
    for field, stats in field_stats.items():
        if stats['missing'] > 0:
            pct = stats['missing'] / stats['total'] * 100
            print(f"  {field:20s}: {stats['missing']:>3}/{stats['total']:<3} ({pct:>5.1f}%)")
    
    print("\nIncorrect Fields (Extracted but wrong):")
    for field, stats in field_stats.items():
        if stats['incorrect'] > 0:
            pct = stats['incorrect'] / stats['total'] * 100
            print(f"  {field:20s}: {stats['incorrect']:>3}/{stats['total']:<3} ({pct:>5.1f}%)")
    
    # Summary
    print("\n" + "=" * 100)
    print("SUMMARY & RECOMMENDATIONS")
    print("=" * 100)
    
    print("\nStrengths:")
    for field, stats in field_stats.items():
        accuracy = stats['correct'] / stats['total'] * 100 if stats['total'] > 0 else 0
        if accuracy >= 80:
            print(f"  ✓ {field}: {accuracy:.1f}% accuracy")
    
    print("\nAreas Needing Improvement:")
    for field, stats in field_stats.items():
        accuracy = stats['correct'] / stats['total'] * 100 if stats['total'] > 0 else 0
        if accuracy < 80:
            print(f"  ✗ {field}: {accuracy:.1f}% accuracy")
            if stats['missing'] > stats['incorrect']:
                print(f"    → Primary issue: Missing extraction ({stats['missing']} cases)")
            else:
                print(f"    → Primary issue: Incorrect extraction ({stats['incorrect']} cases)")
    
    print("\n" + "=" * 100)
    
    # Save detailed JSON
    report_data = {
        'summary': {
            'total_samples': num_samples,
            'overall_accuracy': overall_accuracy,
            'field_stats': field_stats,
            'method_usage': method_usage
        },
        'samples': sample_details
    }
    
    with open('detailed_analysis_report.json', 'w') as f:
        json.dump(report_data, f, indent=2)
    
    print("✓ Detailed report saved to detailed_analysis_report.json")
    print("=" * 100)

if __name__ == "__main__":
    generate_report()

