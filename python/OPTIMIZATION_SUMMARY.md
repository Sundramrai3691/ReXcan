# Latency Optimization Summary

## Changes Made

### 1. OCR Speed Optimizations
- **Reduced DPI**: Changed from 200 to 150 DPI (25% faster conversion)
- **Single Tesseract Config**: Removed multiple PSM mode attempts (was trying 2 configs, now 1)
- **Raised Confidence Threshold**: From 10 to 20 (filters low-quality results faster)
- **Grid-based Duplicate Detection**: Faster than full bbox comparison
- **Removed EasyOCR by Default**: EasyOCR is much slower, only use if Tesseract fails
- **Minimal Preprocessing**: Use "fast" mode (grayscale only) instead of "heavy"

### 2. Timeout & LLM Fallback
- **15-second OCR Timeout**: If OCR takes >15s, flag for LLM fallback
- **Poor Quality Detection**: If OCR returns <10 blocks, use LLM fallback
- **Direct Image Extraction**: LLM can extract directly from PDF images when OCR fails
- **Gemini Image Support**: Uses Gemini 1.5 Flash for fast image-based extraction

### 3. Error Fixes
- Fixed `'float' object has no attribute 'lower'` error in batch test
- Added proper null checks for all extracted fields

## Expected Performance

### Before:
- OCR: 90-120 seconds per PDF
- No LLM fallback for slow OCR

### After:
- OCR: 5-15 seconds per PDF (target)
- LLM fallback: 2-5 seconds when OCR is slow/poor
- Total: 5-20 seconds per PDF (vs 90-120s before)

## How It Works

1. **Fast Path** (Text PDFs):
   - pdfplumber extraction: <1s
   - Skip OCR entirely

2. **Medium Path** (Scanned PDFs):
   - OCR with Tesseract: 5-15s
   - If successful (>10 blocks), use results
   - If slow/poor, trigger LLM fallback

3. **Fallback Path** (Poor OCR):
   - LLM direct image extraction: 2-5s
   - Uses Gemini 1.5 Flash (fastest vision model)
   - Extracts all fields directly from image

## Setup Required

1. **Add API Keys to `.env`**:
```bash
# At least one of these:
GROQ_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

2. **Get Free API Keys**:
   - Groq: https://console.groq.com/ (Free tier, fastest)
   - Gemini: https://makersuite.google.com/app/apikey (Free tier, supports images)
   - OpenAI: https://platform.openai.com/api-keys (Pay-per-use)
   - Anthropic: https://console.anthropic.com/ (Pay-per-use)

## Testing

Run batch test:
```bash
python3 test_batch_all_pdfs.py
```

This will:
- Test all PDFs in `sample data/`
- Show extraction time for each
- Use LLM fallback when OCR is slow/poor
- Compare results with expected JSON files

## Next Steps

1. Add API keys to `.env` file
2. Run batch test to verify improvements
3. Monitor extraction times (should be <20s per PDF)
4. LLM will automatically handle cases where OCR is slow

