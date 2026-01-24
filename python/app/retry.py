"""Retry logic for OCR and LLM calls."""
import time
from typing import Callable, Optional, TypeVar, Any
from functools import wraps

T = TypeVar('T')


def retry_with_backoff(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 10.0,
    exponential_base: float = 2.0,
    exceptions: tuple = (Exception,)
):
    """Retry decorator with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        exponential_base: Base for exponential backoff
        exceptions: Tuple of exceptions to catch and retry
    
    Returns:
        Decorated function
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Optional[T]:
            delay = initial_delay
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_retries:
                        time.sleep(min(delay, max_delay))
                        delay *= exponential_base
                    else:
                        # Last attempt failed, return None or re-raise
                        print(f"  ✗ {func.__name__} failed after {max_retries + 1} attempts: {e}")
                        return None
            
            return None
        return wrapper
    return decorator


def retry_ocr_call(ocr_func: Callable, *args, max_retries: int = 2, **kwargs) -> Optional[Any]:
    """Retry OCR call with exponential backoff.
    
    Args:
        ocr_func: OCR function to call
        *args: Arguments for OCR function
        max_retries: Maximum retry attempts
        **kwargs: Keyword arguments for OCR function
    
    Returns:
        OCR result or None if all retries failed
    """
    delay = 1.0
    last_exception = None
    
    for attempt in range(max_retries + 1):
        try:
            return ocr_func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            if attempt < max_retries:
                print(f"  ⚠️  OCR attempt {attempt + 1} failed, retrying in {delay:.1f}s...")
                time.sleep(delay)
                delay *= 2
            else:
                print(f"  ✗ OCR failed after {max_retries + 1} attempts: {e}")
                return None
    
    return None


def retry_llm_call(llm_func: Callable, *args, max_retries: int = 2, **kwargs) -> Optional[Any]:
    """Retry LLM call with exponential backoff.
    
    Args:
        llm_func: LLM function to call
        *args: Arguments for LLM function
        max_retries: Maximum retry attempts
        **kwargs: Keyword arguments for LLM function
    
    Returns:
        LLM result or None if all retries failed
    """
    delay = 0.5  # Shorter delay for LLM
    last_exception = None
    
    for attempt in range(max_retries + 1):
        try:
            return llm_func(*args, **kwargs)
        except (TimeoutError, ConnectionError, Exception) as e:
            last_exception = e
            if attempt < max_retries:
                print(f"  ⚠️  LLM attempt {attempt + 1} failed, retrying in {delay:.1f}s...")
                time.sleep(delay)
                delay *= 2
            else:
                print(f"  ✗ LLM failed after {max_retries + 1} attempts: {e}")
                return None
    
    return None

