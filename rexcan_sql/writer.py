"""
Write-only integration for PostgreSQL reporting layer

Rules:
1. Input must be validated & canonicalized
2. One commit per invoice (atomic)
3. Idempotent vendor inserts (ON CONFLICT)
4. Never called for reads
5. Failures logged but never block pipeline
"""
import logging
from typing import List, Dict, Any
from .db import get_connection

logger = logging.getLogger(__name__)


def write_invoice_to_postgres(invoice_data: Dict[str, Any]) -> None:
    """
    Write a fully processed invoice to PostgreSQL.

    This is the ONLY entry point for PostgreSQL writes.
    Called after MongoDB storage completes.

    Args:
        invoice_data: Validated invoice with structure:
            {
                "invoice_id": str,
                "vendor_id": str,
                "vendor_name": str,
                "invoice_date": str (YYYY-MM-DD),
                "total_amount": float,
                "items": [{"description": str, "amount": float}]
            }

    Raises:
        Exception: On database errors (caller should log and continue)
    """
    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            # Step 1: Idempotent vendor insert
            _insert_vendor(cur, invoice_data["vendor_id"], invoice_data["vendor_name"])

            # Step 2: Insert invoice header
            _insert_invoice(cur, invoice_data)

            # Step 3: Insert line items
            _insert_items(cur, invoice_data["invoice_id"], invoice_data["items"])

            # Atomic commit
            conn.commit()
            logger.info(f"PostgreSQL write succeeded: {invoice_data['invoice_id']}")

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"PostgreSQL write failed: {e}")
        raise
    finally:
        if conn:
            conn.close()


def _insert_vendor(cur, vendor_id: str, vendor_name: str) -> None:
    """
    Idempotent vendor insert using ON CONFLICT DO NOTHING.

    If vendor_id already exists, skip silently.
    """
    query = """
        INSERT INTO vendors (vendor_id, vendor_name)
        VALUES (%s, %s)
        ON CONFLICT (vendor_id) DO NOTHING
    """
    cur.execute(query, (vendor_id, vendor_name))


def _insert_invoice(cur, invoice_data: Dict[str, Any]) -> None:
    """
    Insert invoice header.

    Expects validated data from pipeline.
    """
    query = """
        INSERT INTO invoices (invoice_id, vendor_id, invoice_date, total_amount)
        VALUES (%s, %s, %s, %s)
    """
    cur.execute(query, (
        invoice_data["invoice_id"],
        invoice_data["vendor_id"],
        invoice_data["invoice_date"],
        invoice_data["total_amount"]
    ))


def _insert_items(cur, invoice_id: str, items: List[Dict[str, Any]]) -> None:
    """
    Insert invoice line items.

    Uses executemany for batch insert.
    """
    if not items:
        return

    query = """
        INSERT INTO invoice_items (invoice_id, description, amount)
        VALUES (%s, %s, %s)
    """
    values = [
        (invoice_id, item["description"], item["amount"])
        for item in items
    ]
    cur.executemany(query, values)
