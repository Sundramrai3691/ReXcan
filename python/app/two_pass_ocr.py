"""Two-pass OCR: fast low-res pass, then high-res if needed."""
import numpy as np
from PIL import Image
import cv2
from typing import List, Tuple, Optional
from pathlib import Path
from app.models import OCRBlock
from app.ocr_engine import OCREngine
from app.preprocess import preprocess_image
from app.text_reconstruction import merge_fragmented_words
from app.utils import timeit


def resize_keep_aspect(image: np.ndarray, max_width: int = 1200) -> np.ndarray:
    """Resize image keeping aspect ratio.
    
    Args:
        image: Input image
        max_width: Maximum width
    
    Returns:
        Resized image
    """
    if len(image.shape) == 3:
        h, w = image.shape[:2]
    else:
        h, w = image.shape
    
    if w <= max_width:
        return image
    
    scale = max_width / w
    new_w = max_width
    new_h = int(h * scale)
    
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)


def two_pass_ocr(image_path: Path, ocr_engine: Optional[OCREngine] = None,
                 fast_pass_threshold: float = 0.85) -> Tuple[List[OCRBlock], float, bool]:
    """Two-pass OCR: fast low-res, then high-res if needed.
    
    Args:
        image_path: Path to image file
        ocr_engine: OCR engine instance
        fast_pass_threshold: Confidence threshold to skip high-res pass
    
    Returns:
        (blocks, total_time, used_fast_pass_only)
    """
    if ocr_engine is None:
        ocr_engine = OCREngine()
    
    total_start = time.time()
    
    # Load image
    img = Image.open(str(image_path))
    img_array = np.array(img)
    
    # Fast pass: downsampled image
    print("    → Fast pass (low-res OCR)...", end="", flush=True)
    img_fast = resize_keep_aspect(img_array, max_width=1200)
    img_fast_processed = preprocess_image(img_fast, mode="fast")  # Just grayscale
    
    fast_blocks, fast_time = timeit("ocr_fast", ocr_engine.extract, img_fast_processed)
    if fast_blocks:
        fast_blocks = merge_fragmented_words(fast_blocks)
    
    print(f" ✓ ({len(fast_blocks)} blocks, {fast_time:.2f}s)")
    
    # For now, return fast pass results
    # TODO: Add heuristics check here to decide if high-res needed
    total_time = time.time() - total_start
    
    return fast_blocks, total_time, True

