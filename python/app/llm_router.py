"""LLM router for fallback extraction."""
import os
import json
import time
from pathlib import Path
from typing import Dict, List, Optional, Any
from app.models import OCRBlock
from app.utils import (
    compute_hash, get_cache_path, load_json, save_json,
    compute_text_sha1, timeit
)
from app.retry import retry_llm_call

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed, use system env vars


class LLMRouter:
    """Router for multiple LLM providers."""
    
    def __init__(self):
        """Initialize LLM router with available providers."""
        self.providers = []
        self.cache_enabled = True
        
        # Check for Gemini (preferred - good OCR/vision capabilities via Google Lens)
        if os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"):
            self.providers.append("gemini")
        
        # Check for Groq (fast fallback)
        if os.getenv("GROQ_API_KEY"):
            self.providers.append("groq")
        
        # Check for OpenAI
        if os.getenv("OPENAI_API_KEY"):
            self.providers.append("openai")
        
        # Check for Anthropic
        if os.getenv("ANTHROPIC_API_KEY"):
            self.providers.append("anthropic")
    
    def _get_relevant_blocks(self, blocks: List[OCRBlock], k: int = 10, fields: Optional[List[str]] = None) -> List[OCRBlock]:
        """Get top K most relevant OCR blocks, prioritizing blocks near expected labels.
        
        Args:
            blocks: All OCR blocks
            k: Number of blocks to return
            fields: Optional list of fields to extract (for label-based selection)
        
        Returns:
            Top K blocks sorted by relevance
        """
        if not blocks:
            return []
        
        # If fields provided, prioritize blocks near labels
        if fields:
            label_keywords = {
                'invoice_id': ['invoice', 'inv', 'number', 'no', '#'],
                'invoice_date': ['date', 'issued', 'invoice date'],
                'total_amount': ['total', 'amount', 'due', 'balance'],
                'vendor_name': ['from', 'seller', 'vendor', 'company'],
            }
            
            # Score blocks by proximity to relevant labels
            scored_blocks = []
            for block in blocks:
                score = block.confidence
                text_lower = block.text.lower()
                
                # Boost score if near relevant labels
                for field in fields:
                    keywords = label_keywords.get(field, [])
                    for keyword in keywords:
                        if keyword in text_lower:
                            score += 0.3
                            break
                
                scored_blocks.append((score, block))
            
            # Sort by score
            scored_blocks.sort(key=lambda x: x[0], reverse=True)
            return [b for _, b in scored_blocks[:k]]
        
        # Default: sort by confidence and position (prefer top-left)
        sorted_blocks = sorted(
            blocks,
            key=lambda b: (b.confidence, -b.bbox[1], -b.bbox[0]),
            reverse=True
        )
        return sorted_blocks[:k]
    
    def _build_prompt(self, fields: List[str], blocks: List[OCRBlock]) -> str:
        """Build LLM prompt for extraction with better context.
        
        Args:
            fields: List of field names to extract
            blocks: Relevant OCR blocks
        
        Returns:
            Prompt string
        """
        # Build full text context for better understanding
        full_text = "\n".join([b.text for b in blocks])
        
        # Format OCR blocks with position info
        blocks_json = [
            {
                "text": b.text,
                "bbox": b.bbox,
                "confidence": b.confidence,
                "engine": b.engine
            }
            for b in blocks
        ]
        
        # Build field-specific instructions
        field_instructions = []
        if "invoice_id" in fields:
            field_instructions.append("invoice_id: Look for 'Invoice no:', 'Invoice number', 'Invoice #' followed by a number (often 7-12 digits). Can be pure numeric like '40378170' or alphanumeric like 'INV-123'.")
        if "total_amount" in fields:
            field_instructions.append("total_amount: Look for 'Total', 'Amount Due', 'Grand Total' followed by a currency symbol and number. Usually in bottom-right area. Exclude invoice numbers.")
        if "invoice_date" in fields:
            field_instructions.append("invoice_date: Look for 'Invoice Date', 'Date of Issue', 'Date' followed by a date in MM/DD/YYYY, YYYY-MM-DD, or similar format.")
        if "vendor_name" in fields:
            field_instructions.append("vendor_name: Look for company name, usually in top-left area. May have suffixes like 'Ltd', 'Inc', 'LLC'.")
        if "amount_tax" in fields:
            field_instructions.append("amount_tax: Look for 'Tax', 'Tax (X%)', 'Sales Tax', 'GST', 'VAT' followed by a currency amount. Usually appears after 'Subtotal' and before 'Total'. Extract the numeric amount (e.g., if you see 'Tax (13%): $456.30', extract 456.30).")
        
        instructions_text = "\n".join(field_instructions)
        
        prompt = f"""Extract invoice fields from this OCR text. Focus on accuracy.

Full OCR text:
{full_text}

Detailed OCR blocks with positions:
{json.dumps(blocks_json, indent=2)}

Instructions:
{instructions_text}

IMPORTANT:
- invoice_id: Often appears as "Invoice no: 40378170" or similar. Extract the number/code after the label.
- total_amount: Look for the largest amount near "Total" label, usually in bottom area. Ignore small numbers that might be invoice IDs.
- amount_tax: Look for tax amount near "Tax", "Tax (X%)", "Sales Tax" labels. Usually appears between Subtotal and Total. Extract only the numeric amount (e.g., from "Tax (13%): $456.30" extract 456.30).
- invoice_date: Convert to YYYY-MM-DD format.
- vendor_name: Extract company name, not addresses or contact info.

Return only valid JSON matching this schema:
{{
  "invoice_id": "string or null",
  "vendor_name": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "total_amount": float or null,
  "amount_tax": float or null,
  "currency": "ISO4217 code or null",
  "reasons": {{ "field_name": "1-line reason" }}
}}

Do not output any explanation, only JSON."""
        
        return prompt
    
    def _call_groq(self, prompt: str) -> Optional[Dict[str, Any]]:
        """Call Groq API (Llama3 8B).
        
        Args:
            prompt: Extraction prompt
        
        Returns:
            Extracted fields dict or None
        """
        try:
            from groq import Groq
            
            client = Groq(api_key=os.getenv("GROQ_API_KEY"))
            
            response = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": "You are a strict JSON-only extractor. Return only valid JSON that follows the schema. Do not output any explanation."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            content = response.choices[0].message.content.strip()
            
            # Extract JSON from response
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            # Strict JSON validation
            try:
                parsed = json.loads(content)
                if not isinstance(parsed, dict):
                    raise ValueError("LLM response is not a JSON object")
                return parsed
            except json.JSONDecodeError as e:
                print(f"  ✗ Groq JSON parse error: {e}")
                return None
        except Exception as e:
            print(f"Groq API call failed: {e}")
            return None
    
    def _call_gemini(self, prompt: str) -> Optional[Dict[str, Any]]:
        """Call Google Gemini API.
        
        Args:
            prompt: Extraction prompt
        
        Returns:
            Extracted fields dict or None
        """
        try:
            import google.generativeai as genai
            
            api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            genai.configure(api_key=api_key)
            # Try different model names (API may vary) - prefer flash for speed
            model = None
            for model_name in ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'models/gemini-1.5-flash', 'models/gemini-pro']:
                try:
                    model = genai.GenerativeModel(model_name)
                    break
                except:
                    continue
            if not model:
                raise ValueError("No valid Gemini model found")
            
            response = model.generate_content(
                prompt,
                generation_config={
                    "temperature": 0.1,
                    "max_output_tokens": 500,
                }
            )
            
            content = response.text.strip()
            
            # Extract JSON
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            # Strict JSON validation
            try:
                parsed = json.loads(content)
                # Validate schema: must have expected fields or be empty dict
                if not isinstance(parsed, dict):
                    raise ValueError("LLM response is not a JSON object")
                return parsed
            except json.JSONDecodeError as e:
                print(f"  ✗ Gemini JSON parse error: {e}")
                # Try to extract JSON from text
                import re
                json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content)
                if json_match:
                    try:
                        return json.loads(json_match.group(0))
                    except:
                        pass
                return None
        except Exception as e:
            print(f"Gemini API call failed: {e}")
            return None
    
    def _call_openai(self, prompt: str) -> Optional[Dict[str, Any]]:
        """Call OpenAI API.
        
        Args:
            prompt: Extraction prompt
        
        Returns:
            Extracted fields dict or None
        """
        try:
            from openai import OpenAI
            
            client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a strict JSON-only extractor. Return only valid JSON that follows the schema. Do not output any explanation."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=500,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content.strip()
            # Strict JSON validation
            try:
                parsed = json.loads(content)
                if not isinstance(parsed, dict):
                    raise ValueError("LLM response is not a JSON object")
                return parsed
            except json.JSONDecodeError as e:
                print(f"  ✗ OpenAI JSON parse error: {e}")
                return None
        except Exception as e:
            print(f"OpenAI API call failed: {e}")
            return None
    
    def _call_anthropic(self, prompt: str) -> Optional[Dict[str, Any]]:
        """Call Anthropic Claude API.
        
        Args:
            prompt: Extraction prompt
        
        Returns:
            Extracted fields dict or None
        """
        try:
            from anthropic import Anthropic
            
            client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            
            response = client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=500,
                temperature=0.1,
                system="You are a strict JSON-only extractor. Return only valid JSON that follows the schema. Do not output any explanation.",
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            
            content = response.content[0].text.strip()
            
            # Extract JSON
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            # Strict JSON validation
            try:
                parsed = json.loads(content)
                if not isinstance(parsed, dict):
                    raise ValueError("LLM response is not a JSON object")
                return parsed
            except json.JSONDecodeError as e:
                print(f"  ✗ Anthropic JSON parse error: {e}")
                return None
        except Exception as e:
            print(f"Anthropic API call failed: {e}")
            return None
    
    def extract_fields(self, fields: List[str], blocks: List[OCRBlock], 
                      pdf_path: Optional[Path] = None, timeout: float = 8.0) -> Optional[Dict[str, Any]]:
        """Extract fields using LLM fallback with batching and timeout.
        
        Args:
            fields: List of field names to extract (batched in single call)
            blocks: OCR blocks (can be empty for direct image extraction)
            pdf_path: Optional PDF path for direct image extraction if OCR failed
            timeout: Timeout in seconds (default 8s)
        
        Returns:
            Extracted fields dict or None
        """
        # If we have very few blocks, try direct image extraction
        if len(blocks) < 10 and pdf_path:
            return self._extract_from_image_direct(fields, pdf_path, timeout)
        
        # Get relevant blocks (top K=10, prioritized by fields)
        relevant_blocks = self._get_relevant_blocks(blocks, k=10, fields=fields) if blocks else []
        
        # Build context text for caching
        context_text = "\n".join([b.text for b in relevant_blocks[:10]])
        context_text += f"|fields:{','.join(sorted(fields))}"
        
        # Check cache using context hash
        if self.cache_enabled:
            cache_key = compute_text_sha1(context_text)
            cache_path = get_cache_path("llm", cache_key)
            cached = load_json(cache_path)
            if cached and 'result' in cached:
                print(f"  → Using cached LLM result")
                return cached.get("result")
        
        # Build prompt (batched - all fields in one call)
        prompt = self._build_prompt(fields, relevant_blocks)
        
        # Try providers in order with timeout
        result = None
        provider_used = None
        
        for provider in self.providers:
            try:
                # Use timeout wrapper with retry logic
                def call_provider():
                    if provider == "groq":
                        return retry_llm_call(self._call_groq, prompt, max_retries=2)
                    elif provider == "gemini":
                        return retry_llm_call(self._call_gemini, prompt, max_retries=2)
                    elif provider == "openai":
                        return retry_llm_call(self._call_openai, prompt, max_retries=2)
                    elif provider == "anthropic":
                        return retry_llm_call(self._call_anthropic, prompt, max_retries=2)
                    return None
                
                # Call with timeout
                result, elapsed = timeit(f"llm_{provider}", call_provider)
                
                if result:
                    provider_used = provider
                    if elapsed > timeout:
                        print(f"  ⚠️  LLM ({provider}) slow: {elapsed:.1f}s (timeout: {timeout}s)")
                    else:
                        print(f"  ✓ LLM ({provider}): {elapsed:.1f}s")
                    break
            except TimeoutError:
                print(f"  ✗ LLM ({provider}) timeout after {timeout}s")
                continue
            except Exception as e:
                print(f"  ✗ LLM ({provider}) failed: {str(e)[:50]}")
                continue
        
        # Cache result
        if result and self.cache_enabled:
            cache_key = compute_text_sha1(context_text)
            cache_path = get_cache_path("llm", cache_key)
            save_json(cache_path, {
                "result": result,
                "provider": provider_used,
                "fields": fields,
                "timestamp": time.time()
            })
        
        return result
    
    def _extract_from_image_direct(self, fields: List[str], pdf_path: Path, timeout: float = 8.0) -> Optional[Dict[str, Any]]:
        """Extract directly from PDF/image when OCR fails or is incomplete.
        
        Args:
            fields: List of field names to extract
            pdf_path: Path to PDF or image file
        
        Returns:
            Extracted fields dict or None
        """
        try:
            from PIL import Image
            import numpy as np
            
            # Check if it's already an image
            file_ext = pdf_path.suffix.lower()
            is_image = file_ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp']
            
            if is_image:
                # Load image directly
                img = Image.open(str(pdf_path))
                img_array = np.array(img)
                images = [img_array]
            else:
                # Convert first page to image
                from app.preprocess import pdf_to_images
                images = pdf_to_images(pdf_path, dpi=200)  # Higher DPI for better quality
            
            if not images:
                return None
            
            # Encode image to base64 for LLM
            import base64
            import cv2
            from io import BytesIO
            from PIL import Image
            
            # Convert numpy array to PIL Image
            img_array = images[0]
            if len(img_array.shape) == 3:
                img_pil = Image.fromarray(img_array)
            else:
                img_pil = Image.fromarray(img_array, mode='L').convert('RGB')
            
            # Convert to base64
            buffered = BytesIO()
            img_pil.save(buffered, format="JPEG", quality=85)
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            
            # Build enhanced prompt for image extraction
            field_instructions = []
            if "invoice_id" in fields:
                field_instructions.append("invoice_id: Look for 'Invoice no:', 'Invoice number', 'Invoice #' followed by a number (often 7-12 digits like '40378170'). Can be pure numeric or alphanumeric.")
            if "total_amount" in fields:
                field_instructions.append("total_amount: Look for 'Total', 'Amount Due', 'Grand Total' followed by a currency symbol and number. Usually in bottom-right area. Exclude invoice numbers.")
            if "invoice_date" in fields:
                field_instructions.append("invoice_date: Look for 'Invoice Date', 'Date of Issue', 'Date' followed by a date. Convert to YYYY-MM-DD format.")
            if "vendor_name" in fields:
                field_instructions.append("vendor_name: Look for company name, usually in top-left area.")
            
            instructions_text = "\n".join(field_instructions)
            
            prompt = f"""Extract invoice fields from this invoice image. Be very careful and accurate.

Fields to extract: {', '.join(fields)}

Instructions:
{instructions_text}

IMPORTANT:
- invoice_id: Often appears as "Invoice no: 40378170" or similar. Extract the number/code after the label. Look carefully in the top area.
- total_amount: Look for the largest amount near "Total" label, usually in bottom area. Ignore small numbers that might be invoice IDs.
- amount_tax: Look for tax amount near "Tax", "Tax (X%)", "Sales Tax" labels. Usually appears between Subtotal and Total. Extract only the numeric amount (e.g., from "Tax (13%): $456.30" extract 456.30).
- invoice_date: Convert to YYYY-MM-DD format.
- vendor_name: Extract company name, not addresses or contact info.

Return only valid JSON matching this schema:
{{
  "invoice_id": "string or null",
  "vendor_name": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "total_amount": float or null,
  "amount_tax": float or null,
  "currency": "ISO4217 code or null",
  "reasons": {{ "field_name": "1-line reason" }}
}}

Do not output any explanation, only JSON."""
            
            # Try Gemini first (best OCR/vision capabilities via Google Lens)
            if "gemini" in self.providers:
                try:
                    import google.generativeai as genai
                    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
                    genai.configure(api_key=api_key)
                    model = genai.GenerativeModel('gemini-1.5-flash')
                    
                    # Gemini can handle images
                    response = model.generate_content([
                        prompt,
                        {"mime_type": "image/jpeg", "data": base64.b64decode(img_base64)}
                    ])
                    
                    content = response.text.strip()
                    # Extract JSON
                    if content.startswith("```json"):
                        content = content[7:]
                    if content.startswith("```"):
                        content = content[3:]
                    if content.endswith("```"):
                        content = content[:-3]
                    content = content.strip()
                    
                    # Strict JSON validation
                    try:
                        parsed = json.loads(content)
                        if not isinstance(parsed, dict):
                            raise ValueError("LLM response is not a JSON object")
                        return parsed
                    except json.JSONDecodeError as e:
                        print(f"  ✗ Gemini image JSON parse error: {e}")
                        # Try to extract JSON from text
                        import re
                        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content)
                        if json_match:
                            try:
                                return json.loads(json_match.group(0))
                            except:
                                pass
                        return None
                except Exception as e:
                    print(f"  ✗ Gemini image extraction failed: {e}")
            
            # Try Groq as fallback (fast but may not support images directly)
            if "groq" in self.providers:
                try:
                    from groq import Groq
                    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
                    # Note: Groq may not support images directly, fallback to text-only
                    result = self._call_groq(prompt)
                    if result:
                        return result
                except:
                    pass
            
            return None
        except Exception as e:
            print(f"  ✗ Direct image extraction failed: {e}")
            return None

