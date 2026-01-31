"""
Read-only reporting queries

All queries are analytical only. Core pipeline never reads from PostgreSQL.

Optimization strategy:
- Use existing indexes (vendor_id, invoice_date)
- Leverage GROUP BY for aggregations
- Use DATE_TRUNC for time-based grouping
"""
from typing import List, Tuple
from .db import execute_query


def get_monthly_total_per_vendor(year: int, month: int) -> List[Tuple]:
    """
    Calculate total amount per vendor for a given month.

    Returns:
        List of (vendor_name, total_amount) tuples
    """
    query = """
        SELECT
            v.vendor_name,
            SUM(i.total_amount) AS total_amount
        FROM invoices i
        JOIN vendors v ON i.vendor_id = v.vendor_id
        WHERE DATE_TRUNC('month', i.invoice_date) = DATE_TRUNC('month', %s::DATE)
        GROUP BY v.vendor_name
        ORDER BY total_amount DESC
    """
    date_str = f"{year}-{month:02d}-01"
    return execute_query(query, (date_str,))


def get_invoice_count_per_day(start_date: str, end_date: str) -> List[Tuple]:
    """
    Count invoices per day in a date range.

    Args:
        start_date: YYYY-MM-DD
        end_date: YYYY-MM-DD

    Returns:
        List of (invoice_date, count) tuples
    """
    query = """
        SELECT
            invoice_date,
            COUNT(*) AS invoice_count
        FROM invoices
        WHERE invoice_date BETWEEN %s AND %s
        GROUP BY invoice_date
        ORDER BY invoice_date
    """
    return execute_query(query, (start_date, end_date))


def get_vendor_summary() -> List[Tuple]:
    """
    Get summary statistics per vendor.

    Returns:
        List of (vendor_name, invoice_count, total_amount, avg_amount) tuples
    """
    query = """
        SELECT
            v.vendor_name,
            COUNT(i.invoice_id) AS invoice_count,
            SUM(i.total_amount) AS total_amount,
            AVG(i.total_amount) AS avg_amount
        FROM vendors v
        LEFT JOIN invoices i ON v.vendor_id = i.vendor_id
        GROUP BY v.vendor_name
        ORDER BY total_amount DESC NULLS LAST
    """
    return execute_query(query)


def get_top_items_by_amount(limit: int = 10) -> List[Tuple]:
    """
    Get top invoice items by amount.

    Returns:
        List of (description, amount, invoice_id) tuples
    """
    query = """
        SELECT
            description,
            amount,
            invoice_id
        FROM invoice_items
        ORDER BY amount DESC
        LIMIT %s
    """
    return execute_query(query, (limit,))


def explain_vendor_total(vendor_id: str) -> List[Tuple]:
    """
    EXPLAIN ANALYZE for vendor total query.

    Use this to verify index usage on vendor_id.

    Returns:
        Query execution plan
    """
    query = """
        EXPLAIN ANALYZE
        SELECT SUM(total_amount)
        FROM invoices
        WHERE vendor_id = %s
    """
    return execute_query(query, (vendor_id,))
