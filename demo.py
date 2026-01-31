"""
Demo script to show PostgreSQL analytics layer

Usage:
    python demo.py
"""
import sys
import logging
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def demo_queries():
    """Demonstrate reporting queries"""
    from rexcan_sql import queries

    print("\n" + "=" * 60)
    print("PostgreSQL Analytics Demo")
    print("=" * 60)

    try:
        # Vendor Summary
        print("\n1. Vendor Summary")
        print("-" * 60)
        results = queries.get_vendor_summary()
        if results:
            print(f"{'Vendor':<30} {'Invoices':<10} {'Total':<15} {'Average':<15}")
            print("-" * 60)
            for row in results:
                vendor, count, total, avg = row
                total_str = f"${total:,.2f}" if total else "$0.00"
                avg_str = f"${avg:,.2f}" if avg else "$0.00"
                print(f"{vendor:<30} {count:<10} {total_str:<15} {avg_str:<15}")
        else:
            print("No data found")

        # Monthly totals
        print("\n2. Monthly Total Per Vendor (Current Month)")
        print("-" * 60)
        now = datetime.now()
        results = queries.get_monthly_total_per_vendor(now.year, now.month)
        if results:
            print(f"{'Vendor':<30} {'Total Amount':<15}")
            print("-" * 60)
            for vendor, total in results:
                print(f"{vendor:<30} ${total:,.2f}")
        else:
            print("No data for current month")

        # Daily invoice count
        print("\n3. Invoice Count Per Day (Last 7 days)")
        print("-" * 60)
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=7)
        results = queries.get_invoice_count_per_day(
            start_date.isoformat(),
            end_date.isoformat()
        )
        if results:
            print(f"{'Date':<15} {'Count':<10}")
            print("-" * 60)
            for date, count in results:
                print(f"{date:<15} {count:<10}")
        else:
            print("No data for last 7 days")

        # Top items
        print("\n4. Top 10 Invoice Items by Amount")
        print("-" * 60)
        results = queries.get_top_items_by_amount(10)
        if results:
            print(f"{'Description':<40} {'Amount':<15} {'Invoice ID':<40}")
            print("-" * 60)
            for desc, amount, inv_id in results:
                desc_short = (desc[:37] + '...') if len(desc) > 40 else desc
                inv_short = inv_id[:37] + '...' if len(inv_id) > 40 else inv_id
                print(f"{desc_short:<40} ${amount:,.2f}    {inv_short}")
        else:
            print("No items found")

        print("\n" + "=" * 60)
        print("Demo completed successfully")
        print("=" * 60 + "\n")

    except Exception as e:
        logger.error(f"Demo failed: {e}")
        print(f"\nError: {e}")
        print("\nMake sure PostgreSQL is running and schema is initialized:")
        print("  psql -U postgres -d rexcan -f rexcan_sql/schema.sql")
        sys.exit(1)


def explain_optimization():
    """Show query optimization with EXPLAIN ANALYZE"""
    from rexcan_sql import queries

    print("\n" + "=" * 60)
    print("Query Optimization Demo")
    print("=" * 60)

    try:
        # Get first vendor_id from vendors table
        from rexcan_sql.db import execute_query
        vendors = execute_query("SELECT vendor_id FROM vendors LIMIT 1")

        if not vendors:
            print("\nNo vendors found. Add some data first.")
            return

        vendor_id = vendors[0][0]
        print(f"\nEXPLAIN ANALYZE for vendor_id = {vendor_id}")
        print("-" * 60)

        plan = queries.explain_vendor_total(vendor_id)
        for line in plan:
            print(line[0])

        print("\nLook for 'Index Scan using idx_invoices_vendor_id'")
        print("This confirms the query is using our optimized index.")
        print("=" * 60 + "\n")

    except Exception as e:
        logger.error(f"Optimization demo failed: {e}")
        print(f"\nError: {e}")


if __name__ == "__main__":
    print("\nReXcan PostgreSQL Analytics Layer Demo\n")

    demo_queries()

    if len(sys.argv) > 1 and sys.argv[1] == "--explain":
        explain_optimization()
