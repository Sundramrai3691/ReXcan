/**
 * Invoice Processing Routes
 * 
 * Routes for invoice processing endpoints that interact with the Python FastAPI service.
 */

import { Router } from 'express';
import {
  getHealth,
  runOCR,
  processInvoice,
  getJobStatus,
  verifyCorrections,
  exportCSV,
  exportJSON,
  getMetrics,
  getReviewQueue,
  applyReviewCorrections,
  rollbackCorrections,
  getAuditLog,
  promoteVendor,
  serveUploadedFile,
} from '../controllers/invoice.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// Health check (public, but can be authenticated)
router.get('/health', authenticate, getHealth);

// OCR and processing endpoints
router.post('/ocr', authenticate, runOCR);
router.post('/process', authenticate, processInvoice);
router.get('/status', authenticate, getJobStatus);

// Human-in-the-loop endpoints
router.post('/verify', authenticate, verifyCorrections);

// Export endpoints
router.get('/export/csv', authenticate, exportCSV);
router.get('/export/json', authenticate, exportJSON);

// Metrics endpoint
router.get('/metrics', authenticate, getMetrics);

// Review queue endpoints
router.get('/review/queue', authenticate, getReviewQueue);
router.post('/review/:id/apply', authenticate, applyReviewCorrections);
router.post('/review/:id/rollback', authenticate, rollbackCorrections);

// Audit log endpoint
router.get('/audit/:id', authenticate, getAuditLog);

// Vendor management endpoint
router.post('/vendor/promote', authenticate, promoteVendor);

// File serving endpoint
router.get('/uploads/:filename', authenticate, serveUploadedFile);

export { router as invoiceRoutes };

