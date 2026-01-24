#!/bin/bash
# Environment setup script for InvoiceAce

echo "Setting up InvoiceAce environment..."

# Create virtual environment
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check for system dependencies
echo "Checking system dependencies..."

# Check Tesseract
if ! command -v tesseract &> /dev/null; then
    echo "⚠️  Tesseract not found. Install with:"
    echo "   Mac: brew install tesseract"
    echo "   Linux: sudo apt-get install tesseract-ocr"
fi

# Check Poppler
if ! command -v pdftoppm &> /dev/null; then
    echo "⚠️  Poppler not found. Install with:"
    echo "   Mac: brew install poppler"
    echo "   Linux: sudo apt-get install poppler-utils"
fi

# Create .env from template if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env from template..."
    cp .env.template .env
    echo "⚠️  Please edit .env and add your LLM API keys"
fi

# Create directories
mkdir -p data/gold data/outputs uploads cache/ocr cache/llm

echo "✅ Setup complete!"
echo "Next steps:"
echo "1. Edit .env and add your LLM API keys"
echo "2. Run: uvicorn app.main:app --reload --port 8000"

