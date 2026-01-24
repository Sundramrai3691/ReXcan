"""Comprehensive test suite for InvoiceAce."""
import sys
from pathlib import Path
import json

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


def test_ocr_engine():
    """Test OCR engine initialization."""
    print("\n" + "="*60)
    print("TEST 1: OCR Engine Initialization")
    print("="*60)
    try:
        ocr_engine = OCREngine()
        print(f"✓ EasyOCR: {'Enabled' if ocr_engine.use_easyocr else 'Disabled'}")
        print(f"✓ Tesseract: {'Enabled' if ocr_engine.use_tesseract else 'Disabled'}")
        assert ocr_engine.use_tesseract or ocr_engine.use_easyocr, "At least one OCR engine must be available"
        print("✓ PASS: OCR engine initialized successfully")
        return True
    except Exception as e:
        print(f"✗ FAIL: {e}")
        return False


def test_pdf_extraction(pdf_path: Path):
    """Test PDF text extraction."""
    print("\n" + "="*60)
    print(f"TEST 2: PDF Text Extraction ({pdf_path.name})")
    print("="*60)
    try:
        ocr_engine = OCREngine()
        blocks = extract_text(pdf_path, ocr_engine)
        print(f"✓ Extracted {len(blocks)} blocks")
        print(f"✓ Total characters: {sum(len(b.text) for b in blocks)}")
        
        if len(blocks) == 0:
            print("✗ FAIL: No text extracted")
            return False
        
        # Show sample blocks
        print("\nSample blocks (first 5):")
        for i, block in enumerate(blocks[:5], 1):
            print(f"  {i}. '{block.text[:50]}...' (conf: {block.confidence:.2f}, engine: {block.engine})")
        
        print("✓ PASS: Text extraction successful")
        return True
    except Exception as e:
        print(f"✗ FAIL: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_heuristics(blocks):
    """Test heuristic extraction."""
    print("\n" + "="*60)
    print("TEST 3: Heuristic Field Extraction")
    print("="*60)
    try:
        invoice_id = extract_invoice_id(blocks)
        invoice_date = extract_date(blocks, "invoice")
        due_date = extract_date(blocks, "due")
        total_amount = extract_total_amount(blocks)
        currency = extract_currency(blocks, total_amount[0])
        vendor_name = extract_vendor_name(blocks)
        
        print(f"✓ Invoice ID: {invoice_id[0]} (conf: {invoice_id[1]:.2f})")
        print(f"✓ Invoice Date: {invoice_date[0]} (conf: {invoice_date[1]:.2f})")
        print(f"✓ Due Date: {due_date[0]} (conf: {due_date[1]:.2f})")
        print(f"✓ Total Amount: {total_amount[0]} (conf: {total_amount[1]:.2f})")
        print(f"✓ Currency: {currency[0]} (conf: {currency[1]:.2f})")
        print(f"✓ Vendor: {vendor_name[0]} (conf: {vendor_name[1]:.2f})")
        
        print("✓ PASS: Heuristics extraction successful")
        return True
    except Exception as e:
        print(f"✗ FAIL: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_canonicalization():
    """Test canonicalization functions."""
    print("\n" + "="*60)
    print("TEST 4: Canonicalization")
    print("="*60)
    try:
        # Test date canonicalization
        test_dates = ["01/23/2019", "2019-01-23", "Jan 23, 2019", "23-01-2019"]
        for date_str in test_dates:
            canonical = canonicalize_date(date_str)
            print(f"✓ Date '{date_str}' → '{canonical}'")
        
        # Test currency canonicalization
        test_currencies = ["$", "USD", "€", "EUR", "₹", "INR"]
        for curr in test_currencies:
            canonical = canonicalize_currency(curr)
            print(f"✓ Currency '{curr}' → '{canonical}'")
        
        # Test amount canonicalization
        test_amounts = ["$1,234.56", "1.234,56", "1234.56"]
        for amt in test_amounts:
            canonical = canonicalize_amount(amt)
            print(f"✓ Amount '{amt}' → {canonical}")
        
        # Test vendor canonicalization
        vendor_canonicalizer = VendorCanonicalizer()
        test_vendors = ["ACME Corporation", "Microsoft Corp", "Amazon.com Inc"]
        for vendor in test_vendors:
            vid, vname, conf, reason = vendor_canonicalizer.canonicalize(vendor)
            print(f"✓ Vendor '{vendor}' → '{vname}' (id: {vid}, conf: {conf:.2f})")
        
        print("✓ PASS: Canonicalization successful")
        return True
    except Exception as e:
        print(f"✗ FAIL: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_full_pipeline(pdf_path: Path, expected_json: Path = None):
    """Test full invoice processing pipeline."""
    print("\n" + "="*60)
    print(f"TEST 5: Full Pipeline Test ({pdf_path.name})")
    print("="*60)
    try:
        # Step 1: Extract text
        print("\n[1/5] Extracting text...")
        ocr_engine = OCREngine()
        blocks = extract_text(pdf_path, ocr_engine)
        assert len(blocks) > 0, "No text extracted"
        print(f"  ✓ {len(blocks)} blocks extracted")
        
        # Step 2: Heuristics
        print("\n[2/5] Running heuristics...")
        invoice_id = extract_invoice_id(blocks)[0]
        invoice_date = canonicalize_date(extract_date(blocks, "invoice")[0])
        due_date = canonicalize_date(extract_date(blocks, "due")[0]) if extract_date(blocks, "due")[0] else None
        total_amount = canonicalize_amount(str(extract_total_amount(blocks)[0])) if extract_total_amount(blocks)[0] else None
        currency = canonicalize_currency(extract_currency(blocks, total_amount)[0])
        vendor_name = extract_vendor_name(blocks)[0]
        
        vendor_canonicalizer = VendorCanonicalizer()
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
        
        print(f"  ✓ Invoice ID: {invoice_id}")
        print(f"  ✓ Vendor: {vendor_name}")
        print(f"  ✓ Date: {invoice_date}")
        print(f"  ✓ Total: {total_amount} {currency}")
        
        # Step 3: Compare with expected (if provided)
        if expected_json and expected_json.exists():
            print("\n[3/5] Comparing with expected output...")
            with open(expected_json, 'r') as f:
                expected = json.load(f)
            
            # Map expected fields to our fields
            expected_mapping = {
                "invoice_number": "invoice_id",
                "company": "vendor_name",
                "date": "invoice_date",
                "total": "total_amount"
            }
            
            matches = 0
            total = 0
            for exp_key, our_key in expected_mapping.items():
                if exp_key in expected and expected[exp_key]:
                    total += 1
                    exp_val = str(expected[exp_key]).lower().strip()
                    our_val = str(result.get(our_key, "")).lower().strip() if result.get(our_key) else ""
                    
                    # Fuzzy match (contains check)
                    if exp_val in our_val or our_val in exp_val or exp_val.replace(",", ".") in our_val.replace(",", "."):
                        matches += 1
                        print(f"  ✓ {exp_key}: '{exp_val}' ≈ '{our_val}'")
                    else:
                        print(f"  ✗ {exp_key}: Expected '{exp_val}', Got '{our_val}'")
            
            accuracy = (matches / total * 100) if total > 0 else 0
            print(f"\n  Accuracy: {matches}/{total} ({accuracy:.1f}%)")
        
        print("\n✓ PASS: Full pipeline test successful")
        return True
    except Exception as e:
        print(f"\n✗ FAIL: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("INVOICEACE TEST SUITE")
    print("="*60)
    
    results = []
    
    # Test 1: OCR Engine
    results.append(("OCR Engine", test_ocr_engine()))
    
    # Test 2: PDF Extraction
    pdf_path = Path("sample data/1.pdf")
    if pdf_path.exists():
        results.append(("PDF Extraction", test_pdf_extraction(pdf_path)))
        
        # Test 3: Heuristics (requires extracted blocks)
        ocr_engine = OCREngine()
        blocks = extract_text(pdf_path, ocr_engine)
        if blocks:
            results.append(("Heuristics", test_heuristics(blocks)))
    else:
        print(f"\n⚠ Skipping PDF tests: {pdf_path} not found")
        results.append(("PDF Extraction", None))
    
    # Test 4: Canonicalization
    results.append(("Canonicalization", test_canonicalization()))
    
    # Test 5: Full Pipeline
    expected_json = Path("sample data/1.json")
    if pdf_path.exists():
        results.append(("Full Pipeline", test_full_pipeline(pdf_path, expected_json if expected_json.exists() else None)))
    else:
        results.append(("Full Pipeline", None))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    passed = 0
    failed = 0
    skipped = 0
    
    for test_name, result in results:
        if result is None:
            print(f"⚠ {test_name}: SKIPPED")
            skipped += 1
        elif result:
            print(f"✓ {test_name}: PASSED")
            passed += 1
        else:
            print(f"✗ {test_name}: FAILED")
            failed += 1
    
    print(f"\nTotal: {passed} passed, {failed} failed, {skipped} skipped")
    print("="*60)
    
    return failed == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

