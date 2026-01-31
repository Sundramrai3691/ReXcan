# ReXcan: OCR Invoice Processing with Hybrid Persistence

FastAPI-based invoice processing pipeline with MongoDB for operational data and PostgreSQL for analytics.

## Architecture

### Core Pipeline (Untouched)
```
OCR → Heuristics → LLM Fallback → MongoDB
```

### Hybrid Persistence Strategy

**MongoDB** (Operational)
- Real-time document storage
- Pipeline reads/writes
- Source of truth

**PostgreSQL** (Analytical)
- Read-only reporting layer
- Written AFTER MongoDB completes
- Never blocks pipeline on failure

## Why PostgreSQL?

1. **Relational Analytics**: Normalized schema for complex aggregations
2. **SQL Interface**: Standard reporting tools integration
3. **Read Optimization**: Indexed for common analytical queries
4. **Separation of Concerns**: Operational vs analytical workloads

## Why Hybrid Persistence?

- **MongoDB**: Flexible schema, fast writes, operational queries
- **PostgreSQL**: Structured analytics, SQL reporting, aggregations
- **Best of both**: Operational speed + analytical power
- **Risk mitigation**: PostgreSQL failures never impact core pipeline

## Why Read-Only?

- **Single source of truth**: MongoDB owns operational data
- **Write-once pattern**: Data written after full validation
- **Safe isolation**: Analytics can't corrupt operational state
- **Clear boundaries**: Core pipeline never depends on PostgreSQL

## Directory Structure

```
rexcan_sql/                 # Isolated PostgreSQL module
├── __init__.py            # Module documentation
├── db.py                  # Raw psycopg2 connection (no pooling)
├── schema.sql             # DDL: vendors, invoices, invoice_items
├── writer.py              # Write-only integration (idempotent)
└── queries.py             # Read-only reporting queries

main.py                    # FastAPI pipeline (MongoDB)
requirements.txt           # Dependencies
```

## Setup

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure PostgreSQL
```bash
# Set environment variables
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=rexcan
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=your_password
```

### 3. Initialize Schema
```bash
psql -U postgres -d rexcan -f rexcan_sql/schema.sql
```

### 4. Run Application
```bash
uvicorn main:app --reload
```

## Database Schema

### vendors
```sql
vendor_id    VARCHAR(50) PRIMARY KEY
vendor_name  VARCHAR(255) NOT NULL
created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### invoices
```sql
invoice_id     VARCHAR(50) PRIMARY KEY
vendor_id      VARCHAR(50) NOT NULL → vendors(vendor_id)
invoice_date   DATE NOT NULL
total_amount   NUMERIC(12, 2) NOT NULL
created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP

INDEX: idx_invoices_vendor_id
INDEX: idx_invoices_date
```

### invoice_items
```sql
item_id       SERIAL PRIMARY KEY
invoice_id    VARCHAR(50) NOT NULL → invoices(invoice_id)
description   TEXT NOT NULL
amount        NUMERIC(12, 2) NOT NULL
created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP

INDEX: idx_invoice_items_invoice_id
```

## Write Integration

### Safe Hook Pattern
```python
# In main.py after MongoDB storage
try:
    from rexcan_sql.writer import write_invoice_to_postgres
    write_invoice_to_postgres(invoice_dict)
except Exception as e:
    logger.error(f"PostgreSQL write failed (non-blocking): {e}")
```

### Guarantees
- ✅ Idempotent vendor inserts (`ON CONFLICT DO NOTHING`)
- ✅ Atomic commits (one transaction per invoice)
- ✅ Never blocks pipeline (try/except wrapper)
- ✅ Validated data only (written AFTER MongoDB)

## Reporting Queries

### Monthly Total Per Vendor
```python
from rexcan_sql.queries import get_monthly_total_per_vendor
results = get_monthly_total_per_vendor(2024, 1)
# [(vendor_name, total_amount), ...]
```

### Invoice Count Per Day
```python
from rexcan_sql.queries import get_invoice_count_per_day
results = get_invoice_count_per_day('2024-01-01', '2024-01-31')
# [(invoice_date, count), ...]
```

### Vendor Summary
```python
from rexcan_sql.queries import get_vendor_summary
results = get_vendor_summary()
# [(vendor_name, invoice_count, total_amount, avg_amount), ...]
```

## Query Optimization

### Verify Index Usage
```python
from rexcan_sql.queries import explain_vendor_total
plan = explain_vendor_total('VND1234')
# Check for "Index Scan using idx_invoices_vendor_id"
```

### Expected Performance
```
QUERY PLAN
-------------------------------------------------------------
Aggregate (cost=8.45..8.46 rows=1)
  -> Index Scan using idx_invoices_vendor_id on invoices
       (cost=0.15..8.43 rows=5)
       Index Cond: (vendor_id = 'VND1234')
```

## Interview-Safe Design

### Constraints Met
- ✅ No MongoDB/pipeline modifications
- ✅ No ORMs (raw psycopg2)
- ✅ No connection pooling (simple connections)
- ✅ Write-once pattern (after validation)
- ✅ Core pipeline never reads PostgreSQL
- ✅ Minimal, focused implementation

### Key Trade-offs
| Decision | Rationale |
|----------|-----------|
| No pooling | Simplicity over performance |
| Write-once | Clear separation, no sync complexity |
| Log-only errors | Analytics never blocks operations |
| Normalized schema | SQL analytics over document flexibility |

## Testing

### Example Invoice Submission
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

### Verify PostgreSQL Write
```sql
SELECT v.vendor_name, i.invoice_date, i.total_amount
FROM invoices i
JOIN vendors v ON i.vendor_id = v.vendor_id
ORDER BY i.created_at DESC
LIMIT 1;
```

## Production Considerations

### What's NOT Implemented (Intentionally)
- Connection pooling
- Async writes
- Retry logic
- Monitoring
- Backfill strategy

### Next Steps for Production
1. Add pgBouncer for connection pooling
2. Implement async task queue (Celery/RQ)
3. Add retry with exponential backoff
4. Set up PostgreSQL monitoring
5. Create backfill script for historical data
6. Add data validation tests
7. Document SLA for analytics freshness

## License
MIT
