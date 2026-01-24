"""Backpressure and throttling for production workloads."""
import time
from typing import Optional
from collections import deque
from threading import Lock


class RateLimiter:
    """Rate limiter for API calls."""
    
    def __init__(self, max_calls: int = 10, time_window: float = 60.0):
        """Initialize rate limiter.
        
        Args:
            max_calls: Maximum calls allowed
            time_window: Time window in seconds
        """
        self.max_calls = max_calls
        self.time_window = time_window
        self.calls = deque()
        self.lock = Lock()
    
    def acquire(self) -> bool:
        """Try to acquire a call slot.
        
        Returns:
            True if call allowed, False if rate limited
        """
        with self.lock:
            now = time.time()
            # Remove old calls outside time window
            while self.calls and self.calls[0] < now - self.time_window:
                self.calls.popleft()
            
            if len(self.calls) >= self.max_calls:
                return False
            
            self.calls.append(now)
            return True
    
    def wait_time(self) -> float:
        """Get wait time until next call allowed.
        
        Returns:
            Wait time in seconds
        """
        with self.lock:
            if len(self.calls) < self.max_calls:
                return 0.0
            
            oldest_call = self.calls[0]
            wait = self.time_window - (time.time() - oldest_call)
            return max(0.0, wait)


class BackpressureManager:
    """Manages backpressure for OCR and LLM calls."""
    
    def __init__(self):
        """Initialize backpressure manager."""
        # Rate limiters
        self.ocr_limiter = RateLimiter(max_calls=20, time_window=60.0)  # 20 OCR calls per minute
        self.llm_limiter = RateLimiter(max_calls=30, time_window=60.0)  # 30 LLM calls per minute
        self.docai_limiter = RateLimiter(max_calls=10, time_window=60.0)  # 10 Document AI calls per minute
        
        # Queue management
        self.pending_ocr = deque()
        self.pending_llm = deque()
        self.max_queue_size = 100
    
    def can_process_ocr(self) -> tuple[bool, Optional[float]]:
        """Check if OCR can be processed.
        
        Returns:
            (can_process, wait_time)
        """
        if len(self.pending_ocr) >= self.max_queue_size:
            return False, None
        
        if self.ocr_limiter.acquire():
            return True, 0.0
        
        wait_time = self.ocr_limiter.wait_time()
        return False, wait_time
    
    def can_process_llm(self) -> tuple[bool, Optional[float]]:
        """Check if LLM can be called.
        
        Returns:
            (can_process, wait_time)
        """
        if len(self.pending_llm) >= self.max_queue_size:
            return False, None
        
        if self.llm_limiter.acquire():
            return True, 0.0
        
        wait_time = self.llm_limiter.wait_time()
        return False, wait_time
    
    def can_process_docai(self) -> tuple[bool, Optional[float]]:
        """Check if Document AI can be called.
        
        Returns:
            (can_process, wait_time)
        """
        if self.docai_limiter.acquire():
            return True, 0.0
        
        wait_time = self.docai_limiter.wait_time()
        return False, wait_time


# Global backpressure manager
_backpressure_manager: Optional[BackpressureManager] = None


def get_backpressure_manager() -> BackpressureManager:
    """Get singleton backpressure manager."""
    global _backpressure_manager
    if _backpressure_manager is None:
        _backpressure_manager = BackpressureManager()
    return _backpressure_manager

