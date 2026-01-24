import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  uploadDocument,
  uploadDocumentsBatch,
  getDocuments,
  getDocument,
  updateDocument,
  getBatchStatus,
  deleteDocumentController,
} from '../controllers/document.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { uploadSingle, uploadMultiple } from '../middlewares/upload.js';
import { ApiResponseHelper } from '../utils/apiResponse.js';

const router = Router();

// Multer error handler
const handleMulterError = (
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): Response | void => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return ApiResponseHelper.badRequest(res, 'File size exceeds the maximum limit of 50MB');
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return ApiResponseHelper.badRequest(res, 'Too many files. Maximum 50 files allowed in batch');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return ApiResponseHelper.badRequest(res, 'Unexpected file field. Use "file" as the field name');
    }
    return ApiResponseHelper.badRequest(res, `Upload error: ${err.message}`);
  }
  if (err) {
    return ApiResponseHelper.badRequest(res, err.message);
  }
  next();
};

// All document routes require authentication
router.use(authenticate);

// Upload document (image or PDF)
router.post('/upload', uploadSingle, handleMulterError, uploadDocument);

// Batch upload documents
router.post('/upload/batch', uploadMultiple, handleMulterError, uploadDocumentsBatch);

// Get batch status
router.get('/batch/:batchId', getBatchStatus);

// Get user's documents
router.get('/', getDocuments);

// Get single document by ID
router.get('/:id', getDocument);

// Update document extracted data
router.patch('/:id', updateDocument);
router.put('/:id', updateDocument);

// Delete document
router.delete('/:id', deleteDocumentController);

export { router as documentRoutes };

