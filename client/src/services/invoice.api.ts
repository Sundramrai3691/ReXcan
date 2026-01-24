/**
 * Invoice Processing API Service
 * 
 * Handles all invoice processing API calls to the backend.
 * Following industry standards (Oct 2025) with proper error handling and type safety.
 */

import apiClient from '../config/api.config';

// Types
export interface OCRResponse {
  job_id: string;
  blocks: OCRBlock[];
  elapsed: number;
}

export interface OCRBlock {
  text: string;
  bbox: number[];
  confidence: number;
  engine: string;
}

export interface InvoiceExtract {
  invoice_id?: string | null;
  vendor_name?: string | null;
  vendor_id?: string | null;
  invoice_date?: string | null;
  total_amount?: number | null;
  amount_subtotal?: number | null;
  amount_tax?: number | null;
  currency?: string | null;
  line_items?: LineItem[];
  raw_ocr_blocks?: OCRBlock[];
  field_confidences?: Record<string, number>;
  field_reasons?: Record<string, string>;
  field_sources?: Record<string, string>;
  timings?: Record<string, number>;
  llm_used?: boolean;
  llm_fields?: string[];
  dedupe_hash?: string | null;
  is_duplicate?: boolean;
  is_near_duplicate?: boolean;
  near_duplicates?: Array<{ job_id: string; similarity: number }>;
  arithmetic_mismatch?: boolean;
  needs_human_review?: boolean;
  llm_call_reason?: string;
  // Validation flags for invalid invoices
  missing_invoice_id?: boolean;
  missing_total?: boolean;
  missing_vendor_name?: boolean;
  missing_date?: boolean;
  is_invalid?: boolean;
}

export interface LineItem {
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;
}

export interface VerifyRequest {
  documentId: string;
  corrections: Record<string, any>;
  autoPromote?: boolean;
}

export interface VerifyResponse {
  job_id: string;
  result: InvoiceExtract;
  correction_time: number;
  learning_artifacts?: Record<string, any>;
}

export interface MetricsResponse {
  total_invoices: number;
  total_fields_processed: number;
  auto_accepted_count: number;
  flagged_count: number;
  llm_call_count: number;
  avg_confidence: number;
  avg_processing_time: number;
  avg_correction_time?: number | null;
  heuristic_coverage: number;
  avg_ocr_time?: number | null;
  avg_heuristics_time?: number | null;
  avg_llm_time?: number | null;
  slo_90th_percentile?: number | null;
  source_coverage?: Record<string, number> | null;
}

export interface ReviewQueueItem {
  job_id: string;
  filename: string;
  invoice_id?: string | null;
  vendor_name?: string | null;
  total_amount?: number | null;
  low_confidence_fields: string[];
  is_duplicate: boolean;
  arithmetic_mismatch: boolean;
  field_confidences: Record<string, number>;
  uploaded_at?: number;
}

export interface ReviewQueueResponse {
  flagged_invoices: ReviewQueueItem[];
  total: number;
}

export interface AuditLogEntry {
  timestamp: number;
  action: string;
  field_name?: string;
  old_value?: any;
  new_value?: any;
  user_id?: string;
  reason?: string;
}

export interface AuditLogResponse {
  job_id: string;
  audit_entries: AuditLogEntry[];
  total_entries: number;
}

export interface VendorPromoteResponse {
  success: boolean;
  canonical_id: string;
  vendor_name: string;
  message: string;
}

/**
 * Invoice Processing API Service
 */
class InvoiceAPI {
  /**
   * Run OCR only on a document
   */
  async runOCR(documentId: string): Promise<OCRResponse> {
    const response = await apiClient.post<{ data: OCRResponse }>('/invoices/ocr', {
      documentId,
    });
    return response.data.data;
  }

  /**
   * Process invoice (full pipeline)
   */
  async processInvoice(documentId: string): Promise<InvoiceExtract> {
    const response = await apiClient.post<{ data: InvoiceExtract }>('/invoices/process', {
      documentId,
    });
    return response.data.data;
  }

  /**
   * Verify/correct extracted fields (Human-in-the-Loop)
   */
  async verifyCorrections(request: VerifyRequest): Promise<VerifyResponse> {
    const response = await apiClient.post<{ data: VerifyResponse }>('/invoices/verify', request);
    return response.data.data;
  }

  /**
   * Export invoice as CSV
   */
  async exportCSV(
    documentId: string,
    erpType: string = 'quickbooks',
    skipSafetyCheck: boolean = false
  ): Promise<Blob> {
    const response = await apiClient.get(`/invoices/export/csv`, {
      params: {
        documentId,
        erp_type: erpType,
        skip_safety_check: skipSafetyCheck,
      },
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Export invoice as JSON
   */
  async exportJSON(documentId: string): Promise<Blob> {
    const response = await apiClient.get(`/invoices/export/json`, {
      params: {
        documentId,
      },
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Get aggregate system metrics
   */
  async getMetrics(): Promise<MetricsResponse> {
    const response = await apiClient.get<{ data: MetricsResponse }>('/invoices/metrics');
    return response.data.data;
  }

  /**
   * Get review queue (flagged invoices for manual review)
   */
  async getReviewQueue(limit: number = 20): Promise<ReviewQueueResponse> {
    const response = await apiClient.get<{ data: ReviewQueueResponse }>('/invoices/review/queue', {
      params: { limit },
    });
    return response.data.data;
  }

  /**
   * Apply review corrections
   */
  async applyReviewCorrections(
    jobId: string,
    corrections: Record<string, any>,
    autoPromote: boolean = false
  ): Promise<VerifyResponse> {
    const response = await apiClient.post<{ data: VerifyResponse }>(
      `/invoices/review/${jobId}/apply`,
      {
        corrections,
        autoPromote,
      }
    );
    return response.data.data;
  }

  /**
   * Rollback corrections
   */
  async rollbackCorrections(jobId: string): Promise<{
    job_id: string;
    result: InvoiceExtract;
    rolled_back: boolean;
  }> {
    const response = await apiClient.post<{
      data: { job_id: string; result: InvoiceExtract; rolled_back: boolean };
    }>(`/invoices/review/${jobId}/rollback`);
    return response.data.data;
  }

  /**
   * Get audit log for a document
   */
  async getAuditLog(documentId: string): Promise<AuditLogResponse> {
    const response = await apiClient.get<{ data: AuditLogResponse }>(
      `/invoices/audit/${documentId}`
    );
    return response.data.data;
  }

  /**
   * Promote vendor (canonicalization)
   */
  async promoteVendor(
    vendorName: string,
    canonicalId?: string
  ): Promise<VendorPromoteResponse> {
    const response = await apiClient.post<{ data: VendorPromoteResponse }>(
      '/invoices/vendor/promote',
      {
        vendorName,
        canonicalId,
      }
    );
    return response.data.data;
  }

  /**
   * Get job processing status and logs
   */
  async getJobStatus(pythonJobId: string): Promise<{
    success: boolean;
    data?: {
      job_id: string;
      status: string;
      logs: Array<{ timestamp: number; message: string; level: string }>;
      has_result: boolean;
      needs_human_review: boolean;
    };
    message?: string;
  }> {
    const response = await apiClient.get<{
      success: boolean;
      data?: {
        job_id: string;
        status: string;
        logs: Array<{ timestamp: number; message: string; level: string }>;
        has_result: boolean;
        needs_human_review: boolean;
      };
      message?: string;
    }>(`/invoices/status`, {
      params: { pythonJobId },
    });
    return response.data;
  }

  /**
   * Health check (includes Python service health)
   */
  async healthCheck(): Promise<{
    status: string;
    service: string;
    pythonService: { status: string; service: string };
    timestamp: string;
  }> {
    const response = await apiClient.get<{
      data: {
        status: string;
        service: string;
        pythonService: { status: string; service: string };
        timestamp: string;
      };
    }>('/invoices/health');
    return response.data.data;
  }
}

export const invoiceAPI = new InvoiceAPI();

