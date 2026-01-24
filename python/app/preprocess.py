"""Image preprocessing for OCR."""
import cv2
import numpy as np
from PIL import Image
from typing import List, Tuple
import pdf2image
from pathlib import Path
import warnings

# Suppress PIL decompression bomb warning for large PDFs
Image.MAX_IMAGE_PIXELS = None  # Disable decompression bomb check
warnings.filterwarnings('ignore', category=Image.DecompressionBombWarning)


def pdf_to_images(pdf_path: Path, dpi: int = 150) -> List[np.ndarray]:
    """Convert PDF to images using pdf2image.
    
    Args:
        pdf_path: Path to PDF file
        dpi: Resolution for conversion (default 200 for quality)
    
    Returns:
        List of numpy arrays (images)
    """
    try:
        # Use thread_count=1 for faster processing on single page PDFs
        images = pdf2image.convert_from_path(
            str(pdf_path), 
            dpi=dpi,
            thread_count=1,
            first_page=None,
            last_page=None
        )
        return [np.array(img) for img in images]
    except Exception as e:
        raise ValueError(f"Failed to convert PDF to images: {e}")


def deskew(image: np.ndarray) -> np.ndarray:
    """Deskew image using Hough transform.
    
    Args:
        image: Input image as numpy array
    
    Returns:
        Deskewed image
    """
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        # Apply edge detection
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        
        # Detect lines
        lines = cv2.HoughLines(edges, 1, np.pi / 180, 200)
        
        if lines is None or len(lines) == 0:
            return image
        
        # Calculate angle
        angles = []
        for line in lines[:20]:  # Use first 20 lines
            if line is not None and len(line) > 0:
                # Handle both formats: line can be [[rho, theta]] or [rho, theta]
                if isinstance(line[0], (list, np.ndarray)):
                    rho, theta = line[0]
                else:
                    rho, theta = line
                angle = (theta * 180 / np.pi) - 90
                if abs(angle) < 45:  # Only consider reasonable angles
                    angles.append(angle)
        
        if not angles:
            return image
        
        # Get median angle
        angle = np.median(angles)
        
        # Rotate image
        if abs(angle) > 0.1:  # Only rotate if significant skew
            (h, w) = image.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, 
                                     borderMode=cv2.BORDER_REPLICATE)
            return rotated
    except Exception:
        # If deskewing fails, return original image
        pass
    
    return image


def denoise(image: np.ndarray) -> np.ndarray:
    """Denoise image using non-local means.
    
    Args:
        image: Input image as numpy array
    
    Returns:
        Denoised image
    """
    if len(image.shape) == 3:
        return cv2.fastNlMeansDenoisingColored(image, None, 10, 10, 7, 21)
    else:
        return cv2.fastNlMeansDenoising(image, None, 10, 7, 21)


def binarize(image: np.ndarray, method: str = "adaptive") -> np.ndarray:
    """Binarize image (convert to black and white).
    
    Args:
        image: Input image as numpy array
        method: 'adaptive' or 'otsu'
    
    Returns:
        Binarized image (0-255, single channel)
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    
    if method == "adaptive":
        # Adaptive thresholding
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
    else:
        # Otsu's method
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    return binary


def preprocess_image(image: np.ndarray, 
                    mode: str = "fast") -> np.ndarray:
    """Full preprocessing pipeline with optimized modes.
    
    Args:
        image: Input image as numpy array
        mode: 'fast' (minimal), 'balanced' (moderate), 'heavy' (best quality)
    
    Returns:
        Preprocessed image
    """
    processed = image.copy()
    
    # Always convert to grayscale (fast operation)
    if len(processed.shape) == 3:
        processed = cv2.cvtColor(processed, cv2.COLOR_RGB2GRAY)
    
    if mode == "fast":
        # Minimal preprocessing: just grayscale
        return processed
    
    elif mode == "balanced":
        # Moderate: denoise + adaptive threshold
        processed = denoise(processed)
        processed = binarize(processed, method="adaptive")
        return processed
    
    elif mode == "heavy":
        # Heavy preprocessing: all steps for best quality
        processed = denoise(processed)
        processed = deskew(processed)
        processed = binarize(processed, method="adaptive")
        # Additional: morphological operations for text clarity
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        processed = cv2.morphologyEx(processed, cv2.MORPH_CLOSE, kernel)
        return processed
    
    return processed

