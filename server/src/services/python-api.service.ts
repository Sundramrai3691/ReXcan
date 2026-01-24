/**
 * Python FastAPI Service Client
 * 
 * This service provides a TypeScript wrapper for the Python FastAPI invoice processing service.
 * It handles all communication with the Python microservice following industry standards (Oct 2025).
 */

import { logger } from '../utils/logger.js';
import FormData from 'form-data';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';

interface PythonServiceConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
}

interface UploadResponse {
  job_id: string;
  filename: string;
  preview_url: string;
}

interface OCRResponse {
  job_id: string;
  blocks: OCRBlock[];
  elapsed: number;
}

interface OCRBlock {
  text: string;
  bbox: number[];
  confidence: number;
  engine: string;
}

interface InvoiceExtract {
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

interface LineItem {
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;
}

interface VerifyRequest {
  job_id: string;
  corrections: Record<string, any>;
  user_id?: string;
}

interface VerifyResponse {
  job_id: string;
  result: InvoiceExtract;
  correction_time: number;
  learning_artifacts?: Record<string, any>;
}

interface MetricsResponse {
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

interface ReviewQueueItem {
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

interface ReviewQueueResponse {
  flagged_invoices: ReviewQueueItem[];
  total: number;
}

interface AuditLogEntry {
  timestamp: number;
  action: string;
  field_name?: string;
  old_value?: any;
  new_value?: any;
  user_id?: string;
  reason?: string;
}

interface AuditLogResponse {
  job_id: string;
  audit_entries: AuditLogEntry[];
  total_entries: number;
}

class PythonAPIService {
  private config: PythonServiceConfig;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';
    this.config = {
      baseUrl: this.baseUrl,
      timeout: parseInt(process.env.PYTHON_API_TIMEOUT || '120000', 10),
      retries: parseInt(process.env.PYTHON_API_RETRIES || '3', 10),
    };
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(
            `Python API error (${response.status}): ${errorText}`
          );
          // Add status code to error for easier checking
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on 404 errors (job not found) - they won't be found on retry
        const status = (error as any)?.status;
        if (status === 404) {
          logger.warn(`Job not found (404), skipping retries: ${endpoint}`);
          // Throw immediately - don't continue to error logging
          throw lastError;
        }
        
        if (attempt < this.config.retries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.warn(
            `Python API request failed (attempt ${attempt + 1}/${this.config.retries}), retrying in ${delay}ms:`,
            lastError.message
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Only log error if we exhausted all retries (not a 404)
    logger.error(`Python API request failed after ${this.config.retries} attempts:`, lastError);
    throw lastError || new Error('Python API request failed');
  }

  /**
   * Upload a file to the Python service
   */
  async uploadFile(filePath: string, originalFilename: string): Promise<UploadResponse> {
    try {
      // Use form-data with file stream for proper multipart/form-data handling
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      formData.append('file', fileStream, originalFilename);

      const url = new URL(`${this.config.baseUrl}/upload`);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      // Use form-data's submit method for proper boundary handling
      return new Promise((resolve, reject) => {
        const requestOptions = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: formData.getHeaders(),
        };

        const req = httpModule.request(requestOptions, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk.toString();
          });

          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const data = JSON.parse(responseData);
                resolve(data as UploadResponse);
              } catch (parseError) {
                logger.error('Error parsing response:', parseError);
                reject(new Error(`Failed to parse response: ${responseData}`));
              }
            } else {
              reject(new Error(`Upload failed (${res.statusCode}): ${responseData}`));
            }
          });
        });

        req.on('error', (error) => {
          logger.error('Request error:', error);
          reject(error);
        });

        formData.pipe(req);
      });
    } catch (error) {
      logger.error('Error uploading file to Python service:', error);
      throw error;
    }
  }

  /**
   * Run OCR on an uploaded file
   */
  async runOCR(jobId: string): Promise<OCRResponse> {
    return this.request<OCRResponse>(`/ocr?job_id=${jobId}`, {
      method: 'POST',
    });
  }

  /**
   * Process an invoice (full pipeline)
   */
  async processInvoice(jobId: string): Promise<InvoiceExtract> {
    return this.request<InvoiceExtract>(`/process?job_id=${jobId}`, {
      method: 'POST',
    });
  }

  /**
   * Verify/correct extracted fields
   */
  async verifyCorrections(
    request: VerifyRequest,
    autoPromote: boolean = false
  ): Promise<VerifyResponse> {
    return this.request<VerifyResponse>(
      `/verify?auto_promote=${autoPromote}`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
  }

  /**
   * Export invoice as CSV
   */
  async exportCSV(
    jobId: string,
    erpType: string = 'quickbooks',
    skipSafetyCheck: boolean = false
  ): Promise<Blob> {
    const url = `${this.config.baseUrl}/export/csv?job_id=${jobId}&erp_type=${erpType}&skip_safety_check=${skipSafetyCheck}`;
    
    try {
      const response = await fetch(url);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = `Failed to read error response: ${e}`;
        }
        
        const errorMessage = `CSV export failed (${response.status}): ${errorText}`;
        logger.error(`Python API exportCSV error for job ${jobId}:`, {
          status: response.status,
          statusText: response.statusText,
          errorText,
          url,
          erpType,
          skipSafetyCheck,
        });
        throw new Error(errorMessage);
      }

      return response.blob();
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Python API exportCSV exception for job ${jobId}:`, {
          error: error.message,
          stack: error.stack,
          url,
        });
        throw error;
      }
      throw new Error(`Unknown error during CSV export: ${String(error)}`);
    }
  }

  /**
   * Export invoice as JSON
   */
  async exportJSON(jobId: string): Promise<Blob> {
    const url = `${this.config.baseUrl}/export/json?job_id=${jobId}`;
    
    try {
      const response = await fetch(url);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = `Failed to read error response: ${e}`;
        }
        
        const errorMessage = `JSON export failed (${response.status}): ${errorText}`;
        logger.error(`Python API exportJSON error for job ${jobId}:`, {
          status: response.status,
          statusText: response.statusText,
          errorText,
          url,
        });
        throw new Error(errorMessage);
      }

      return response.blob();
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Python API exportJSON exception for job ${jobId}:`, {
          error: error.message,
          stack: error.stack,
          url,
        });
        throw error;
      }
      throw new Error(`Unknown error during JSON export: ${String(error)}`);
    }
  }

  /**
   * Get aggregate metrics
   */
  async getMetrics(): Promise<MetricsResponse> {
    return this.request<MetricsResponse>('/metrics', {
      method: 'GET',
    });
  }

  /**
   * Get review queue
   */
  async getReviewQueue(limit: number = 20): Promise<ReviewQueueResponse> {
    return this.request<ReviewQueueResponse>(
      `/review/queue?limit=${limit}`,
      {
        method: 'GET',
      }
    );
  }

  /**
   * Apply review corrections
   */
  async applyReviewCorrections(
    jobId: string,
    corrections: Record<string, any>,
    userId: string = 'system',
    autoPromote: boolean = false
  ): Promise<VerifyResponse> {
    return this.request<VerifyResponse>(
      `/review/${jobId}/apply?user_id=${userId}&auto_promote=${autoPromote}`,
      {
        method: 'POST',
        body: JSON.stringify({ corrections }),
      }
    );
  }

  /**
   * Rollback corrections
   */
  async rollbackCorrections(
    jobId: string,
    userId: string = 'system'
  ): Promise<{ job_id: string; result: InvoiceExtract; rolled_back: boolean }> {
    return this.request(
      `/review/${jobId}/rollback?user_id=${userId}`,
      {
        method: 'POST',
      }
    );
  }

  /**
   * Get audit log for a job
   */
  async getAuditLog(jobId: string): Promise<AuditLogResponse> {
    return this.request<AuditLogResponse>(`/audit/${jobId}`, {
      method: 'GET',
    });
  }

  /**
   * Promote vendor
   */
  async promoteVendor(
    vendorName: string,
    canonicalId?: string
  ): Promise<{
    success: boolean;
    canonical_id: string;
    vendor_name: string;
    message: string;
  }> {
    const params = new URLSearchParams({ vendor_name: vendorName });
    if (canonicalId) {
      params.append('canonical_id', canonicalId);
    }

    return this.request(`/vendor/promote?${params.toString()}`, {
      method: 'POST',
    });
  }

  /**
   * Health check
   */
  async getJobStatus(jobId: string): Promise<{
    job_id: string;
    status: string;
    logs: Array<{ timestamp: number; message: string; level: string }>;
    has_result: boolean;
    needs_human_review: boolean;
  }> {
    return this.request<{
      job_id: string;
      status: string;
      logs: Array<{ timestamp: number; message: string; level: string }>;
      has_result: boolean;
      needs_human_review: boolean;
    }>(`/status?job_id=${jobId}`, {
      method: 'GET',
    });
  }

  async healthCheck(): Promise<{ status: string; service: string }> {
    return this.request('/health', {
      method: 'GET',
    });
  }
}

export const pythonAPIService = new PythonAPIService();
export type {
  UploadResponse,
  OCRResponse,
  InvoiceExtract,
  LineItem,
  OCRBlock,
  VerifyRequest,
  VerifyResponse,
  MetricsResponse,
  ReviewQueueItem,
  ReviewQueueResponse,
  AuditLogEntry,
  AuditLogResponse,
};

