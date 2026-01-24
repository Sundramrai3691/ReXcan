import apiClient from '../config/api.config';
import type {
  DocumentUploadResponse,
  DocumentsListResponse,
  DocumentResponse,
  ApiResponse,
} from '../types/document.types';

/**
 * Document API service
 * Handles all document-related API calls
 */
class DocumentAPI {
  /**
   * Upload a document (image or PDF)
   * @param file - File to upload
   * @param model - AI model to use for extraction ('gemini', 'openai', 'groq', 'claude', 'rexcan', 'best')
   * @param onUploadProgress - Optional progress callback
   */
  async uploadDocument(
    file: File,
    model: string = 'best',
    onUploadProgress?: (progress: number) => void
  ): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', model);

    const response = await apiClient.post<DocumentUploadResponse>(
      '/documents/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onUploadProgress) {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onUploadProgress(progress);
          }
        },
        timeout: 120000, // 2 minutes timeout for large files
      }
    );
    return response.data;
  }

  /**
   * Upload multiple documents (batch upload)
   * @param files - Array of files to upload
   * @param model - AI model to use for extraction
   * @param onUploadProgress - Optional progress callback
   */
  async uploadDocumentsBatch(
    files: File[],
    model: string = 'best',
    onUploadProgress?: (progress: number) => void
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      batchId: string;
      documents: Array<{
        id: string;
        fileName: string;
        originalFileName: string;
        fileType: string;
        fileSize: number;
        status: string;
        queueJobId: string;
        createdAt: string;
      }>;
      total: number;
      successful: number;
      failed: number;
    };
  }> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    formData.append('model', model);

    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: {
        batchId: string;
        documents: Array<{
          id: string;
          fileName: string;
          originalFileName: string;
          fileType: string;
          fileSize: number;
          status: string;
          queueJobId: string;
          createdAt: string;
        }>;
        total: number;
        successful: number;
        failed: number;
      };
    }>('/documents/upload/batch', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onUploadProgress) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onUploadProgress(progress);
        }
      },
      timeout: 300000, // 5 minutes timeout for batch uploads
    });
    return response.data;
  }

  /**
   * Get user's documents with pagination
   * @param limit - Number of documents per page
   * @param skip - Number of documents to skip
   */
  async getDocuments(limit = 50, skip = 0): Promise<DocumentsListResponse> {
    const response = await apiClient.get<DocumentsListResponse>('/documents', {
      params: { limit, skip },
    });
    return response.data;
  }

  /**
   * Get a single document by ID
   * @param documentId - Document ID
   */
  async getDocument(documentId: string): Promise<DocumentResponse> {
    const response = await apiClient.get<DocumentResponse>(
      `/documents/${documentId}`
    );
    return response.data;
  }

  /**
   * Update document extracted data
   * @param documentId - Document ID
   * @param extractedData - Partial extracted data to update
   * @param lineItems - Optional line items to update
   */
  async updateDocument(
    documentId: string,
    extractedData?: Partial<import('../types/document.types').ExtractedData>,
    lineItems?: import('../services/invoice.api').LineItem[]
  ): Promise<DocumentResponse> {
    const response = await apiClient.patch<DocumentResponse>(
      `/documents/${documentId}`,
      {
        extractedData,
        lineItems,
      }
    );
    return response.data;
  }

  /**
   * Get batch status
   * @param batchId - Batch ID
   */
  async getBatchStatus(batchId: string): Promise<{
    success: boolean;
    message: string;
    data: {
      batchId: string;
      total: number;
      completed: number;
      inProgress: number;
      progress: number;
      statusCounts: {
        uploaded: number;
        queued: number;
        processing: number;
        processed: number;
        failed: number;
      };
      documents: Array<{
        id: string;
        fileName: string;
        originalFileName: string;
        status: string;
        pythonJobId?: string;
        createdAt: string;
        processedAt?: string;
      }>;
    };
  }> {
    const response = await apiClient.get<{
      success: boolean;
      message: string;
      data: {
        batchId: string;
        total: number;
        completed: number;
        inProgress: number;
        progress: number;
        statusCounts: {
          uploaded: number;
          queued: number;
          processing: number;
          processed: number;
          failed: number;
        };
        documents: Array<{
          id: string;
          fileName: string;
          originalFileName: string;
          status: string;
          pythonJobId?: string;
          createdAt: string;
          processedAt?: string;
        }>;
      };
    }>(`/documents/batch/${batchId}`);
    return response.data;
  }

  /**
   * Export document as CSV
   * @param documentId - Document ID
   * @param erpType - ERP format type (quickbooks, sap, oracle, xero, default)
   * @param skipSafetyCheck - Skip safety checks
   */
  async exportCSV(
    documentId: string,
    erpType: string = 'quickbooks',
    skipSafetyCheck: boolean = false
  ): Promise<Blob> {
    try {
      const response = await apiClient.get(`/invoices/export/csv`, {
        params: {
          documentId,
          erp_type: erpType,
          skip_safety_check: skipSafetyCheck,
        },
        responseType: 'blob',
      });
      return response.data;
    } catch (error: any) {
      // Handle axios errors - blob responses might contain error JSON
      if (error.response && error.response.data instanceof Blob) {
        try {
          const blobClone = error.response.data.slice();
          const text = await blobClone.text();
          let errorMessage = `Export failed with status ${error.response.status}`;
          try {
            const errorJson = JSON.parse(text);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
          } catch {
            // If it's not JSON, use the text if it's short enough to be an error message
            if (text.length < 500) {
              errorMessage = text;
            }
          }
          throw new Error(errorMessage);
        } catch (parseError) {
          // If we can't parse the error, use the original error
          throw new Error(`CSV export failed: ${error.response?.status || 'Unknown error'}`);
        }
      }
      
      // If it's already an Error, rethrow it
      if (error instanceof Error) {
        throw error;
      }
      // Otherwise, wrap it
      throw new Error(`CSV export failed: ${String(error)}`);
    }
  }

  /**
   * Export document as JSON
   * @param documentId - Document ID
   */
  async exportJSON(documentId: string): Promise<Blob> {
    try {
      const response = await apiClient.get(`/invoices/export/json`, {
        params: {
          documentId,
        },
        responseType: 'blob',
      });
      return response.data;
    } catch (error: any) {
      // Handle axios errors - blob responses might contain error JSON
      if (error.response && error.response.data instanceof Blob) {
        try {
          const blobClone = error.response.data.slice();
          const text = await blobClone.text();
          let errorMessage = `Export failed with status ${error.response.status}`;
          try {
            const errorJson = JSON.parse(text);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
          } catch {
            // If it's not JSON, use the text if it's short enough to be an error message
            if (text.length < 500) {
              errorMessage = text;
            }
          }
          throw new Error(errorMessage);
        } catch (parseError) {
          // If we can't parse the error, use the original error
          throw new Error(`JSON export failed: ${error.response?.status || 'Unknown error'}`);
        }
      }
      
      // If it's already an Error, rethrow it
      if (error instanceof Error) {
        throw error;
      }
      // Otherwise, wrap it
      throw new Error(`JSON export failed: ${String(error)}`);
    }
  }

  /**
   * Delete a document
   * @param documentId - Document ID
   */
  async deleteDocument(documentId: string): Promise<{
    success: boolean;
    message: string;
    data?: { deleted: boolean };
  }> {
    const response = await apiClient.delete<{
      success: boolean;
      message: string;
      data?: { deleted: boolean };
    }>(`/documents/${documentId}`);
    return response.data;
  }
}

export const documentAPI = new DocumentAPI();

