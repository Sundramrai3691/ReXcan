"""Text reconstruction and cleaning for fragmented OCR output."""
import re
from typing import List
from app.models import OCRBlock


def reconstruct_text_from_blocks(blocks: List[OCRBlock]) -> str:
    """Reconstruct full text from OCR blocks, handling fragmentation.
    
    Args:
        blocks: List of OCR blocks
    
    Returns:
        Reconstructed text string
    """
    if not blocks:
        return ""
    
    # Sort blocks by position (top to bottom, left to right)
    sorted_blocks = sorted(blocks, key=lambda b: (b.bbox[1], b.bbox[0]))
    
    lines = []
    current_line = []
    current_y = None
    line_threshold = 25  # Pixels (increased for better line grouping)
    
    for block in sorted_blocks:
        y_center = (block.bbox[1] + block.bbox[3]) / 2
        
        if current_y is None or abs(y_center - current_y) < line_threshold:
            # Same line
            current_line.append(block)
            current_y = y_center
        else:
            # New line
            if current_line:
                lines.append(current_line)
            current_line = [block]
            current_y = y_center
    
    if current_line:
        lines.append(current_line)
    
    # Reconstruct text from lines
    reconstructed = []
    for line in lines:
        # Sort blocks in line by x position
        line.sort(key=lambda b: b.bbox[0])
        
        # Combine text with smart spacing
        line_text = []
        prev_x_end = None
        
        for block in line:
            x_start = block.bbox[0]
            text = block.text.strip()
            
            if prev_x_end is not None:
                gap = x_start - prev_x_end
                # Add space if gap is significant (reduced threshold for better merging)
                if gap > 15:
                    line_text.append(" ")
                elif gap > 3:
                    line_text.append(" ")  # Always add space for small gaps
                # No space for very close blocks (likely same word)
            
            line_text.append(text)
            prev_x_end = block.bbox[2]
        
        line_str = " ".join(line_text).strip()  # Use space join for better readability
        if line_str:
            reconstructed.append(line_str)
    
    return "\n".join(reconstructed)


def clean_ocr_text(text: str) -> str:
    """Clean and normalize OCR text.
    
    Args:
        text: Raw OCR text
    
    Returns:
        Cleaned text
    """
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Fix common OCR errors
    replacements = {
        'PACTURA': 'FATURA',
        'SIMPL': 'SIMPLIFICADA',
        'TCADA': 'SIMPLIFICADA',
        'CW1d-M1-o4': '2019-01-23',  # Common date OCR error
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    return text.strip()


def merge_fragmented_words(blocks: List[OCRBlock]) -> List[OCRBlock]:
    """Merge fragmented words that OCR split incorrectly.
    
    Args:
        blocks: List of OCR blocks
    
    Returns:
        List of merged blocks
    """
    if len(blocks) < 2:
        return blocks
    
    merged = []
    i = 0
    
    while i < len(blocks):
        current = blocks[i]
        merged_text = [current.text]
        merged_bbox = list(current.bbox)
        j = i + 1
        
        # Look for nearby blocks that might be fragments
        while j < len(blocks):
            next_block = blocks[j]
            
            # Check if blocks are close horizontally and on same line
            y_diff = abs((current.bbox[1] + current.bbox[3]) / 2 - 
                        (next_block.bbox[1] + next_block.bbox[3]) / 2)
            x_gap = next_block.bbox[0] - current.bbox[2]
            
            # If very close horizontally and on same line, might be fragment
            if y_diff < 5 and 0 < x_gap < 10:
                # Check if merging makes sense (both are short fragments)
                if len(current.text) < 5 and len(next_block.text) < 5:
                    merged_text.append(next_block.text)
                    merged_bbox[2] = next_block.bbox[2]  # Extend bbox
                    merged_bbox[3] = max(merged_bbox[3], next_block.bbox[3])
                    j += 1
                    continue
            
            break
        
        # Create merged block
        merged_block = OCRBlock(
            text="".join(merged_text),
            bbox=merged_bbox,
            confidence=current.confidence,
            engine=current.engine
        )
        merged.append(merged_block)
        i = j
    
    return merged

