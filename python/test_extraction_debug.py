"""Debug script to see extracted text and test heuristics."""
import sys
from pathlib import Path
import json

sys.path.insert(0, str(Path(__file__).parent))

from app.extract_text import extract_text
from app.ocr_engine import OCREngine

# Extract text
pdf_path = Path("sample data/1.pdf")
print(f"\nExtracting text from {pdf_path.name}...\n")
ocr_engine = OCREngine()
blocks = extract_text(pdf_path, ocr_engine)

print(f"\n{'='*70}")
print(f"EXTRACTED TEXT ({len(blocks)} blocks)")
print(f"{'='*70}\n")

# Show all extracted text
full_text = []
for i, block in enumerate(blocks, 1):
    text = block.text.strip()
    if text:
        full_text.append(text)
        print(f"{i:3d}. [{block.engine:10s}] {text}")

print(f"\n{'='*70}")
print("FULL TEXT (concatenated):")
print(f"{'='*70}\n")
print(" ".join(full_text))

# Save to file
with open("extracted_text.txt", "w", encoding="utf-8") as f:
    f.write("\n".join([f"{i}. {b.text}" for i, b in enumerate(blocks, 1) if b.text.strip()]))

print(f"\n✓ Saved extracted text to extracted_text.txt")

