# InvoiceAce - Intelligent Invoice Processing

A hackathon-grade, hybrid invoice extraction system that converts messy invoices (text PDFs, scans, emails) into canonical JSON/CSV using deterministic preprocessing + OCR + heuristics, with LLM fallback only for ambiguous low-confidence fields.

## Features

- **Fast Processing**: <10s for typical documents (no LLM), <5-10s extra when LLM fallback used
- **Deterministic-First**: 80-95% of fields handled by pdfplumber/EasyOCR + heuristics
- **LLM Fallback**: Surgical LLM calls only for <20% ambiguous fields
- **Confidence Scoring**: Per-field confidence badges with 1-line rationale
- **Canonicalization**: ISO dates, ISO4217 currency codes, vendor canonical IDs
- **Audit Trail**: Complete logging of all corrections
- **Export**: JSON & CSV export (QuickBooks/ERP friendly)

## Quick Start

### 1. Install Dependencies

```bash
# Create virtual environment
python -m venv .venv

# Activate (Windows)
.\.venv\Scripts\Activate

# Activate (Linux/Mac)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Install System Dependencies

**Tesseract OCR:**
- Windows: Download from [GitHub](https://github.com/UB-Mannheim/tesseract/wiki)
- Mac: `brew install tesseract`
- Linux: `sudo apt-get install tesseract-ocr`

**Poppler (for pdf2image):**
- Windows: Download from [poppler-windows](https://github.com/oschwartz10612/poppler-windows/releases)
- Mac: `brew install poppler`
- Linux: `sudo apt-get install poppler-utils`

### 3. Configure Environment

```bash
# Copy template
cp .env.template .env

# Edit .env and add at least one LLM API key
# Groq (recommended - fast + free): https://console.groq.com/
# Gemini: https://makersuite.google.com/app/apikey
# OpenAI: https://platform.openai.com/api-keys
```

### 4. Run Server

```bash
# Development mode
uvicorn app.main:app --reload --port 8000

# Production mode
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 5. Test API

```bash
# Upload a PDF
curl -X POST "http://127.0.0.1:8000/upload" -F "file=@data/gold/1.pdf"

# Run OCR (use returned jobId)
curl -X POST "http://127.0.0.1:8000/ocr?jobId=<jobId>"

# Process invoice
curl -X POST "http://127.0.0.1:8000/process?jobId=<jobId>"

# Export CSV
curl "http://127.0.0.1:8000/export/csv?jobId=<jobId>" -o invoice.csv

# Get metrics
curl "http://127.0.0.1:8000/metrics"
```

## API Endpoints

- `GET /health` - Health check
- `POST /upload` - Upload invoice file (PDF/image)
- `POST /ocr?jobId=<id>` - Run OCR only
- `POST /process?jobId=<id>` - Run full pipeline
- `POST /verify` - Apply manual corrections
- `GET /export/csv?jobId=<id>` - Export as CSV
- `GET /metrics` - Get aggregate metrics
- `GET /uploads/{filename}` - Preview uploaded file

## Architecture

```
python/
├── app/
│   ├── main.py              # FastAPI app
│   ├── ocr_engine.py        # EasyOCR + Tesseract wrappers
│   ├── preprocess.py        # Image preprocessing
│   ├── extract_text.py      # pdfplumber + OCR orchestration
│   ├── heuristics.py        # Field extractors
│   ├── confidence.py        # Confidence scoring
│   ├── llm_router.py        # LLM wrapper + caching
│   ├── canonicalize.py     # Date/currency/vendor canonicalization
│   ├── validator.py         # Field validators
│   ├── audit.py             # Audit logging
│   ├── models.py            # Pydantic models
│   └── utils.py             # Utilities
├── data/
│   ├── vendors.csv          # Canonical vendor list
│   ├── gold/                # Sample invoices
│   └── outputs/             # Processed outputs
├── uploads/                 # Uploaded files
├── cache/                   # OCR & LLM cache
└── requirements.txt
```

## Confidence Scoring

Confidence formula:
```
base = 0.2
final = base + 0.7 * min(ocr_c, label_score, regex_score) + (0.1 if llm_agree else 0.0)
```

Thresholds:
- `>= 0.85` → auto-accept (green)
- `0.5 <= conf < 0.85` → flag (yellow) - show to user
- `< 0.5` → LLM fallback or manual correction (red)

## LLM Fallback Strategy

- LLM is called only for fields where `confidence < 0.5` or required field missing
- Uses top K=12 most relevant OCR blocks
- Caches responses by SHA of OCR text
- Provider priority: Groq → Gemini → OpenAI → Anthropic

## Demo Script

1. Upload a real invoice PDF
2. Show `/process` endpoint extracting fields
3. Highlight flagged fields in UI
4. Demonstrate keyboard-first correction flow
5. Show LLM fallback for low-confidence field
6. Display metrics: % auto-accepted, flagged rate, LLM call rate

## License

MIT

