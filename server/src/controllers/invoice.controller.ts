/**
 * Invoice Processing Controller
 * 
 * Handles all invoice processing endpoints that interact with the Python FastAPI service.
 * Following industry standards (Oct 2025) with proper error handling, validation, and type safety.
 */

import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponseHelper } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { AuthRequest } from '../types/auth.types.js';
import { pythonAPIService } from '../services/python-api.service.js';
import { getDocumentById } from '../services/document.service.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Health check endpoint (includes Python service health)
 */
export const getHealth = asyncHandler(
  async (_req: AuthRequest, res: Response): Promise<Response> => {
    try {
      const pythonHealth = await pythonAPIService.healthCheck();
      return ApiResponseHelper.success(
        res,
        {
          status: 'ok',
          service: 'InvoiceAce API',
          pythonService: pythonHealth,
          timestamp: new Date().toISOString(),
        },
        'Health check successful'
      );
    } catch (error) {
      logger.error('Health check failed:', error);
      return ApiResponseHelper.success(
        res,
        {
          status: 'degraded',
          service: 'InvoiceAce API',
          pythonService: { status: 'error', service: 'Python FastAPI' },
          timestamp: new Date().toISOString(),
        },
        'Health check completed with warnings'
      );
    }
  }
);

/**
 * Run OCR only on an uploaded document
 */
export const runOCR = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const { documentId } = req.body;

    if (!documentId) {
      return ApiResponseHelper.badRequest(res, 'Document ID is required');
    }

    // Get document to verify ownership and get Python job ID
    const document = await getDocumentById(documentId, userId);
    if (!document) {
      return ApiResponseHelper.notFound(res, 'Document not found');
    }

    if (!document.pythonJobId) {
      return ApiResponseHelper.badRequest(
        res,
        'Document has not been uploaded to Python service yet'
      );
    }

    try {
      const ocrResponse = await pythonAPIService.runOCR(document.pythonJobId);
      return ApiResponseHelper.success(res, ocrResponse, 'OCR extraction completed');
    } catch (error) {
      logger.error('OCR extraction failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'OCR extraction failed'
      );
    }
  }
);

/**
 * Process invoice (full pipeline) - can be called manually or triggered automatically
 */
export const processInvoice = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const { documentId } = req.body;

    if (!documentId) {
      return ApiResponseHelper.badRequest(res, 'Document ID is required');
    }

    // Get document to verify ownership and get Python job ID
    const document = await getDocumentById(documentId, userId);
    if (!document) {
      return ApiResponseHelper.notFound(res, 'Document not found');
    }

    if (!document.pythonJobId) {
      return ApiResponseHelper.badRequest(
        res,
        'Document has not been uploaded to Python service yet'
      );
    }

    try {
      const invoiceExtract = await pythonAPIService.processInvoice(document.pythonJobId);
      return ApiResponseHelper.success(res, invoiceExtract, 'Invoice processed successfully');
    } catch (error) {
      logger.error('Invoice processing failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Invoice processing failed'
      );
    }
  }
);

/**
 * Get job processing status and logs
 */
export const getJobStatus = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const { pythonJobId } = req.query;

    if (!pythonJobId || typeof pythonJobId !== 'string') {
      return ApiResponseHelper.badRequest(res, 'Python job ID is required');
    }

    try {
      const status = await pythonAPIService.getJobStatus(pythonJobId);
      return ApiResponseHelper.success(res, status, 'Job status retrieved successfully');
    } catch (error: any) {
      // Check if it's a 404 error (job not found)
      const statusCode = error?.status || (error?.message?.includes('404') ? 404 : null);
      if (statusCode === 404 || error?.message?.includes('Job not found') || error?.message?.includes('not found')) {
        logger.warn(`Job not found: ${pythonJobId}`);
        return ApiResponseHelper.notFound(res, 'Job not found. The processing job may have expired or been cleared.');
      }
      
      logger.error('Failed to get job status:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Failed to get job status'
      );
    }
  }
);

/**
 * Verify/correct extracted fields (Human-in-the-Loop)
 */
export const verifyCorrections = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const { documentId, corrections, autoPromote } = req.body;

    if (!documentId) {
      return ApiResponseHelper.badRequest(res, 'Document ID is required');
    }

    if (!corrections || typeof corrections !== 'object') {
      return ApiResponseHelper.badRequest(res, 'Corrections object is required');
    }

    // Get document to verify ownership and get Python job ID
    const document = await getDocumentById(documentId, userId);
    if (!document) {
      return ApiResponseHelper.notFound(res, 'Document not found');
    }

    if (!document.pythonJobId) {
      return ApiResponseHelper.badRequest(
        res,
        'Document has not been processed yet'
      );
    }

    try {
      const verifyResponse = await pythonAPIService.verifyCorrections(
        {
          job_id: document.pythonJobId,
          corrections,
          user_id: userId,
        },
        autoPromote === true
      );

      return ApiResponseHelper.success(res, verifyResponse, 'Corrections applied successfully');
    } catch (error) {
      logger.error('Verification failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Verification failed'
      );
    }
  }
);

/**
 * Export invoice as CSV
 */
export const exportCSV = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const { documentId } = req.query;
    const erpType = (req.query.erp_type as string) || 'quickbooks';
    const skipSafetyCheck = req.query.skip_safety_check === 'true';

    if (!documentId || typeof documentId !== 'string') {
      return ApiResponseHelper.badRequest(res, 'Document ID is required');
    }

    // Get document to verify ownership and get Python job ID
    const document = await getDocumentById(documentId, userId);
    if (!document) {
      return ApiResponseHelper.notFound(res, 'Document not found');
    }

    if (!document.pythonJobId) {
      return ApiResponseHelper.badRequest(
        res,
        'Document has not been processed yet'
      );
    }

    try {
      const csvBlob = await pythonAPIService.exportCSV(
        document.pythonJobId,
        erpType,
        skipSafetyCheck
      );

      // Convert blob to text to potentially merge with database data
      const csvText = await csvBlob.text();
      
      // For now, we'll use the Python service CSV directly
      // But we could enhance this to merge database data if needed
      // The Python service already uses get_clean_invoice_data which normalizes line items
      
      const buffer = Buffer.from(csvText, 'utf-8');

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoice_${document.pythonJobId}.csv"`
      );
      res.setHeader('Content-Length', buffer.length);

      return res.send(buffer);
    } catch (error) {
      logger.error('CSV export failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'CSV export failed'
      );
    }
  }
);

/**
 * Export invoice as JSON
 */
export const exportJSON = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const { documentId } = req.query;

    if (!documentId || typeof documentId !== 'string') {
      return ApiResponseHelper.badRequest(res, 'Document ID is required');
    }

    // Get document to verify ownership and get Python job ID
    const document = await getDocumentById(documentId, userId);
    if (!document) {
      return ApiResponseHelper.notFound(res, 'Document not found');
    }

    if (!document.pythonJobId) {
      return ApiResponseHelper.badRequest(
        res,
        'Document has not been processed yet'
      );
    }

    try {
      const jsonBlob = await pythonAPIService.exportJSON(document.pythonJobId);

      // Convert blob to text and parse JSON
      const jsonText = await jsonBlob.text();
      let exportData = JSON.parse(jsonText);

      // Merge with latest database data (especially line items which may have been updated)
      if (document.extractedData) {
        // Update fields from database if they exist
        if (document.extractedData.invoiceNumber) {
          exportData.invoice_id = document.extractedData.invoiceNumber;
        }
        if (document.extractedData.vendorName) {
          exportData.vendor_name = document.extractedData.vendorName;
        }
        if (document.extractedData.vendorId) {
          exportData.vendor_id = document.extractedData.vendorId;
        }
        if (document.extractedData.invoiceDate) {
          exportData.invoice_date = document.extractedData.invoiceDate;
        }
        if (document.extractedData.totalAmount !== undefined) {
          exportData.total_amount = document.extractedData.totalAmount;
        }
        if (document.extractedData.amountSubtotal !== undefined) {
          exportData.amount_subtotal = document.extractedData.amountSubtotal;
        }
        if (document.extractedData.amountTax !== undefined) {
          exportData.amount_tax = document.extractedData.amountTax;
        }
        if (document.extractedData.currency) {
          exportData.currency = document.extractedData.currency;
        }

        // Merge line items from database (they are the source of truth after user edits)
        if (document.extractedData.lineItems && document.extractedData.lineItems.length > 0) {
          exportData.line_items = document.extractedData.lineItems
            .filter((item) => {
              // Filter out invalid line items
              const description = (item.description || '').trim();
              
              // Skip empty or invalid descriptions
              if (!description || description in ['-', '--', '---', 'N/A', 'n/a', '']) {
                return false;
              }
              
              // Skip common non-item phrases
              const descriptionLower = description.toLowerCase();
              const nonItemPhrases = [
                'sales', 'tax', 'subtotal', 'total', 'amount', 'payment', 'terms',
                'many thanks', 'thank you', 'thanks for', 'thanks foryour', 'thanks for your',
                'thanks for your business', 'thank you for your business', 'thanks foryour business',
                'to be received', 'within', 'days',
                'please find', 'cost-breakdown', 'work completed', 'earliest convenience',
                'do not hesitate', 'contact me', 'questions', 'dear', 'ms.', 'mr.',
                'your name', 'sincerely', 'regards', 'best regards',
                'look forward', 'doing business', 'due course', 'custom',
                'find below', 'make payment', 'contact', 'hesitate',
                'for your business', 'for business', 'your business'
              ];
              
              if (nonItemPhrases.some(phrase => descriptionLower.includes(phrase))) {
                return false;
              }
              
              // Skip if description is too short and has no meaningful data
              if (description.length < 3 && !item.quantity && !item.unitPrice && !item.total) {
                return false;
              }
              
              // Skip if it's clearly not a line item (no numbers and generic description)
              if (!item.quantity && !item.unitPrice && !item.total) {
                if (description.length < 5 || ['sales', 'tax', 'subtotal', 'total'].includes(descriptionLower)) {
                  return false;
                }
              }
              
              // Only include if we have at least some meaningful data
              return !!(item.quantity || item.unitPrice || item.total);
            })
            .map((item) => {
            const normalizedItem: {
              description: string;
              quantity?: number;
              unit_price?: number;
              total?: number;
            } = {
              description: item.description || '',
            };

            // Normalize quantity: default to 1 if unit_price exists but quantity is missing
            if (item.unitPrice !== undefined && item.unitPrice !== null) {
              normalizedItem.unit_price = item.unitPrice;
              normalizedItem.quantity = item.quantity !== undefined && item.quantity !== null 
                ? item.quantity 
                : 1; // Default to 1 if missing
            } else if (item.quantity !== undefined && item.quantity !== null) {
              normalizedItem.quantity = item.quantity;
            }

            // Calculate total if quantity and unit_price exist but total is missing
            if (normalizedItem.quantity !== undefined && normalizedItem.unit_price !== undefined) {
              normalizedItem.total = item.total !== undefined && item.total !== null
                ? item.total
                : normalizedItem.quantity * normalizedItem.unit_price;
            } else if (item.total !== undefined && item.total !== null) {
              normalizedItem.total = item.total;
            }

            return normalizedItem;
          });
        }
      }

      // Convert back to JSON string
      const mergedJson = JSON.stringify(exportData, null, 2);
      const buffer = Buffer.from(mergedJson, 'utf-8');

      // Set headers for JSON download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoice_${document.pythonJobId}.json"`
      );
      res.setHeader('Content-Length', buffer.length);

      return res.send(buffer);
    } catch (error) {
      logger.error('JSON export failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'JSON export failed'
      );
    }
  }
);

/**
 * Get aggregate system metrics
 */
export const getMetrics = asyncHandler(
  async (_req: AuthRequest, res: Response): Promise<Response> => {
    try {
      const metrics = await pythonAPIService.getMetrics();
      return ApiResponseHelper.success(res, metrics, 'Metrics retrieved successfully');
    } catch (error) {
      logger.error('Metrics retrieval failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Metrics retrieval failed'
      );
    }
  }
);

/**
 * Get review queue (flagged invoices for manual review)
 */
export const getReviewQueue = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const limit = parseInt((req.query.limit as string) || '20', 10);

    try {
      const reviewQueue = await pythonAPIService.getReviewQueue(limit);
      return ApiResponseHelper.success(res, reviewQueue, 'Review queue retrieved successfully');
    } catch (error) {
      logger.error('Review queue retrieval failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Review queue retrieval failed'
      );
    }
  }
);

/**
 * Apply review corrections
 */
export const applyReviewCorrections = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const { id } = req.params;
    const { corrections, autoPromote } = req.body;

    if (!corrections || typeof corrections !== 'object') {
      return ApiResponseHelper.badRequest(res, 'Corrections object is required');
    }

    try {
      const verifyResponse = await pythonAPIService.applyReviewCorrections(
        id,
        corrections,
        userId,
        autoPromote === true
      );

      return ApiResponseHelper.success(res, verifyResponse, 'Review corrections applied successfully');
    } catch (error) {
      logger.error('Review correction application failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Review correction application failed'
      );
    }
  }
);

/**
 * Rollback corrections
 */
export const rollbackCorrections = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const { id } = req.params;

    try {
      const rollbackResponse = await pythonAPIService.rollbackCorrections(id, userId);
      return ApiResponseHelper.success(res, rollbackResponse, 'Corrections rolled back successfully');
    } catch (error) {
      logger.error('Rollback failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Rollback failed'
      );
    }
  }
);

/**
 * Get audit log for a document
 */
export const getAuditLog = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const { id } = req.params;

    // Get document to verify ownership
    const document = await getDocumentById(id, userId);
    if (!document) {
      return ApiResponseHelper.notFound(res, 'Document not found');
    }

    if (!document.pythonJobId) {
      return ApiResponseHelper.badRequest(
        res,
        'Document has not been processed yet'
      );
    }

    try {
      const auditLog = await pythonAPIService.getAuditLog(document.pythonJobId);
      return ApiResponseHelper.success(res, auditLog, 'Audit log retrieved successfully');
    } catch (error) {
      logger.error('Audit log retrieval failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Audit log retrieval failed'
      );
    }
  }
);

/**
 * Promote vendor (canonicalization)
 */
export const promoteVendor = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const { vendorName, canonicalId } = req.body;

    if (!vendorName || typeof vendorName !== 'string') {
      return ApiResponseHelper.badRequest(res, 'Vendor name is required');
    }

    try {
      const promoteResponse = await pythonAPIService.promoteVendor(vendorName, canonicalId);
      return ApiResponseHelper.success(res, promoteResponse, 'Vendor promoted successfully');
    } catch (error) {
      logger.error('Vendor promotion failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Vendor promotion failed'
      );
    }
  }
);

/**
 * Serve uploaded file for preview
 */
export const serveUploadedFile = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const { filename } = req.params;

    // Security: Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return ApiResponseHelper.badRequest(res, 'Invalid filename');
    }

    try {
      // Try to find document by filename to verify ownership
      const { Document } = await import('../models/Document.model.js');
      let document = await Document.findOne({
        fileName: filename,
        userId,
      });

      // If not found by fileName, try by originalFileName (for backwards compatibility)
      if (!document) {
        document = await Document.findOne({
          originalFileName: filename,
          userId,
        });
      }

      if (!document) {
        logger.error(`Document not found for filename: ${filename}, userId: ${userId}`);
        return ApiResponseHelper.notFound(res, 'File not found');
      }

      // Multer's file.path is the full absolute path to the uploaded file
      // Try multiple path resolution strategies
      const { STORAGE_BASE_PATH } = await import('../config/storage.js');
      let filePath: string | null = null;
      const triedPaths: string[] = [];

      // Strategy 1: Use filePath as stored (might be absolute from multer)
      triedPaths.push(document.filePath);
      try {
        await fs.access(document.filePath);
        filePath = document.filePath;
      } catch {
        // Strategy 2: Join with STORAGE_BASE_PATH (if relative)
        const relativePath = path.join(STORAGE_BASE_PATH, document.filePath);
        triedPaths.push(relativePath);
        try {
          await fs.access(relativePath);
          filePath = relativePath;
        } catch {
          // Strategy 3: If filePath contains 'uploads', use it directly with STORAGE_BASE_PATH
          if (document.filePath.includes('uploads')) {
            const uploadsPath = path.join(STORAGE_BASE_PATH, document.filePath);
            triedPaths.push(uploadsPath);
            try {
              await fs.access(uploadsPath);
              filePath = uploadsPath;
            } catch {
              // Strategy 4: Extract just the filename and reconstruct path
              const fileName = path.basename(document.filePath);
              const fileType = document.fileType === 'pdf' ? 'pdfs' : 'images';
              const reconstructedPath = path.join(STORAGE_BASE_PATH, 'uploads', fileType, fileName);
              triedPaths.push(reconstructedPath);
              try {
                await fs.access(reconstructedPath);
                filePath = reconstructedPath;
              } catch {
                filePath = null;
              }
            }
          }
        }
      }

      if (!filePath) {
        logger.error(`File not found for document ${document._id}. Tried paths: ${triedPaths.join(', ')}`);
        logger.error(`Document filePath: ${document.filePath}, fileName: ${document.fileName}`);
        return ApiResponseHelper.notFound(res, `File not found on disk. Tried: ${triedPaths.join(', ')}`);
      }

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.tiff': 'image/tiff',
        '.webp': 'image/webp',
      };

      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${document.originalFileName}"`);

      // Stream file
      const fileBuffer = await fs.readFile(filePath);
      return res.send(fileBuffer);
    } catch (error) {
      logger.error('File serving failed:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'File serving failed'
      );
    }
  }
);

