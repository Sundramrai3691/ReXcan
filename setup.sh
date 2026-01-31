#!/bin/bash
set -e

echo "=========================================="
echo "ReXcan PostgreSQL Setup"
echo "=========================================="
echo

# Check if PostgreSQL is running
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Install PostgreSQL first:"
    echo "   brew install postgresql  # macOS"
    echo "   apt install postgresql   # Ubuntu"
    exit 1
fi

echo "✓ PostgreSQL client found"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep POSTGRES | xargs)
    echo "✓ Environment variables loaded"
else
    echo "❌ .env file not found"
    exit 1
fi

# Check PostgreSQL connection
echo
echo "Checking PostgreSQL connection..."
if psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d postgres -c '\q' 2>/dev/null; then
    echo "✓ PostgreSQL connection successful"
else
    echo "❌ Cannot connect to PostgreSQL"
    echo "   Make sure PostgreSQL is running and credentials are correct"
    exit 1
fi

# Create database if not exists
echo
echo "Creating database '$POSTGRES_DB'..."
psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d postgres -c "CREATE DATABASE $POSTGRES_DB" 2>/dev/null || echo "  Database already exists (OK)"

# Initialize schema
echo
echo "Initializing schema..."
psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -f rexcan_sql/schema.sql
echo "✓ Schema initialized"

# Verify tables
echo
echo "Verifying tables..."
TABLE_COUNT=$(psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
if [ $TABLE_COUNT -ge 3 ]; then
    echo "✓ Found $TABLE_COUNT tables"
else
    echo "❌ Expected 3 tables, found $TABLE_COUNT"
    exit 1
fi

# Install Python dependencies
echo
echo "Installing Python dependencies..."
pip install -q -r requirements.txt
echo "✓ Python dependencies installed"

echo
echo "=========================================="
echo "✓ Setup complete!"
echo "=========================================="
echo
echo "Next steps:"
echo "  1. Start server:  uvicorn main:app --reload"
echo "  2. Run demo:      python demo.py"
echo "  3. Run test:      python test_integration.py"
echo
