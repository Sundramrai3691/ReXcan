-- ReXcan PostgreSQL Reporting Schema
--
-- Purpose: Read-only analytical layer for invoice reporting
-- Strategy: Write-once after full pipeline processing
--
-- Tables:
--   vendors       - Vendor master data
--   invoices      - Invoice headers
--   invoice_items - Invoice line items

-- Drop tables if exist (for clean setup)
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;

-- Vendors table
CREATE TABLE vendors (
    vendor_id VARCHAR(50) PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices table
CREATE TABLE invoices (
    invoice_id VARCHAR(50) PRIMARY KEY,
    vendor_id VARCHAR(50) NOT NULL,
    invoice_date DATE NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id)
);

-- Invoice items table
CREATE TABLE invoice_items (
    item_id SERIAL PRIMARY KEY,
    invoice_id VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
);

-- Indexes for analytical queries
CREATE INDEX idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- Comments
COMMENT ON TABLE vendors IS 'Vendor master data for reporting';
COMMENT ON TABLE invoices IS 'Invoice headers written after full pipeline processing';
COMMENT ON TABLE invoice_items IS 'Invoice line items for detailed analytics';
COMMENT ON INDEX idx_invoices_vendor_id IS 'Optimize vendor-based aggregations';
