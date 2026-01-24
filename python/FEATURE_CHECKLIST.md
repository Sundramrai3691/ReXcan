# InvoiceAce - Complete Feature Checklist

## 🎯 Core Features

### OCR Pipeline
- [ ] pdfplumber text extraction (primary for text PDFs)
- [ ] Tesseract OCR (image-based OCR)
- [ ] EasyOCR (deep learning OCR)
- [ ] Google Document AI (fallback OCR)
- [ ] OCR caching (by file hash)
- [ ] Parallel processing (multi-page PDFs)
- [ ] Progress indicators
- [ ] Timeout handling (8s)

### Field Extraction (8 Fields)
- [ ] Invoice ID extraction
- [ ] Invoice Date extraction
- [ ] Due Date extraction
- [ ] Total Amount extraction
- [ ] Tax Amount extraction
- [ ] Subtotal extraction
- [ ] Currency extraction
- [ ] Vendor Name extraction

### Confidence Scoring
- [ ] Confidence formula implementation
- [ ] Auto-accept (≥0.85)
- [ ] Flag for review (0.5-0.85)
- [ ] LLM fallback trigger (<0.5)
- [ ] Sub-scores tracking (OCR, label, regex)

### LLM Fallback
- [ ] Gemini (Google) - Primary
- [ ] Groq - Fast fallback
- [ ] OpenAI - Reliable fallback
- [ ] Anthropic - Final fallback
- [ ] LLM batching (multiple fields)
- [ ] LLM caching (by context hash)
- [ ] Timeout handling (8s)
- [ ] Direct image extraction (poor OCR)
- [ ] Strict JSON validation

### Canonicalization
- [ ] Date normalization (YYYY-MM-DD)
- [ ] Currency normalization (ISO4217)
- [ ] Amount normalization (EU/US formats)
- [ ] Vendor canonicalization (RapidFuzz)

### Validation & Deduplication
- [ ] Dedupe hash computation
- [ ] Exact duplicate detection
- [ ] Near-duplicate detection (fuzzy matching)
- [ ] Arithmetic validation (subtotal + tax = total)

### Human-in-the-Loop (HITL)
- [ ] Auto-flagging (low confidence, duplicates, mismatches)
- [ ] Review queue endpoint (GET /review/queue)
- [ ] Manual corrections (POST /verify)
- [ ] Rollback functionality (POST /review/{id}/rollback)
- [ ] Immutable audit trail

### Learning-from-Edits
- [ ] Edit event capture
- [ ] Vendor alias creation
- [ ] Heuristic rule generation
- [ ] Gold sample creation (optional)
- [ ] Auto-promotion feature flag

### Export
- [ ] JSON export
- [ ] CSV export (default format)
- [ ] ERP-specific formats (QuickBooks, SAP, Oracle, Xero)
- [ ] Export safety gates (validation before export)

### Metrics & Monitoring
- [ ] Aggregate metrics endpoint (GET /metrics)
- [ ] Per-field accuracy tracking
- [ ] Timing breakdowns (OCR, heuristics, LLM)
- [ ] Cache hit rates
- [ ] SLO tracking (90th percentile)
- [ ] Source coverage tracking

### Safety & Reliability
- [ ] Input validation (file size, MIME type)
- [ ] Filename sanitization
- [ ] PII detection
- [ ] PII stripping (for LLM calls)
- [ ] Retry logic (OCR, LLM)
- [ ] Backpressure management (rate limiting)
- [ ] Error handling with fallbacks

### Line Items
- [ ] Table detection
- [ ] Row parsing
- [ ] Field extraction (description, quantity, unit_price, total)

### Audit Trail
- [ ] Correction logging
- [ ] User ID tracking
- [ ] Timestamp tracking
- [ ] Before/after values
- [ ] Immutable flag
- [ ] Audit log retrieval (GET /audit/{job_id})

### Vendor Management
- [ ] Vendor promotion (POST /vendor/promote)
- [ ] Vendor canonicalization
- [ ] Alias management

### API Endpoints
- [ ] GET /health
- [ ] POST /upload
- [ ] POST /ocr
- [ ] POST /process
- [ ] POST /verify
- [ ] GET /export/csv
- [ ] GET /metrics
- [ ] GET /uploads/{filename}
- [ ] GET /review/queue
- [ ] POST /review/{job_id}/apply
- [ ] POST /review/{job_id}/rollback
- [ ] GET /audit/{job_id}
- [ ] POST /vendor/promote

