"""OCR engine wrappers for EasyOCR and Tesseract."""
import easyocr
import pytesseract
import numpy as np
from typing import List, Tuple, Optional
from pathlib import Path
import cv2
import os
from app.models import OCRBlock


class OCREngine:
    """Unified OCR engine wrapper."""
    
    def __init__(self, use_easyocr: bool = True, use_tesseract: bool = True):
        """Initialize OCR engines.
        
        Args:
            use_easyocr: Whether to use EasyOCR
            use_tesseract: Whether to use Tesseract
        """
        self.easyocr_reader = None
        self.use_easyocr = use_easyocr
        self.use_tesseract = use_tesseract
        
        if use_easyocr:
            try:
                # Try to fix SSL context for EasyOCR model download
                try:
                    import certifi
                    os.environ['SSL_CERT_FILE'] = certifi.where()
                except ImportError:
                    pass
                
                # Initialize EasyOCR (English only for speed)
                # Suppress verbose output during initialization
                import sys
                import contextlib
                
                @contextlib.contextmanager
                def suppress_stderr():
                    with open(os.devnull, 'w') as devnull:
                        old_stderr = sys.stderr
                        sys.stderr = devnull
                        try:
                            yield
                        finally:
                            sys.stderr = old_stderr
                
                # Try to initialize EasyOCR (may take time to download models)
                # Note: This may take a while on first run as it downloads models
                # We suppress stderr to hide "Downloading detection model" messages
                with suppress_stderr():
                    self.easyocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
            except Exception as e:
                # Suppress SSL certificate warnings - Tesseract will be used as fallback
                error_str = str(e).lower()
                if 'ssl' not in error_str and 'certificate' not in error_str:
                    # Only show non-SSL errors
                    pass  # Silent fail - Tesseract will handle OCR
                self.use_easyocr = False
        
        if use_tesseract:
            try:
                # Test Tesseract availability
                pytesseract.get_tesseract_version()
            except Exception as e:
                # Suppress warning if Tesseract is actually installed (just path issue)
                if 'not installed' not in str(e).lower():
                    pass  # Silent fail
                self.use_tesseract = False
    
    def easyocr_extract(self, image: np.ndarray) -> List[OCRBlock]:
        """Extract text using EasyOCR with optimized settings.
        
        Args:
            image: Input image as numpy array
        
        Returns:
            List of OCRBlock objects
        """
        if not self.use_easyocr or self.easyocr_reader is None:
            return []
        
        try:
            # Optimized settings for speed and accuracy
            # paragraph=False: faster, width_ths/height_ths: less strict grouping
            # batch_size=1: process one at a time (faster for single images)
            results = self.easyocr_reader.readtext(
                image,
                paragraph=False,  # Faster processing
                width_ths=0.7,  # Slightly more strict for better grouping
                height_ths=0.7,  # Slightly more strict for better grouping
                detail=1,  # Get bounding boxes
                allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,/-: $€£₹',  # Include currency symbols
                batch_size=1  # Process one at a time for speed
            )
            blocks = []
            
            for result in results:
                try:
                    if len(result) >= 3:
                        bbox, text, confidence = result[0], result[1], result[2]
                        # Convert bbox to [x1, y1, x2, y2] format
                        if bbox and len(bbox) > 0:
                            x_coords = [point[0] for point in bbox]
                            y_coords = [point[1] for point in bbox]
                            x1, x2 = min(x_coords), max(x_coords)
                            y1, y2 = min(y_coords), max(y_coords)
                            
                            text_clean = text.strip()
                            if text_clean and confidence > 0.1:  # Filter very low confidence
                                blocks.append(OCRBlock(
                                    text=text_clean,
                                    bbox=[float(x1), float(y1), float(x2), float(y2)],
                                    confidence=float(confidence),
                                    engine="easyocr"
                                ))
                except Exception:
                    continue  # Skip malformed results
            
            return blocks
        except Exception as e:
            # Suppress specific error messages
            error_str = str(e).lower()
            if 'antialias' not in error_str and 'pil' not in error_str:
                pass  # Silent fail for other errors
            return []
    
    def tesseract_extract(self, image: np.ndarray) -> List[OCRBlock]:
        """Extract text using Tesseract with optimized settings.
        
        Args:
            image: Input image as numpy array
        
        Returns:
            List of OCRBlock objects
        """
        if not self.use_tesseract:
            return []
        
        try:
            # Use optimized config for better accuracy
            # PSM 6: Assume uniform block of text (good for invoices)
            # OEM 3: Default OCR engine (fastest)
            # Remove whitelist to capture all characters (including colons, etc.)
            config = r'--oem 3 --psm 6'
            
            data = pytesseract.image_to_data(
                image, 
                output_type=pytesseract.Output.DICT,
                config=config
            )
            
            blocks = []
            n_boxes = len(data['text'])
            seen_positions = set()
            
            for i in range(n_boxes):
                text = data['text'][i].strip()
                conf = float(data['conf'][i])
                
                # Skip empty text or very low confidence (lowered threshold to capture more)
                if not text or conf < 15:  # Tesseract uses 0-100, lowered to capture more text
                    continue
                
                # Normalize confidence (Tesseract uses 0-100)
                conf_normalized = conf / 100.0
                
                x = int(data['left'][i])
                y = int(data['top'][i])
                w = int(data['width'][i])
                h = int(data['height'][i])
                
                # Quick duplicate check using position
                pos_key = (x // 10, y // 10)  # Grid-based
                if pos_key in seen_positions:
                    continue
                seen_positions.add(pos_key)
                
                blocks.append(OCRBlock(
                    text=text,
                    bbox=[float(x), float(y), float(x + w), float(y + h)],
                    confidence=conf_normalized,
                    engine="tesseract"
                ))
            
            return blocks
        except Exception as e:
            # Silent fail
            return []
    
    def merge_ocr_results(self, easyocr_blocks: List[OCRBlock], 
                         tesseract_blocks: List[OCRBlock]) -> List[OCRBlock]:
        """Merge OCR results from multiple engines, preferring higher confidence.
        
        Args:
            easyocr_blocks: Results from EasyOCR
            tesseract_blocks: Results from Tesseract
        
        Returns:
            Merged list of OCRBlock objects
        """
        # Simple merge: prefer EasyOCR, fallback to Tesseract for missing areas
        merged = {}
        
        # Add EasyOCR results
        for block in easyocr_blocks:
            key = (int(block.bbox[0] // 10), int(block.bbox[1] // 10))  # Grid-based key
            if key not in merged or block.confidence > merged[key].confidence:
                merged[key] = block
        
        # Add Tesseract results where EasyOCR didn't cover
        for block in tesseract_blocks:
            key = (int(block.bbox[0] // 10), int(block.bbox[1] // 10))
            if key not in merged:
                merged[key] = block
        
        # Sort by position (top to bottom, left to right)
        sorted_blocks = sorted(merged.values(), key=lambda b: (b.bbox[1], b.bbox[0]))
        
        return sorted_blocks
    
    def extract(self, image: np.ndarray, prefer_tesseract: bool = True) -> List[OCRBlock]:
        """Extract text from image using available OCR engines with smart merging.
        
        Args:
            image: Input image as numpy array
            prefer_tesseract: If True, use Tesseract first (faster), else EasyOCR
        
        Returns:
            List of OCRBlock objects
        """
        # Strategy: Prefer Tesseract (faster), fallback to EasyOCR if needed
        tesseract_blocks = []
        easyocr_blocks = []
        
        if self.use_tesseract:
            tesseract_blocks = self.tesseract_extract(image)
            # If Tesseract found good results (>= 20 blocks), use it
            if len(tesseract_blocks) >= 20:
                return tesseract_blocks
        
        # If Tesseract didn't find enough, try EasyOCR
        if self.use_easyocr and len(tesseract_blocks) < 20:
            easyocr_blocks = self.easyocr_extract(image)
        
        # Merge results if both available
        if tesseract_blocks and easyocr_blocks:
            return self.merge_ocr_results(easyocr_blocks, tesseract_blocks)
        elif tesseract_blocks:
            return tesseract_blocks
        elif easyocr_blocks:
            return easyocr_blocks
        else:
            return []

