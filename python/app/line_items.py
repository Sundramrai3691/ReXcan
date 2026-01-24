"""Line item / table extraction from invoices."""
import re
from typing import List, Optional, Tuple, Dict, Any
from app.models import OCRBlock, LineItem
from app.utils import normalize_text, parse_amount_str


def detect_table_region(blocks: List[OCRBlock]) -> Optional[Tuple[float, float, float, float]]:
    """Detect table region in invoice (area with line items).
    
    Args:
        blocks: OCR blocks
    
    Returns:
        (x0, y0, x1, y1) bounding box of table region, or None
    """
    # Look for table indicators: "Item", "Description", "Qty", "Price", "Amount"
    table_keywords = [
        "item", "description", "qty", "quantity", "price", "unit", "amount", "total",
        "product", "service", "line", "charge"
    ]
    
    header_blocks = []
    for block in blocks:
        text_lower = normalize_text(block.text).lower()
        if any(keyword in text_lower for keyword in table_keywords):
            header_blocks.append(block)
    
    if not header_blocks:
        return None
    
    # Find bounding box of header region
    x0 = min(b.bbox[0] for b in header_blocks)
    y0 = min(b.bbox[1] for b in header_blocks)
    x1 = max(b.bbox[2] for b in header_blocks)
    y1 = max(b.bbox[3] for b in header_blocks)
    
    # Extend downward to include potential table rows
    page_height = max(b.bbox[3] for b in blocks) if blocks else 1000
    y1 = min(y1 + (page_height * 0.5), page_height)  # Extend 50% of page height
    
    return (x0, y0, x1, y1)


def extract_line_items(blocks: List[OCRBlock], 
                      table_region: Optional[Tuple[float, float, float, float]] = None) -> List[LineItem]:
    """Extract line items from invoice.
    
    Args:
        blocks: OCR blocks
        table_region: Optional table region bounding box
    
    Returns:
        List of LineItem objects
    """
    line_items = []
    
    # Filter blocks to table region if provided
    if table_region:
        x0, y0, x1, y1 = table_region
        table_blocks = [
            b for b in blocks
            if (x0 <= b.bbox[0] <= x1 or x0 <= b.bbox[2] <= x1) and
               (y0 <= b.bbox[1] <= y1 or y0 <= b.bbox[3] <= y1)
        ]
    else:
        table_blocks = blocks
    
    # Group blocks by row (similar Y coordinates)
    rows = []
    current_row = []
    current_y = None
    row_threshold = 20  # pixels
    
    sorted_blocks = sorted(table_blocks, key=lambda b: (b.bbox[1], b.bbox[0]))
    
    for block in sorted_blocks:
        block_y = (block.bbox[1] + block.bbox[3]) / 2
        
        if current_y is None or abs(block_y - current_y) < row_threshold:
            current_row.append(block)
            current_y = block_y
        else:
            if current_row:
                rows.append(current_row)
            current_row = [block]
            current_y = block_y
    
    if current_row:
        rows.append(current_row)
    
    # Extract line items from rows
    for row in rows:
        # Skip header rows
        row_text = " ".join([b.text for b in row]).lower()
        if any(keyword in row_text for keyword in ["item", "description", "qty", "quantity", "price", "amount", "total"]):
            if len(rows) > 3:  # Only skip if it's clearly a header (not the only row)
                continue
        
        # Try to extract: description, quantity, unit_price, total
        description = None
        quantity = None
        unit_price = None
        total = None
        
        # Sort blocks in row by X position
        row_sorted = sorted(row, key=lambda b: b.bbox[0])
        
        # First block is usually description
        if row_sorted:
            description = " ".join([b.text for b in row_sorted[:len(row_sorted)//2]]).strip()
        
        # Last blocks are usually numbers (quantity, price, total)
        numeric_blocks = []
        for block in row_sorted:
            text = normalize_text(block.text)
            # Look for numbers
            if re.search(r'\d+[.,]?\d*', text):
                numeric_blocks.append(block)
        
        # Parse numeric values
        numeric_values = []
        for block in numeric_blocks:
            text = normalize_text(block.text)
            # Extract all numbers
            numbers = re.findall(r'\d+[.,]?\d*', text)
            for num_str in numbers:
                parsed = parse_amount_str(num_str)
                if parsed is not None and parsed > 0:
                    numeric_values.append(parsed)
        
        # Assign numeric values (heuristic: usually qty, unit_price, total)
        if len(numeric_values) >= 3:
            quantity = numeric_values[0]
            unit_price = numeric_values[1]
            total = numeric_values[2]
        elif len(numeric_values) == 2:
            # Could be unit_price and total
            unit_price = numeric_values[0]
            total = numeric_values[1]
        elif len(numeric_values) == 1:
            total = numeric_values[0]
        
        # Filter out invalid line items
        # Skip if description is empty or just whitespace/hyphens
        if not description or not description.strip() or description.strip() in ['-', '--', '---', 'N/A', 'n/a']:
            continue
        
        # Skip common non-item phrases (case-insensitive)
        description_lower = description.lower().strip()
        non_item_phrases = [
            'sales', 'tax', 'subtotal', 'total', 'amount', 'payment', 'terms',
            'many thanks', 'thank you', 'thanks for', 'thanks foryour', 'thanks for your',
            'thanks for your business', 'thank you for your business', 'thanks foryour business',
            'to be received', 'within', 'days',
            'please find', 'cost-breakdown', 'work completed', 'earliest convenience',
            'do not hesitate', 'contact me', 'questions', 'dear', 'ms.', 'mr.',
            'your name', 'sincerely', 'regards', 'best regards',
            'look forward', 'doing business', 'due course', 'custom',
            'find below', 'make payment', 'contact', 'hesitate',
            'for your business', 'for business', 'your business'
        ]
        
        # Check if description matches any non-item phrase
        if any(phrase in description_lower for phrase in non_item_phrases):
            continue
        
        # Skip if description is too short and has no meaningful data
        if len(description.strip()) < 3 and not quantity and not unit_price and not total:
            continue
        
        # Skip if it's clearly not a line item (no numbers at all and description is generic)
        if not quantity and not unit_price and not total:
            # If description doesn't look like an item description, skip it
            if len(description.strip()) < 5 or description_lower in ['sales', 'tax', 'subtotal', 'total']:
                continue
        
        # Only add if we have at least description and some meaningful data
        if description and (quantity or unit_price or total):
            line_items.append(LineItem(
                description=description.strip(),
                quantity=quantity,
                unit_price=unit_price,
                total=total
            ))
    
    return line_items


def extract_line_items_heuristic(blocks: List[OCRBlock]) -> List[LineItem]:
    """Extract line items using heuristic approach.
    
    Args:
        blocks: OCR blocks
    
    Returns:
        List of LineItem objects
    """
    # Detect table region
    table_region = detect_table_region(blocks)
    
    # Extract line items
    line_items = extract_line_items(blocks, table_region)
    
    return line_items

