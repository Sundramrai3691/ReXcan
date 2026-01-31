# Quick Start Guide

Get ReXcan running with PostgreSQL analytics in 5 minutes.

## Prerequisites

- Python 3.9+
- PostgreSQL 12+ running
- pip

## Setup

### 1. Configure Environment

Edit `.env` with your PostgreSQL credentials:

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=rexcan
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
```

### 2. Run Setup Script

```bash
./setup.sh
```

This will:
- Create database
- Initialize schema (vendors, invoices, invoice_items)
- Install Python dependencies

### 3. Start Server

```bash
uvicorn main:app --reload
```

Server runs at `http://localhost:8000`

## Test It

### Submit a test invoice:

```bash
curl -X POST http://localhost:8000/process-invoice \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_name": "Acme Corp",
    "invoice_date": "2024-01-15",
    "total_amount": 1250.00,
    "items": [
      {"description": "Widget A", "amount": 500.00},
      {"description": "Widget B", "amount": 750.00}
    ]
  }'
```

### Run analytics demo:

```bash
python demo.py
```

### Run integration test:

```bash
python test_integration.py
```

## Verify PostgreSQL

```sql
psql -U postgres -d rexcan

SELECT v.vendor_name, COUNT(*) as invoices, SUM(i.total_amount) as total
FROM vendors v
JOIN invoices i ON v.vendor_id = i.vendor_id
GROUP BY v.vendor_name;
```

## Project Structure

```
rexcan_sql/
├── db.py          # PostgreSQL connection
├── schema.sql     # Database schema (DDL)
├── writer.py      # Write-only integration
└── queries.py     # Read-only analytics

main.py            # FastAPI pipeline
demo.py            # Analytics demo
test_integration.py # Integration test
```

## Key Concepts

### Hybrid Persistence
- **MongoDB**: Operational data (simulated in demo)
- **PostgreSQL**: Analytics only

### Write Pattern
1. Pipeline validates invoice
2. Store in MongoDB
3. Write to PostgreSQL (non-blocking)
4. If PostgreSQL fails → log only, don't crash

### Read Pattern
- Core pipeline: MongoDB only
- Analytics/reports: PostgreSQL only
- Never mix concerns

## Common Issues

### Can't connect to PostgreSQL
```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL (macOS)
brew services start postgresql

# Start PostgreSQL (Ubuntu)
sudo systemctl start postgresql
```

### Schema errors
```bash
# Re-initialize schema
psql -U postgres -d rexcan -f rexcan_sql/schema.sql
```

### Import errors
```bash
# Reinstall dependencies
pip install -r requirements.txt
```

## Next Steps

1. Read [DESIGN.md](DESIGN.md) for architecture details
2. Read [README.md](README.md) for full documentation
3. Add more test data
4. Explore analytical queries in `rexcan_sql/queries.py`

## Production Checklist

Before deploying:
- [ ] Add connection pooling (pgBouncer)
- [ ] Implement async task queue (Celery)
- [ ] Add retry logic with exponential backoff
- [ ] Set up monitoring and alerts
- [ ] Create backfill script for historical data
- [ ] Add comprehensive tests
- [ ] Document SLA for analytics freshness
- [ ] Set up PostgreSQL replication
