"""Pytest configuration file for test discovery and path setup."""
import sys
from pathlib import Path

# Add the parent directory (python/) to sys.path so imports work correctly
python_dir = Path(__file__).parent.parent
if str(python_dir) not in sys.path:
    sys.path.insert(0, str(python_dir))
