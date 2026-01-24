"""Pydantic models for InvoiceAce."""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import date


class OCRBlock(BaseModel):
    """Single OCR text block with bounding box and confidence."""
    text: str
    bbox: List[float] = Field(..., description="[x1, y1, x2, y2] bounding box")
    confidence: float = Field(..., ge=0.0, le=1.0, description="OCR confidence 0-1")
    engine: str = Field(..., description="OCR engine used: 'easyocr', 'tesseract', or 'pdfplumber'")


class LineItem(BaseModel):
    """Invoice line item."""
    description: str
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    total: Optional[float] = None


class InvoiceExtract(BaseModel):
    """Complete invoice extraction result."""
    invoice_id: Optional[str] = None
    vendor_name: Optional[str] = None
    vendor_id: Optional[str] = None
    invoice_date: Optional[str] = None  # YYYY-MM-DD
    total_amount: Optional[float] = None
    amount_subtotal: Optional[float] = None
    amount_tax: Optional[float] = None
    currency: Optional[str] = None  # ISO4217 code
    line_items: List[LineItem] = Field(default_factory=list)
    raw_ocr_blocks: List[OCRBlock] = Field(default_factory=list)
    field_confidences: Dict[str, float] = Field(default_factory=dict)
    field_reasons: Dict[str, str] = Field(default_factory=dict, description="1-line rationale per field")
    field_sources: Dict[str, str] = Field(default_factory=dict, description="Source per field: 'pdfplumber', 'easyocr', 'tesseract', 'docai', 'heuristic', 'llm'")
    timings: Dict[str, float] = Field(default_factory=dict)
    llm_used: bool = False
    llm_fields: List[str] = Field(default_factory=list, description="Fields that used LLM fallback")
    dedupe_hash: Optional[str] = None  # SHA256 hash for duplicate detection
    is_duplicate: bool = False  # Flag if duplicate invoice detected
    is_near_duplicate: bool = False  # Flag if near-duplicate invoice detected
    near_duplicates: List[Dict[str, Any]] = Field(default_factory=list, description="List of near-duplicate invoices with similarity scores")
    arithmetic_mismatch: bool = False  # Flag if subtotal + tax ≠ total
    # Validation flags for invalid invoices
    missing_invoice_id: bool = False  # Flag if invoice_id is not present
    missing_total: bool = False  # Flag if total_amount is not present
    missing_vendor_name: bool = False  # Flag if vendor_name is not present
    missing_date: bool = False  # Flag if invoice_date is not present
    is_invalid: bool = False  # Flag if invoice is invalid (any of the above missing fields)


class ProcessRequest(BaseModel):
    """Request to process an invoice."""
    job_id: str


class VerifyRequest(BaseModel):
    """Request to verify/correct extracted fields."""
    job_id: str
    corrections: Dict[str, Any] = Field(..., description="Field name -> corrected value mapping")
    user_id: Optional[str] = Field(default="system", description="User ID making the correction")


class UploadResponse(BaseModel):
    """Response from file upload."""
    job_id: str
    filename: str
    preview_url: str


class MetricsResponse(BaseModel):
    """Aggregate metrics."""
    total_invoices: int
    total_fields_processed: int
    auto_accepted_count: int
    flagged_count: int
    llm_call_count: int
    avg_confidence: float
    avg_processing_time: float
    avg_correction_time: Optional[float] = None
    heuristic_coverage: float  # % fields resolved without LLM
    avg_ocr_time: Optional[float] = None
    avg_heuristics_time: Optional[float] = None
    avg_llm_time: Optional[float] = None
    slo_90th_percentile: Optional[float] = None  # 90% of invoices processed under this time
    source_coverage: Optional[Dict[str, float]] = None  # % fields by source (heuristic, llm, etc.)

