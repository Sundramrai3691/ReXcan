# Design Document: PostgreSQL Analytics Layer

## Problem Statement

ReXcan processes invoices through an OCR pipeline and stores operational data in MongoDB. We need SQL-based analytics without disrupting the existing system.

## Solution: Hybrid Persistence

Add PostgreSQL as a **parallel, read-only reporting layer** that receives data after MongoDB completes.

### Non-Goals
- ❌ Replace MongoDB
- ❌ Migrate existing data
- ❌ Make pipeline depend on PostgreSQL
- ❌ Use PostgreSQL for operational queries

### Goals
- ✅ Enable SQL analytics
- ✅ Zero impact on core pipeline
- ✅ Safe, isolated implementation
- ✅ Interview-ready code

## Architecture Decision Records

### ADR-001: Hybrid Persistence over Migration

**Context**: Need SQL analytics, have working MongoDB system

**Decision**: Run PostgreSQL in parallel, not as replacement

**Rationale**:
- MongoDB stays source of truth
- No risky migration
- Each database optimized for its workload
- Graceful degradation (analytics fail ≠ pipeline fail)

**Consequences**:
- Eventual consistency (acceptable for analytics)
- Duplicate storage (small cost for safety)
- Clear separation of concerns

### ADR-002: Write-Once Pattern

**Context**: How to keep PostgreSQL in sync

**Decision**: Write to PostgreSQL AFTER MongoDB completes

**Rationale**:
- MongoDB validates first
- PostgreSQL receives clean data
- Single write path (no sync complexity)
- Clear causality chain

**Consequences**:
- PostgreSQL may lag slightly
- No bidirectional sync issues
- Simpler reasoning about data flow

### ADR-003: Raw SQL over ORM

**Context**: Database access pattern

**Decision**: Use psycopg2 with raw SQL

**Rationale**:
- Requirement: Interview-safe, minimal
- ORMs hide too much
- Full control over queries
- Easy to optimize with EXPLAIN
- No magic, explicit intent

**Consequences**:
- More boilerplate
- Manual parameter binding
- Need SQL knowledge
- Better performance transparency

### ADR-004: No Connection Pooling

**Context**: Connection management strategy

**Decision**: New connection per operation

**Rationale**:
- Simplicity over performance
- Low write volume (one invoice at a time)
- Easier to reason about
- No pool exhaustion bugs
- Interview-friendly

**Consequences**:
- Slightly slower (acceptable trade-off)
- Won't scale to 1000s of writes/sec
- Production would add pgBouncer later

### ADR-005: Log-Only Error Handling

**Context**: What happens when PostgreSQL fails?

**Decision**: Log error, continue pipeline

**Rationale**:
- Analytics never blocks operations
- MongoDB is source of truth
- Can backfill PostgreSQL later
- Graceful degradation

**Consequences**:
- Analytics may have gaps
- Need monitoring for silent failures
- Acceptable for read-only layer

### ADR-006: Idempotent Vendor Inserts

**Context**: Vendor records inserted with every invoice

**Decision**: `ON CONFLICT DO NOTHING`

**Rationale**:
- Same vendor appears in many invoices
- Idempotency allows retries
- No race conditions
- Simple, correct

**Consequences**:
- Can't update vendor names
- Production might need UPSERT
- Good enough for analytics

## Schema Design

### Normalized Relational Model

```
vendors (1) ──< (N) invoices (1) ──< (N) invoice_items
```

**Why normalized?**
- Joins are cheap in PostgreSQL
- Avoids data duplication
- Standard SQL patterns
- Easy to aggregate

**Why not denormalized?**
- Not a high-read OLTP system
- Analytical queries benefit from normalization
- GROUP BY works better

### Index Strategy

```sql
idx_invoices_vendor_id  -- For vendor aggregations
idx_invoices_date       -- For time-series queries
idx_invoice_items_invoice_id  -- For joins
```

**Chosen for common queries**:
- Monthly total per vendor → vendor_id + date
- Invoice count per day → date
- Vendor summary → vendor_id

## Data Flow

```
┌─────────────────────────────────────────────┐
│ FastAPI Pipeline                            │
│                                             │
│  OCR → Heuristics → LLM                     │
│                      ↓                       │
│                   MongoDB (source of truth) │
│                      ↓                       │
│                   [SAFE HOOK]               │
│                      ↓                       │
│                   try/except                │
│                      ↓                       │
│              PostgreSQL (analytics)         │
│                   or log error              │
└─────────────────────────────────────────────┘
```

**Critical properties**:
1. MongoDB MUST complete first
2. PostgreSQL write NEVER blocks
3. Errors logged, not raised
4. Core pipeline unaware of PostgreSQL

## Integration Points

### Single Hook (main.py:56-60)

```python
try:
    from rexcan_sql.writer import write_invoice_to_postgres
    invoice_dict = stored.model_dump()
    write_invoice_to_postgres(invoice_dict)
except Exception as e:
    logger.error(f"PostgreSQL write failed (non-blocking): {e}")
```

**Why here?**
- After validation
- After MongoDB commit
- Before response
- Clear separation

**What if removed?**
- Core pipeline unaffected
- Analytics stop
- No errors

## Trade-offs

| Aspect | Choice | Alternative | Rationale |
|--------|--------|-------------|-----------|
| Persistence | Hybrid | Single DB | Best tool per workload |
| Write Pattern | After MongoDB | Async queue | Simpler, good enough |
| SQL Access | Raw psycopg2 | SQLAlchemy | Explicit, interview-safe |
| Pooling | None | pgBouncer | Simplicity for demo |
| Errors | Log only | Retry queue | Analytics not critical |
| Schema | Normalized | Denormalized | SQL analytics optimized |

## Production Evolution

This is an **interview-safe foundation**, not production-ready.

### What to add:

1. **Connection Pooling**
   ```python
   from psycopg2.pool import SimpleConnectionPool
   pool = SimpleConnectionPool(5, 20, dsn)
   ```

2. **Async Task Queue**
   ```python
   @celery.task
   def write_to_postgres_async(invoice_dict):
       write_invoice_to_postgres(invoice_dict)
   ```

3. **Retry with Backoff**
   ```python
   @retry(stop=stop_after_attempt(3), wait=wait_exponential())
   def write_invoice_to_postgres(data):
       ...
   ```

4. **Monitoring**
   - PostgreSQL write success rate
   - Lag between MongoDB and PostgreSQL
   - Query performance metrics

5. **Backfill Script**
   ```python
   # Sync historical MongoDB → PostgreSQL
   for invoice in mongodb.find({"synced_to_pg": False}):
       write_invoice_to_postgres(invoice)
   ```

## Testing Strategy

### Unit Tests
- Writer functions (idempotency, transactions)
- Query functions (GROUP BY, aggregations)
- Connection handling

### Integration Tests
- Full pipeline → both databases
- PostgreSQL failure doesn't crash pipeline
- Data consistency checks

### Performance Tests
- EXPLAIN ANALYZE all queries
- Verify index usage
- Benchmark aggregations

## Why This Design?

**Interview Context**: Shows understanding of:
- Separation of concerns
- Graceful degradation
- Trade-offs (simplicity vs performance)
- Production thinking (but not over-engineering)
- Clear boundaries
- Risk mitigation

**Real-World Applicability**:
- Pattern used at Stripe, Uber, Airbnb
- Common in event-driven systems
- Scales from prototype to production
- Easy to maintain and debug

## Questions Answered

### Why not replace MongoDB entirely?
- Risky migration
- MongoDB better for operational workload
- Don't fix what works

### Why not use MongoDB for analytics?
- SQL is standard for reporting tools
- PostgreSQL better at aggregations
- Relational model cleaner for analytics

### Why not use a data warehouse?
- Overkill for this scale
- PostgreSQL sufficient
- Simpler architecture

### Why not async from the start?
- Adds complexity
- Not needed for demo
- Easy to add later (pattern is compatible)

### What if PostgreSQL falls behind?
- Acceptable for analytics
- Monitoring would alert
- Backfill script can catch up

## Success Criteria

- ✅ Core pipeline unchanged
- ✅ PostgreSQL writes succeed
- ✅ PostgreSQL failures logged, not raised
- ✅ Queries use indexes
- ✅ Clear, maintainable code
- ✅ Interview-ready explanations

## References

- [PostgreSQL Indexing Best Practices](https://www.postgresql.org/docs/current/indexes.html)
- [Hybrid Persistence Patterns](https://martinfowler.com/articles/patterns-of-distributed-systems/)
- [Polyglot Persistence](https://martinfowler.com/bliki/PolyglotPersistence.html)
