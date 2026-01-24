"""Audit logging for manual corrections."""
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List
from app.utils import get_project_root, ensure_dir, load_json, save_json


class AuditLogger:
    """Logger for audit trail of corrections."""
    
    def __init__(self, audit_dir: Path = None):
        """Initialize audit logger.
        
        Args:
            audit_dir: Directory for audit logs
        """
        if audit_dir is None:
            audit_dir = get_project_root() / "data" / "outputs" / "audit"
        
        self.audit_dir = ensure_dir(audit_dir)
    
    def log_correction(self, job_id: str, field_name: str, old_value: Any, 
                      new_value: Any, user_id: str = "system", 
                      reason: str = "manual correction") -> None:
        """Log a manual correction.
        
        Args:
            job_id: Job ID
            field_name: Name of corrected field
            old_value: Original value
            new_value: Corrected value
            user: User who made correction
            reason: Reason for correction
        """
        audit_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "job_id": job_id,
            "field_name": field_name,
            "old_value": old_value,
            "new_value": new_value,
            "user_id": user_id,  # Changed from 'user' to 'user_id' for consistency
            "reason": reason,
            "immutable": True  # Mark as immutable audit trail
        }
        
        # Load existing audit log for this job
        audit_file = self.audit_dir / f"{job_id}_audit.json"
        audit_log = load_json(audit_file)
        
        if "entries" not in audit_log:
            audit_log["entries"] = []
        
        audit_log["entries"].append(audit_entry)
        audit_log["last_updated"] = datetime.utcnow().isoformat()
        
        save_json(audit_file, audit_log)
    
    def get_audit_log(self, job_id: str) -> List[Dict[str, Any]]:
        """Get audit log for a job.
        
        Args:
            job_id: Job ID
        
        Returns:
            List of audit entries
        """
        audit_file = self.audit_dir / f"{job_id}_audit.json"
        audit_log = load_json(audit_file)
        return audit_log.get("entries", [])
    
    def log_processing(self, job_id: str, extract_result: Dict[str, Any], 
                      timings: Dict[str, float]) -> None:
        """Log processing result.
        
        Args:
            job_id: Job ID
            extract_result: Extraction result
            timings: Processing timings
        """
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "job_id": job_id,
            "result": extract_result,
            "timings": timings
        }
        
        log_file = self.audit_dir / f"{job_id}_process.json"
        save_json(log_file, log_entry)

