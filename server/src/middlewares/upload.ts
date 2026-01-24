import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { getUploadPath, generateFileName } from '../config/storage.js';
import { DocumentType } from '../models/Document.model.js';

// File filter to only allow images and PDFs
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    // PDFs
    'application/pdf',
  ];

  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];

  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isValidMimeType = allowedMimeTypes.includes(file.mimetype);
  const isValidExtension = allowedExtensions.includes(fileExtension);

  if (isValidMimeType && isValidExtension) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`
      ) as unknown as null,
      false
    );
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    try {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const fileType: 'pdf' | 'image' = fileExtension === '.pdf' ? 'pdf' : 'image';
      const uploadPath = getUploadPath(fileType);
      cb(null, uploadPath);
    } catch (error) {
      cb(error as Error, '');
    }
  },
  filename: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    try {
      // Get userId from request (set by authenticate middleware)
      const user = (req as any).user;
      const userId = user?._id?.toString() || user?.id || 'anonymous';
      const fileName = generateFileName(file.originalname, userId);
      cb(null, fileName);
    } catch (error) {
      cb(error as Error, '');
    }
  },
});

// Multer configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 1, // Single file upload
  },
});

// Multer configuration for batch uploads
export const uploadBatch = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size per file
    files: 50, // Allow up to 50 files in batch
  },
});

// Middleware for single file upload
export const uploadSingle = upload.single('file');

// Middleware for batch file upload
export const uploadMultiple = uploadBatch.array('files', 50);

