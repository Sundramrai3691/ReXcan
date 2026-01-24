"""Safety and reliability layers for InvoiceAce."""
import os
import hashlib
import re
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime
import json


class SafetyGuard:
    """Safety and reliability checks."""
    
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
    ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
    ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg']
    
    def __init__(self):
        self.llm_call_count = 0
        self.max_llm_calls = int(os.getenv("LLM_MAX_CALLS_PER_JOB", "10"))
    
    def validate_file(self, file_path: Path, file_size: int, mime_type: Optional[str] = None) -> tuple[bool, Optional[str]]:
        """Validate uploaded file.
        
        Returns:
            (is_valid, error_message)
        """
        # Size check
        if file_size > self.MAX_FILE_SIZE:
            return False, f"File too large: {file_size / 1024 / 1024:.1f}MB (max: {self.MAX_FILE_SIZE / 1024 / 1024}MB)"
        
        # Extension check
        if file_path.suffix.lower() not in self.ALLOWED_EXTENSIONS:
            return False, f"Invalid file type: {file_path.suffix} (allowed: {', '.join(self.ALLOWED_EXTENSIONS)})"
        
        # MIME type check (if provided)
        if mime_type and mime_type not in self.ALLOWED_MIME_TYPES:
            return False, f"Invalid MIME type: {mime_type}"
        
        return True, None
    
    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename to prevent path traversal."""
        # Remove path components
        filename = Path(filename).name
        # Remove dangerous characters
        filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
        # Limit length
        if len(filename) > 255:
            name, ext = os.path.splitext(filename)
            filename = name[:250] + ext
        return filename
    
    def generate_safe_filename(self, original_filename: str, content_hash: Optional[str] = None) -> str:
        """Generate safe filename with hash to prevent collisions."""
        if content_hash is None:
            # Use timestamp + hash of original name
            content_hash = hashlib.sha256(
                f"{original_filename}{datetime.now().isoformat()}".encode()
            ).hexdigest()[:16]
        
        ext = Path(original_filename).suffix
        return f"{content_hash}{ext}"
    
    def should_use_llm(self, confidence: float, field: str, is_required: bool = True) -> bool:
        """LLM safety gate: only allow LLM if confidence < 0.5."""
        if confidence >= 0.5:
            return False
        
        if not is_required:
            return False
        
        if self.llm_call_count >= self.max_llm_calls:
            return False
        
        return True
    
    def check_llm_budget(self) -> tuple[bool, str]:
        """Check if LLM calls are within budget."""
        if self.llm_call_count >= self.max_llm_calls:
            return False, f"LLM call limit reached: {self.llm_call_count}/{self.max_llm_calls}"
        return True, ""
    
    def increment_llm_call(self):
        """Increment LLM call counter."""
        self.llm_call_count += 1
    
    def validate_extracted_data(self, invoice_data: Dict[str, Any]) -> tuple[bool, List[str]]:
        """Run sanity checks on extracted invoice data.
        
        Returns:
            (is_valid, list_of_warnings)
        """
        warnings = []
        
        # Numeric sanity
        total = invoice_data.get('total_amount')
        if total is not None:
            try:
                total_float = float(total)
                if total_float <= 0:
                    warnings.append("Total amount is zero or negative")
                if total_float > 10000000:  # 10M
                    warnings.append("Total amount seems unusually high")
            except (ValueError, TypeError):
                warnings.append("Total amount is not a valid number")
        
        # Date sanity
        invoice_date = invoice_data.get('invoice_date')
        if invoice_date:
            try:
                from dateutil import parser
                date_obj = parser.parse(str(invoice_date))
                today = datetime.now()
                
                if date_obj.year < 2000:
                    warnings.append(f"Invoice date is before 2000: {invoice_date}")
                if date_obj > today.replace(year=today.year + 3):
                    warnings.append(f"Invoice date is more than 3 years in future: {invoice_date}")
            except Exception:
                warnings.append(f"Invalid invoice date format: {invoice_date}")
        
        # Invoice ID sanity
        invoice_id = invoice_data.get('invoice_id')
        if invoice_id:
            if len(str(invoice_id)) > 100:
                warnings.append("Invoice ID is unusually long")
        
        return len(warnings) == 0, warnings
    
    def detect_pii(self, text: str) -> Dict[str, List[str]]:
        """Detect PII in text.
        
        Returns:
            Dict with PII types and detected values
        """
        pii_found = {
            "ssn": [],
            "credit_card": [],
            "email": [],
            "phone": []
        }
        
        # Detect SSN
        ssn_pattern = r'\b\d{3}-\d{2}-\d{4}\b'
        pii_found["ssn"] = re.findall(ssn_pattern, text)
        pii_found["ssn"].extend(re.findall(r'\b\d{9}\b', text))
        
        # Detect credit cards
        card_pattern = r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'
        pii_found["credit_card"] = re.findall(card_pattern, text)
        
        # Detect email
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        pii_found["email"] = re.findall(email_pattern, text, re.I)
        
        # Detect phone numbers
        phone_pattern = r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b'
        pii_found["phone"] = re.findall(phone_pattern, text)
        
        return {k: v for k, v in pii_found.items() if v}
    
    def strip_pii(self, text: str) -> str:
        """Strip potential PII from text (for LLM calls)."""
        # Remove SSN patterns
        text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[SSN]', text)
        text = re.sub(r'\b\d{9}\b', '[SSN]', text)
        
        # Remove credit card patterns
        text = re.sub(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', '[CARD]', text)
        
        # Remove email (keep domain)
        text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)
        
        # Remove phone numbers
        text = re.sub(r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b', '[PHONE]', text)
        
        return text
    
    def should_strip_pii_for_llm(self, invoice_data: Dict[str, Any]) -> bool:
        """Determine if PII should be stripped before LLM call.
        
        Args:
            invoice_data: Invoice data dict
        
        Returns:
            True if PII should be stripped
        """
        # Check if PII detection is enabled
        pii_detection_enabled = os.getenv("PII_DETECTION_ENABLED", "true").lower() == "true"
        return pii_detection_enabled
    
    def compute_file_hash(self, file_path: Path) -> str:
        """Compute SHA256 hash of file."""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def compute_file_hash_from_bytes(self, content: bytes) -> str:
        """Compute SHA256 hash from bytes."""
        return hashlib.sha256(content).hexdigest()


def get_safety_guard() -> SafetyGuard:
    """Get singleton safety guard instance."""
    if not hasattr(get_safety_guard, '_instance'):
        get_safety_guard._instance = SafetyGuard()
    return get_safety_guard._instance

