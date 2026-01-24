# Requirements for Complete Testing

## What You Need to Provide

### 1. LLM API Keys (for fallback testing)
Add at least ONE to `.env` file:
```bash
# Groq (Recommended - Fast + Free)
GROQ_API_KEY=your_groq_key_here

# OR Google Gemini (Fast + Free)
GEMINI_API_KEY=your_gemini_key_here

# OR OpenAI (Pay-per-use)
OPENAI_API_KEY=your_openai_key_here

# OR Anthropic Claude (Pay-per-use)
ANTHROPIC_API_KEY=your_anthropic_key_here
```

**Get API Keys:**
- Groq: https://console.groq.com/ (Free tier available)
- Gemini: https://makersuite.google.com/app/apikey (Free tier)
- OpenAI: https://platform.openai.com/api-keys (Pay-per-use)
- Anthropic: https://console.anthropic.com/ (Pay-per-use)

### 2. Sample Test Files
Place in `python/sample data/`:
- ✅ `1.pdf` - Already exists
- ✅ `1.json` - Expected output (already exists)
- Additional test PDFs (2.pdf, 3.pdf, etc.) if available

### 3. System Dependencies
- ✅ Tesseract OCR: `brew install tesseract` (DONE)
- ✅ Poppler: `brew install poppler` (DONE)
- ✅ Python packages: `pip install -r requirements.txt` (DONE)

## What Will Be Tested

1. **Text PDFs** (pdfplumber extraction)
2. **Scanned PDFs** (OCR extraction)
3. **Image files** (PNG, JPG - OCR extraction)
4. **Low quality images** (enhanced preprocessing)
5. **Inconsistent titles** (enhanced heuristics)
6. **Non-distinguishable sections** (LLM fallback)
7. **Multiple languages** (Portuguese, English, etc.)
8. **European number formats** (1,35 vs 1.35)

## Test Execution Plan

1. Run component tests
2. Run full pipeline test
3. Identify failures
4. Optimize heuristics
5. Test LLM fallback
6. Verify against expected outputs

