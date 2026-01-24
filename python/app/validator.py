"""Validators for extracted fields."""
import re
from typing import Optional, Tuple
from app.utils import parse_amount_str, normalize_text
from dateutil import parser as date_parser


def validate_invoice_id(invoice_id: Optional[str]) -> Tuple[bool, str]:
    """Validate invoice ID format.
    
    Args:
        invoice_id: Invoice ID string
    
    Returns:
        (is_valid, reason)
    """
    if not invoice_id:
        return False, "Invoice ID is empty"
    
    invoice_id = invoice_id.strip()
    
    # Check length
    if len(invoice_id) < 3:
        return False, "Invoice ID too short"
    
    if len(invoice_id) > 50:
        return False, "Invoice ID too long"
    
    # Check format (alphanumeric with common separators)
    if not re.match(r'^[A-Z0-9\-\/_\s]+$', invoice_id, re.IGNORECASE):
        return False, "Invoice ID contains invalid characters"
    
    return True, "Valid invoice ID"


def parse_date(raw_str: Optional[str]) -> Optional[str]:
    """Parse date string to ISO format.
    
    Args:
        raw_str: Raw date string
    
    Returns:
        ISO date string (YYYY-MM-DD) or None
    """
    if not raw_str:
        return None
    
    try:
        # Normalize text first
        text = normalize_text(str(raw_str))
        
        # Try parsing with dateutil
        parsed = date_parser.parse(text, fuzzy=True)
        
        # Validate date range (2000 to 5 years from now)
        from datetime import datetime
        today = datetime.now()
        min_date = datetime(2000, 1, 1)
        max_date = datetime(today.year + 5, 12, 31)
        
        if min_date <= parsed <= max_date:
            return parsed.date().isoformat()
    except Exception:
        pass
    
    return None


def validate_date(date_str: Optional[str]) -> Tuple[bool, str]:
    """Validate date format (YYYY-MM-DD).
    
    Args:
        date_str: Date string
    
    Returns:
        (is_valid, reason)
    """
    if not date_str:
        return False, "Date is empty"
    
    # Check ISO format
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        return False, "Date not in YYYY-MM-DD format"
    
    # Check valid date
    try:
        from datetime import datetime
        datetime.strptime(date_str, '%Y-%m-%d')
        return True, "Valid date"
    except:
        return False, "Invalid date value"


def validate_amount(amount: Optional[float]) -> Tuple[bool, str]:
    """Validate amount.
    
    Args:
        amount: Amount as float
    
    Returns:
        (is_valid, reason)
    """
    if amount is None:
        return False, "Amount is empty"
    
    if not isinstance(amount, (int, float)):
        return False, "Amount is not a number"
    
    if amount < 0:
        return False, "Amount is negative"
    
    if amount > 1e10:  # Sanity check
        return False, "Amount too large"
    
    return True, "Valid amount"


def validate_currency(currency: Optional[str]) -> Tuple[bool, str]:
    """Validate currency code (ISO4217).
    
    Args:
        currency: Currency code
    
    Returns:
        (is_valid, reason)
    """
    if not currency:
        return False, "Currency is empty"
    
    currency = currency.upper().strip()
    
    # Check ISO4217 format (3 uppercase letters)
    if not re.match(r'^[A-Z]{3}$', currency):
        return False, "Currency not in ISO4217 format"
    
    # Common currency codes
    valid_codes = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CNY', 'CHF']
    
    if currency not in valid_codes:
        return False, f"Unrecognized currency code: {currency}"
    
    return True, "Valid currency"


def validate_vendor_name(vendor_name: Optional[str]) -> Tuple[bool, str]:
    """Validate vendor name.
    
    Args:
        vendor_name: Vendor name string
    
    Returns:
        (is_valid, reason)
    """
    if not vendor_name:
        return False, "Vendor name is empty"
    
    vendor_name = vendor_name.strip()
    
    if len(vendor_name) < 2:
        return False, "Vendor name too short"
    
    if len(vendor_name) > 200:
        return False, "Vendor name too long"
    
    return True, "Valid vendor name"


def validate_field(field_name: str, value: any) -> Tuple[bool, str]:
    """Validate a field by name.
    
    Args:
        field_name: Name of the field
        value: Field value
    
    Returns:
        (is_valid, reason)
    """
    validators = {
        'invoice_id': validate_invoice_id,
        'invoice_date': validate_date,
        'total_amount': validate_amount,
        'currency': validate_currency,
        'vendor_name': validate_vendor_name,
    }
    
    validator = validators.get(field_name)
    if validator:
        return validator(value)
    
    return True, "No validator for field"

