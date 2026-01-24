"""Quick test checklist to verify all components."""
import sys
from pathlib import Path
import time

sys.path.insert(0, str(Path(__file__).parent))

print("\n" + "="*70)
print("INVOICEACE COMPONENT CHECKLIST")
print("="*70)

checklist = []

# Test 1: Imports
print("\n[1] Testing imports...")
try:
    from app.models import OCRBlock, InvoiceExtract
    from app.ocr_engine import OCREngine
    from app.extract_text import extract_text
    from app.heuristics import extract_invoice_id, extract_date, extract_total_amount
    from app.canonicalize import canonicalize_date, canonicalize_currency, VendorCanonicalizer
    print("  ✓ All imports successful")
    checklist.append(("Imports", True))
except Exception as e:
    print(f"  ✗ Import failed: {e}")
    checklist.append(("Imports", False))

# Test 2: OCR Engine
print("\n[2] Testing OCR engine initialization...")
try:
    start = time.time()
    ocr_engine = OCREngine()
    elapsed = time.time() - start
    print(f"  ✓ OCR engine initialized in {elapsed:.2f}s")
    print(f"    - EasyOCR: {'✓' if ocr_engine.use_easyocr else '✗'}")
    print(f"    - Tesseract: {'✓' if ocr_engine.use_tesseract else '✗'}")
    checklist.append(("OCR Engine", ocr_engine.use_tesseract or ocr_engine.use_easyocr))
except Exception as e:
    print(f"  ✗ OCR engine failed: {e}")
    checklist.append(("OCR Engine", False))

# Test 3: PDF Text Extraction
print("\n[3] Testing PDF text extraction...")
pdf_path = Path("sample data/1.pdf")
if pdf_path.exists():
    try:
        print(f"  → Processing {pdf_path.name}...")
        start = time.time()
        ocr_engine = OCREngine()
        blocks = extract_text(pdf_path, ocr_engine)
        elapsed = time.time() - start
        print(f"  ✓ Extracted {len(blocks)} blocks in {elapsed:.2f}s")
        print(f"    - Total characters: {sum(len(b.text) for b in blocks)}")
        if blocks:
            print(f"    - Sample: '{blocks[0].text[:50]}...'")
        checklist.append(("PDF Extraction", len(blocks) > 0))
    except Exception as e:
        print(f"  ✗ PDF extraction failed: {e}")
        checklist.append(("PDF Extraction", False))
else:
    print(f"  ⚠ PDF not found: {pdf_path}")
    checklist.append(("PDF Extraction", None))

# Test 4: Heuristics
print("\n[4] Testing heuristics...")
if pdf_path.exists():
    try:
        ocr_engine = OCREngine()
        blocks = extract_text(pdf_path, ocr_engine)
        if blocks:
            invoice_id = extract_invoice_id(blocks)
            invoice_date = extract_date(blocks, "invoice")
            total_amount = extract_total_amount(blocks)
            print(f"  ✓ Invoice ID: {invoice_id[0]} (conf: {invoice_id[1]:.2f})")
            print(f"  ✓ Invoice Date: {invoice_date[0]} (conf: {invoice_date[1]:.2f})")
            print(f"  ✓ Total Amount: {total_amount[0]} (conf: {total_amount[1]:.2f})")
            checklist.append(("Heuristics", True))
        else:
            print("  ✗ No blocks to test heuristics")
            checklist.append(("Heuristics", False))
    except Exception as e:
        print(f"  ✗ Heuristics failed: {e}")
        checklist.append(("Heuristics", False))
else:
    checklist.append(("Heuristics", None))

# Test 5: Canonicalization
print("\n[5] Testing canonicalization...")
try:
    date_canon = canonicalize_date("01/23/2019")
    currency_canon = canonicalize_currency("$")
    vendor_canon = VendorCanonicalizer()
    print(f"  ✓ Date: '01/23/2019' → '{date_canon}'")
    print(f"  ✓ Currency: '$' → '{currency_canon}'")
    print(f"  ✓ Vendor canonicalizer initialized")
    checklist.append(("Canonicalization", True))
except Exception as e:
    print(f"  ✗ Canonicalization failed: {e}")
    checklist.append(("Canonicalization", False))

# Test 6: FastAPI endpoints (if server running)
print("\n[6] Testing FastAPI endpoints...")
try:
    import requests
    try:
        response = requests.get("http://127.0.0.1:8000/health", timeout=2)
        if response.status_code == 200:
            print("  ✓ FastAPI server is running")
            checklist.append(("FastAPI Server", True))
        else:
            print(f"  ✗ Server returned status {response.status_code}")
            checklist.append(("FastAPI Server", False))
    except requests.exceptions.RequestException:
        print("  ⚠ FastAPI server not running (start with: uvicorn app.main:app --reload)")
        checklist.append(("FastAPI Server", None))
except ImportError:
    print("  ⚠ requests not installed, skipping API test")
    checklist.append(("FastAPI Server", None))

# Summary
print("\n" + "="*70)
print("CHECKLIST SUMMARY")
print("="*70)

passed = 0
failed = 0
skipped = 0

for item, status in checklist:
    if status is None:
        status_str = "SKIPPED"
        symbol = "⚠"
        skipped += 1
    elif status:
        status_str = "PASS"
        symbol = "✓"
        passed += 1
    else:
        status_str = "FAIL"
        symbol = "✗"
        failed += 1
    
    print(f"{symbol} {item:25s} [{status_str}]")

print("="*70)
print(f"Total: {passed} passed, {failed} failed, {skipped} skipped")
print("="*70)

if failed == 0:
    print("\n✓ All critical components are working!")
else:
    print(f"\n✗ {failed} component(s) need attention")

