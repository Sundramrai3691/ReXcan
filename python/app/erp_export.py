"""ERP-specific CSV export formats."""
import csv
import io
from typing import Dict, Any, List, Optional
from app.models import InvoiceExtract, LineItem


# ERP-specific field mappings
ERP_SCHEMAS = {
    "quickbooks": {
        "invoice_id": "Invoice Number",
        "vendor_name": "Vendor",
        "invoice_date": "Date",
        "total_amount": "Amount",
        "amount_subtotal": "Subtotal",
        "amount_tax": "Tax",
        "currency": "Currency"
    },
    "sap": {
        "invoice_id": "Invoice Number",
        "vendor_name": "Vendor Name",
        "invoice_date": "Document Date",
        "total_amount": "Net Amount",
        "amount_subtotal": "Subtotal",
        "amount_tax": "Tax Amount",
        "currency": "Currency Code"
    },
    "oracle": {
        "invoice_id": "Invoice Number",
        "vendor_name": "Supplier Name",
        "invoice_date": "Invoice Date",
        "total_amount": "Invoice Amount",
        "amount_subtotal": "Subtotal",
        "amount_tax": "Tax",
        "currency": "Currency"
    },
    "xero": {
        "invoice_id": "Invoice Number",
        "vendor_name": "Contact Name",
        "invoice_date": "Date",
        "total_amount": "Total",
        "amount_subtotal": "Subtotal",
        "amount_tax": "Tax",
        "currency": "Currency Code"
    }
}


def export_to_erp_format(invoice_data: Dict[str, Any], erp_type: str = "quickbooks") -> str:
    """Export invoice to ERP-specific CSV format.
    
    Args:
        invoice_data: Invoice extraction result
        erp_type: ERP type (quickbooks, sap, oracle, xero)
    
    Returns:
        CSV string
    """
    if erp_type not in ERP_SCHEMAS:
        erp_type = "quickbooks"  # Default
    
    schema = ERP_SCHEMAS[erp_type]
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header row
    headers = list(schema.values())
    writer.writerow(headers)
    
    # Data row
    row = []
    for field_key in schema.keys():
        value = invoice_data.get(field_key, "")
        # Format dates for ERP
        if field_key == "invoice_date" and value:
            # Keep ISO format (YYYY-MM-DD) - most ERPs accept this
            row.append(value)
        # Format amounts
        elif field_key in ["total_amount", "amount_subtotal", "amount_tax"] and value:
            row.append(f"{float(value):.2f}")
        else:
            row.append(str(value) if value else "")
    
    writer.writerow(row)
    
    # Line items (if available and ERP supports it)
    if invoice_data.get("line_items") and erp_type in ["quickbooks", "sap", "oracle"]:
        writer.writerow([])
        writer.writerow(["Line Items"])
        writer.writerow(["Description", "Quantity", "Unit Price", "Total"])
        for item in invoice_data["line_items"]:
            writer.writerow([
                item.get("description", ""),
                item.get("quantity", ""),
                item.get("unit_price", ""),
                item.get("total", "")
            ])
    
    return output.getvalue()


def validate_export_safety(invoice_data: Dict[str, Any]) -> tuple[bool, List[str]]:
    """Validate invoice data is safe to export to ERP.
    
    Args:
        invoice_data: Invoice extraction result
    
    Returns:
        (is_safe, list_of_warnings)
    """
    warnings = []
    
    # Check for flagged fields
    if invoice_data.get("needs_human_review", False):
        warnings.append("Invoice flagged for human review - should not auto-export")
    
    # Check for low confidence fields
    field_confidences = invoice_data.get("field_confidences", {})
    required_fields = ["invoice_id", "invoice_date", "total_amount", "vendor_name"]
    for field in required_fields:
        conf = field_confidences.get(field, 0)
        # Handle both float and string confidence values
        if isinstance(conf, str):
            try:
                conf = float(conf)
            except (ValueError, TypeError):
                conf = 0.0
        if isinstance(conf, (int, float)) and conf < 0.5:
            warnings.append(f"Low confidence for {field}: {conf:.2f}")
    
    # Check for duplicates
    if invoice_data.get("is_duplicate", False):
        warnings.append("Duplicate invoice detected - should not auto-export")
    
    # Check for arithmetic mismatches
    if invoice_data.get("arithmetic_mismatch", False):
        warnings.append("Arithmetic mismatch detected - should not auto-export")
    
    # Check for missing required fields
    for field in required_fields:
        if not invoice_data.get(field):
            warnings.append(f"Missing required field: {field}")
    
    is_safe = len(warnings) == 0
    return is_safe, warnings

