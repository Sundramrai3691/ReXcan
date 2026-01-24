# InvoiceAce - Complete Architecture & Implementation Plan

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Upload Endpoint → File Storage (uploads/)            │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Text Extraction Pipeline                             │   │
│  │  1. pdfplumber (text-layer) → Fast, 95% confidence    │   │
│  │  2. If <50 chars → OCR Fallback                       │   │
│  │     a. pdf2image (150 DPI) → OpenCV preprocessing     │   │
│  │     b. EasyOCR (primary) + Tesseract (fallback)       │   │
│  │     c. Merge results (prefer higher confidence)       │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Heuristic Extraction (Deterministic)                 │   │
│  │  - Invoice ID (regex + label proximity)               │   │
│  │  - Dates (dateutil + multiple formats)                │   │
│  │  - Amounts (currency symbols + regex)                 │   │
│  │  - Vendor (label matching + fuzzy)                   │   │
│  │  - Line items (table detection)                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Confidence Scoring                                   │   │
│  │  Formula: 0.2 + 0.7*min(ocr, label, regex) + 0.1*LLM │   │
│  │  - >=0.85: Auto-accept (green)                        │   │
│  │  - 0.5-0.85: Flag for review (yellow)                 │   │
│  │  - <0.5: LLM fallback (red)                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  LLM Fallback (Surgical)                              │   │
│  │  Priority: Groq → Gemini → OpenAI → Anthropic         │   │
│  │  - Only for low-confidence fields                     │   │
│  │  - Top K=12 OCR blocks as context                     │   │
│  │  - Cached by SHA256 of context                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Canonicalization                                      │   │
│  │  - Dates → YYYY-MM-DD (ISO)                           │   │
│  │  - Currency → ISO4217 codes                           │   │
│  │  - Vendor → Canonical ID (RapidFuzz matching)         │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Validation & Audit                                   │   │
│  │  - Regex validation                                   │   │
│  │  - Type checking                                      │   │
│  │  - Audit log (all corrections)                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Output: InvoiceExtract JSON                          │   │
│  │  - All fields with confidence scores                  │   │
│  │  - Field reasons (1-line rationale)                  │   │
│  │  - Timings breakdown                                 │   │
│  │  - LLM usage flags                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

### OCR / Document Processing
- **pdfplumber**: Primary text-layer extraction (fast, 95% confidence)
- **pdf2image**: PDF → Image conversion (150 DPI for speed)
- **OpenCV**: Image preprocessing (deskew, denoise, binarize)
- **EasyOCR**: Primary OCR engine (good accuracy, moderate speed)
- **pytesseract**: Fallback OCR (fast, reliable)

### NLP / Text Processing
- **RapidFuzz**: Vendor name fuzzy matching (token_sort_ratio)
- **python-dateutil**: Flexible date parsing (multiple formats)
- **regex**: Pattern matching for IDs, amounts, dates

### LLM Fallback (Priority Order)
1. **Groq API** (Llama3 8B) - Fastest, free tier
2. **Google Gemini 1.5 Flash** - Fast, free tier
3. **OpenAI GPT-4o-mini** - Good accuracy, pay-per-use
4. **Anthropic Claude** - Best accuracy, pay-per-use
5. **Local Ollama** (last resort) - Zero cost, slow

### Storage
- **SQLite**: Job storage, cache, audit logs (dev/hackathon)
- **File system**: Uploads, outputs, cache files

### Deployment
- **FastAPI**: Backend API server
- **React + Tailwind**: Frontend (keyboard-first UI)
- **Docker**: Containerization (optional)
- **Vercel/Render**: Free tier hosting

## Processing Pipeline Details

### Stage 1: Text Extraction
1. **pdfplumber** (text-layer PDFs)
   - Extract words with positions
   - Confidence: 0.95 (text-layer)
   - Fast: <1s for typical PDF

2. **OCR Fallback** (scanned PDFs)
   - Convert PDF → Images (150 DPI)
   - Preprocess: grayscale only (fast)
   - Run Tesseract first (faster)
   - Fallback to EasyOCR if needed
   - Merge results by confidence

### Stage 2: Heuristic Extraction
- **Invoice ID**: Label proximity + regex patterns
- **Dates**: Multiple format support + dateutil parsing
- **Amounts**: Currency symbols + number extraction
- **Vendor**: Label matching + fuzzy search
- **Line Items**: Table detection (future)

### Stage 3: Confidence Scoring
```
confidence = 0.2 + 0.7 * min(ocr_c, label_score, regex_score) + (0.1 if llm_agree)
```

### Stage 4: LLM Fallback
- Trigger: confidence < 0.5 OR required field missing
- Context: Top K=12 OCR blocks (by confidence + proximity)
- Caching: SHA256 of context text
- Validation: Post-process LLM output with regex

### Stage 5: Canonicalization
- Dates: All formats → YYYY-MM-DD
- Currency: Symbols/codes → ISO4217
- Vendor: Fuzzy match → canonical_id

## Performance Targets

- **Text PDFs**: <2s (pdfplumber only)
- **Scanned PDFs**: <10s (OCR, no LLM)
- **With LLM**: +5-10s per low-confidence field
- **Accuracy**: >90% on typical invoices

## Error Handling & Fallbacks

1. **pdfplumber fails** → OCR fallback
2. **EasyOCR fails** → Tesseract fallback
3. **Both OCR fail** → Return empty, flag for manual
4. **Heuristics fail** → LLM fallback
5. **LLM fails** → Flag for manual review
6. **All fail** → Return partial results with low confidence

## Testing Strategy

1. **Unit Tests**: Each module independently
2. **Integration Tests**: Full pipeline with sample PDFs
3. **Golden Tests**: Compare against 1.json, 2.json, etc.
4. **Performance Tests**: Timing benchmarks
5. **Accuracy Tests**: Precision/recall on labeled data

