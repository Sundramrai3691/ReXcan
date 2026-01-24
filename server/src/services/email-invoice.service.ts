import { createDocument } from './document.service.js';
import { logger } from '../utils/logger.js';
import { DocumentType } from '../models/Document.model.js';
import path from 'path';
import fs from 'fs/promises';
import { STORAGE_BASE_PATH } from '../config/storage.js';
import { randomUUID } from 'crypto';

interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  data: string; // Base64 encoded
}

/**
 * Service to process email attachments and create documents
 */
export class EmailInvoiceService {
  /**
   * Process an email attachment and create a document for processing
   */
  async processEmailAttachment(
    attachment: EmailAttachment,
    emailId: string,
    _from: string,
    _subject: string,
    userId?: string
  ): Promise<void> {
    try {
      // Decode base64 data
      const fileBuffer = Buffer.from(attachment.data, 'base64');

      // Determine file type
      const fileExtension = path.extname(attachment.filename).toLowerCase();
      const fileType =
        fileExtension === '.pdf' ? DocumentType.PDF : DocumentType.IMAGE;

      // Generate unique filename
      const uniqueId = randomUUID();
      const safeFilename = `${uniqueId}${fileExtension}`;

      // Determine storage path based on file type
      const fileTypeDir = fileType === DocumentType.PDF ? 'pdfs' : 'images';
      const storageDir = path.join(STORAGE_BASE_PATH, 'uploads', fileTypeDir);
      await fs.mkdir(storageDir, { recursive: true });

      const filePath = path.join(storageDir, safeFilename);

      // Save file to storage
      await fs.writeFile(filePath, fileBuffer);

      logger.info(`Saved email attachment to: ${filePath}`);

      // If userId is provided, create document for that user
      // Otherwise, we need a default/system user or handle differently
      if (!userId) {
        logger.warn(
          `No userId provided for email ${emailId}, skipping document creation`
        );
        // TODO: You might want to create a system user or handle unauthenticated emails differently
        return;
      }

      // Create document record
      const relativeFilePath = path.join('uploads', fileTypeDir, safeFilename);

      await createDocument({
        userId,
        fileName: safeFilename,
        originalFileName: attachment.filename,
        filePath: relativeFilePath,
        fileType,
        mimeType: attachment.contentType,
        fileSize: attachment.size,
        selectedModel: 'best', // Default model
      });

      logger.info(
        `Created document from email attachment: ${attachment.filename} from email ${emailId}`
      );
    } catch (error) {
      logger.error(
        `Error processing email attachment ${attachment.filename}:`,
        error
      );
      throw error;
    }
  }
}

export const emailInvoiceService = new EmailInvoiceService();

