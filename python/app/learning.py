"""Learning-from-Edits: Capture corrections and generate heuristics/rules."""
import json
import os
import re
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime
from app.utils import get_project_root, ensure_dir, load_json, save_json


class EditLearner:
    """Learns from manual corrections to improve heuristics."""
    
    def __init__(self, patches_file: Optional[Path] = None, gold_dir: Optional[Path] = None):
        """Initialize edit learner.
        
        Args:
            patches_file: Path to heuristics patches JSON file
            gold_dir: Directory for gold dataset samples
        """
        if patches_file is None:
            patches_file = get_project_root() / "data" / "heuristics" / "patches.json"
        if gold_dir is None:
            gold_dir = get_project_root() / "data" / "gold"
        
        self.patches_file = patches_file
        self.gold_dir = ensure_dir(gold_dir)
        self.patches_dir = patches_file.parent
        ensure_dir(self.patches_dir)
    
    def capture_edit(self, job_id: str, field_name: str, old_value: Any, 
                    new_value: Any, user_id: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Capture an edit event and generate learning artifacts.
        
        Args:
            job_id: Job ID
            field_name: Field that was corrected
            old_value: Original value
            new_value: Corrected value
            user_id: User who made correction
            context: Additional context (OCR blocks, invoice data, etc.)
        
        Returns:
            Dict with learning artifacts created
        """
        artifacts = {
            "vendor_alias_created": False,
            "heuristic_rule_created": False,
            "gold_sample_created": False
        }
        
        # 1. Vendor alias (if vendor_name was corrected)
        if field_name == "vendor_name" and new_value:
            artifacts["vendor_alias_created"] = self._create_vendor_alias(
                old_value, new_value, user_id
            )
        
        # 2. Heuristic rule snippet
        if old_value and new_value:
            rule = self._generate_heuristic_rule(
                field_name, old_value, new_value, context
            )
            if rule:
                artifacts["heuristic_rule_created"] = self._append_heuristic_patch(rule)
        
        # 3. Gold sample (optional, for offline retraining)
        # This can be enabled via feature flag
        if os.getenv("LEARNING_CREATE_GOLD_SAMPLES", "false").lower() == "true":
            artifacts["gold_sample_created"] = self._create_gold_sample(
                job_id, field_name, old_value, new_value, context
            )
        
        return artifacts
    
    def _create_vendor_alias(self, old_value: str, new_value: str, user_id: str) -> bool:
        """Create vendor alias entry (triggers vendor promotion).
        
        Args:
            old_value: Original vendor name
            new_value: Corrected vendor name
            user_id: User who made correction
        
        Returns:
            True if alias was created
        """
        try:
            # Import here to avoid circular dependency
            from app.canonicalize import VendorCanonicalizer
            from app.utils import get_project_root
            
            vendors_path = get_project_root() / "data" / "vendors.csv"
            canonicalizer = VendorCanonicalizer(vendors_path)
            
            # Promote the corrected vendor name
            # This will add it to vendors.csv if not exists
            canonical_id, canonical_name, confidence, reason = canonicalizer.canonicalize(new_value)
            
            # If old value exists, add it as an alias
            if old_value and old_value.strip():
                # Load vendors CSV and add old_value as alias
                import csv
                vendors = []
                vendor_found = False
                
                if vendors_path.exists():
                    with open(vendors_path, 'r', encoding='utf-8') as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            if row.get('canonical_id') == canonical_id:
                                # Add old_value to aliases
                                aliases = [a.strip() for a in row.get('aliases', '').split('|') if a.strip()]
                                if old_value not in aliases:
                                    aliases.append(old_value)
                                row['aliases'] = '|'.join(aliases)
                                vendor_found = True
                            vendors.append(row)
                
                # If vendor not found, create new entry
                if not vendor_found:
                    vendors.append({
                        'canonical_id': canonical_id or self._generate_canonical_id(new_value),
                        'name': new_value,
                        'aliases': old_value,
                        'tax_id': ''
                    })
                else:
                    # Write back
                    with open(vendors_path, 'w', encoding='utf-8', newline='') as f:
                        writer = csv.DictWriter(f, fieldnames=['canonical_id', 'name', 'aliases', 'tax_id'])
                        writer.writeheader()
                        writer.writerows(vendors)
                
                # Reload canonicalizer
                canonicalizer.load_vendors(vendors_path)
                return True
            
            return False
        except Exception as e:
            print(f"  ⚠️  Failed to create vendor alias: {e}")
            return False
    
    def _generate_canonical_id(self, vendor_name: str) -> str:
        """Generate canonical ID from vendor name."""
        import re
        canonical_id = re.sub(r'[^a-z0-9]', '_', vendor_name.lower().strip())
        canonical_id = re.sub(r'_+', '_', canonical_id).strip('_')
        return canonical_id
    
    def _generate_heuristic_rule(self, field_name: str, old_value: Any, 
                                 new_value: Any, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate a heuristic rule snippet from correction.
        
        Args:
            field_name: Field that was corrected
            old_value: Original value
            new_value: Corrected value
            context: Context (OCR blocks, invoice data, etc.)
        
        Returns:
            Rule dict or None
        """
        rule = {
            "field": field_name,
            "pattern": None,
            "condition": None,
            "action": f"prefer '{new_value}'",
            "created_at": datetime.utcnow().isoformat(),
            "confidence": 0.7,  # Medium confidence (needs validation)
            "source": "manual_correction"
        }
        
        # Extract pattern from context if available
        ocr_blocks = context.get("ocr_blocks", [])
        invoice_data = context.get("invoice_data", {})
        
        # For invoice_id: extract pattern
        if field_name == "invoice_id" and isinstance(new_value, str):
            # Look for pattern in OCR blocks near where old_value was found
            pattern = self._extract_pattern_from_blocks(ocr_blocks, old_value, new_value)
            if pattern:
                rule["pattern"] = pattern
                rule["condition"] = f"If pattern '{pattern}' found near top-right or after 'Invoice' label"
        
        # For total_amount: extract amount pattern
        elif field_name == "total_amount":
            if isinstance(new_value, (int, float)):
                # Look for amount patterns
                rule["pattern"] = f"\\b{new_value:.2f}\\b"
                rule["condition"] = "If amount matches corrected value and is near 'Total' label in bottom 40%"
        
        # For vendor_name: extract company name pattern
        elif field_name == "vendor_name" and isinstance(new_value, str):
            # Extract first few words as pattern
            words = new_value.split()[:3]
            if words:
                pattern = " ".join(words)
                rule["pattern"] = pattern
                rule["condition"] = f"If text starts with '{pattern}' in top-left region"
        
        # For invoice_date: extract date pattern
        elif field_name == "invoice_date" and isinstance(new_value, str):
            # Extract date format pattern
            rule["pattern"] = new_value  # ISO format YYYY-MM-DD
            rule["condition"] = f"If date field found, prefer ISO format: {new_value}"
        
        return rule if rule.get("pattern") or rule.get("condition") else None
    
    def _extract_pattern_from_blocks(self, blocks: List[Dict], old_value: str, new_value: str) -> Optional[str]:
        """Extract regex pattern from OCR blocks.
        
        Args:
            blocks: OCR blocks
            old_value: Original value
            new_value: Corrected value
        
        Returns:
            Regex pattern or None
        """
        # Look for blocks containing old_value or new_value
        for block in blocks[:20]:  # Check first 20 blocks
            text = block.get("text", "")
            if old_value in text or new_value in text:
                # Extract pattern (simplified: use new_value as pattern)
                if isinstance(new_value, str) and len(new_value) > 3:
                    # Escape special regex chars
                    pattern = re.escape(new_value)
                    return pattern
        return None
    
    def _append_heuristic_patch(self, rule: Dict[str, Any]) -> bool:
        """Append heuristic rule to patches.json.
        
        Args:
            rule: Rule dict
        
        Returns:
            True if rule was appended
        """
        try:
            # Load existing patches
            patches = []
            if self.patches_file.exists():
                patches = load_json(self.patches_file) or []
            
            # Add new rule
            patches.append(rule)
            
            # Save back
            save_json(self.patches_file, patches)
            return True
        except Exception as e:
            print(f"  ⚠️  Failed to append heuristic patch: {e}")
            return False
    
    def _create_gold_sample(self, job_id: str, field_name: str, old_value: Any, 
                          new_value: Any, context: Dict[str, Any]) -> bool:
        """Create gold sample for offline retraining.
        
        Args:
            job_id: Job ID
            field_name: Field that was corrected
            old_value: Original value
            new_value: Corrected value
            context: Context
        
        Returns:
            True if sample was created
        """
        try:
            sample = {
                "job_id": job_id,
                "field": field_name,
                "ground_truth": new_value,
                "extracted": old_value,
                "ocr_blocks": context.get("ocr_blocks", [])[:50],  # Limit to 50 blocks
                "invoice_data": context.get("invoice_data", {}),
                "created_at": datetime.utcnow().isoformat(),
                "source": "manual_correction"
            }
            
            # Save to gold directory
            sample_file = self.gold_dir / f"{job_id}_{field_name}_gold.json"
            save_json(sample_file, sample)
            return True
        except Exception as e:
            print(f"  ⚠️  Failed to create gold sample: {e}")
            return False
    
    def get_patches(self) -> List[Dict[str, Any]]:
        """Get all heuristic patches.
        
        Returns:
            List of patch rules
        """
        if self.patches_file.exists():
            return load_json(self.patches_file) or []
        return []
    
    def apply_patches_to_heuristics(self, field_name: str, candidates: List[Any], 
                                   context: Dict[str, Any]) -> Optional[Any]:
        """Apply learned patches to heuristics (for future use).
        
        Args:
            field_name: Field name
            candidates: List of candidate values
            context: Context
        
        Returns:
            Preferred value from patches or None
        """
        patches = self.get_patches()
        relevant_patches = [p for p in patches if p.get("field") == field_name]
        
        for patch in relevant_patches:
            pattern = patch.get("pattern")
            condition = patch.get("condition")
            
            if pattern and condition:
                # Check if condition matches
                # This is a simplified version - can be enhanced
                ocr_blocks = context.get("ocr_blocks", [])
                for block in ocr_blocks:
                    text = block.get("text", "")
                    if re.search(pattern, text, re.I):
                        # Pattern found, prefer this value
                        action = patch.get("action", "")
                        # Extract value from action or candidates
                        # Simplified: return first candidate that matches pattern
                        for candidate in candidates:
                            if isinstance(candidate, str) and re.search(pattern, candidate, re.I):
                                return candidate
        
        return None


# Global edit learner instance
_edit_learner: Optional[EditLearner] = None


def get_edit_learner() -> EditLearner:
    """Get singleton edit learner instance."""
    global _edit_learner
    if _edit_learner is None:
        _edit_learner = EditLearner()
    return _edit_learner

