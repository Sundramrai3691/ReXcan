from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ReXcan OCR Processing Pipeline")


class InvoiceItem(BaseModel):
    description: str
    amount: float


class InvoiceData(BaseModel):
    vendor_name: str
    invoice_date: str
    total_amount: float
    items: List[InvoiceItem]


class ProcessedInvoice(BaseModel):
    invoice_id: str
    vendor_id: str
    vendor_name: str
    invoice_date: str
    total_amount: float
    items: List[InvoiceItem]


@app.get("/")
def health_check():
    return {"status": "ok", "service": "rexcan"}


@app.post("/process-invoice")
async def process_invoice(data: InvoiceData) -> ProcessedInvoice:
    """
    Core OCR processing pipeline:
    1. OCR extraction (simulated)
    2. Heuristics validation
    3. Selective LLM fallback (simulated)
    4. MongoDB storage
    5. PostgreSQL reporting (non-blocking)
    """
    try:
        # Simulate OCR + validation
        validated_data = _validate_invoice(data)

        # Store in MongoDB (operational data)
        stored = _store_in_mongodb(validated_data)

        # Safe hook: PostgreSQL write (non-blocking, log-only on failure)
        try:
            from rexcan_sql.writer import write_invoice_to_postgres
            # Convert Pydantic model to dict for writer
            invoice_dict = stored.model_dump()
            write_invoice_to_postgres(invoice_dict)
        except Exception as e:
            logger.error(f"PostgreSQL write failed (non-blocking): {e}")

        return stored

    except Exception as e:
        logger.error(f"Pipeline error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _validate_invoice(data: InvoiceData) -> InvoiceData:
    """Heuristics validation + selective LLM fallback"""
    # Simulated validation logic
    if data.total_amount <= 0:
        raise ValueError("Invalid total amount")
    return data


def _store_in_mongodb(data: InvoiceData) -> ProcessedInvoice:
    """Store in MongoDB and return processed invoice"""
    # Simulated MongoDB storage
    import uuid

    invoice_id = str(uuid.uuid4())
    vendor_id = f"VND{hash(data.vendor_name) % 10000}"

    processed = ProcessedInvoice(
        invoice_id=invoice_id,
        vendor_id=vendor_id,
        vendor_name=data.vendor_name,
        invoice_date=data.invoice_date,
        total_amount=data.total_amount,
        items=data.items
    )

    logger.info(f"Stored invoice {invoice_id} in MongoDB")
    return processed
