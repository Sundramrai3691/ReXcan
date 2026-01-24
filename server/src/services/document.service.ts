import { Document, DocumentType, DocumentStatus, IDocument } from '../models/Document.model.js';
import { addDocumentToQueue, DocumentJobData } from '../config/queue.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';
import { STORAGE_BASE_PATH } from '../config/storage.js';

export interface CreateDocumentInput {
  userId: string;
  fileName: string;
  originalFileName: string;
  filePath: string;
  fileType: DocumentType;
  mimeType: string;
  fileSize: number;
  selectedModel?: string; // AI model: 'gemini', 'openai', 'groq', 'claude', 'rexcan', 'best'
  batchId?: string; // Optional batch ID for batch uploads
}

export const createDocument = async (
  input: CreateDocumentInput
): Promise<{ document: IDocument; jobId: string }> => {
  try {
    // Create document record
    const document = new Document({
      ...input,
      status: DocumentStatus.UPLOADED,
      batchId: input.batchId,
    });

    await document.save();
    logger.info(`Document created: ${(document._id as { toString: () => string }).toString()}`);

    // Add to processing queue
    const jobData: DocumentJobData = {
      documentId: (document._id as { toString: () => string }).toString(),
      userId: input.userId,
      filePath: input.filePath,
      fileType: input.fileType === DocumentType.PDF ? 'pdf' : 'image',
      fileName: input.fileName,
      selectedModel: input.selectedModel || 'best', // Default to 'best' if not specified
    };

    // Store the selected model in the document
    if (input.selectedModel) {
      document.selectedModel = input.selectedModel;
      await document.save();
    }

    const jobId = await addDocumentToQueue(jobData);

    // Update document with queue job ID and status
    document.queueJobId = jobId;
    document.status = DocumentStatus.QUEUED;
    await document.save();

    return { document, jobId };
  } catch (error) {
    logger.error('Error creating document:', error);
    throw error;
  }
};

export const getDocumentById = async (
  documentId: string,
  userId: string
): Promise<IDocument | null> => {
  try {
    const document = await Document.findOne({
      _id: documentId,
      userId,
    });

    return document;
  } catch (error) {
    logger.error('Error fetching document:', error);
    throw error;
  }
};

export const getUserDocuments = async (
  userId: string,
  limit: number = 50,
  skip: number = 0
): Promise<{ documents: IDocument[]; total: number }> => {
  try {
    const [documents, total] = await Promise.all([
      Document.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      Document.countDocuments({ userId }),
    ]);

    return { documents, total };
  } catch (error) {
    logger.error('Error fetching user documents:', error);
    throw error;
  }
};

export const getDocumentsByBatchId = async (
  batchId: string,
  userId: string
): Promise<IDocument[]> => {
  try {
    const documents = await Document.find({
      batchId,
      userId,
    }).sort({ createdAt: -1 });

    return documents;
  } catch (error) {
    logger.error('Error fetching documents by batch ID:', error);
    throw error;
  }
};

export const updateDocumentStatus = async (
  documentId: string,
  status: DocumentStatus,
  errorMessage?: string
): Promise<IDocument | null> => {
  try {
    const updateData: any = { status };
    if (status === DocumentStatus.PROCESSED) {
      updateData.processedAt = new Date();
    }
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    const document = await Document.findByIdAndUpdate(documentId, updateData, {
      new: true,
    });

    return document;
  } catch (error) {
    logger.error('Error updating document status:', error);
    throw error;
  }
};

export const updateDocumentExtractedData = async (
  documentId: string,
  extractedData: IDocument['extractedData']
): Promise<IDocument | null> => {
  try {
    const document = await Document.findByIdAndUpdate(
      documentId,
      { extractedData },
      { new: true }
    );

    return document;
  } catch (error) {
    logger.error('Error updating document extracted data:', error);
    throw error;
  }
};

export const deleteDocument = async (
  documentId: string,
  userId: string
): Promise<boolean> => {
  try {
    // Find document and verify ownership
    const document = await Document.findOne({
      _id: documentId,
      userId,
    });

    if (!document) {
      logger.warn(`Document not found or access denied: ${documentId} for user: ${userId}`);
      return false;
    }

    // Delete the file from storage
    try {
      // Try multiple path resolution strategies (same as in serveUploadedFile)
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
              const fileType = document.fileType === DocumentType.PDF ? 'pdfs' : 'images';
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

      if (filePath) {
        await fs.unlink(filePath);
        logger.info(`Deleted file: ${filePath} for document: ${documentId}`);
      } else {
        logger.warn(`File not found for document ${documentId}. Tried paths: ${triedPaths.join(', ')}`);
        // Continue with database deletion even if file is missing
      }
    } catch (fileError) {
      logger.error(`Error deleting file for document ${documentId}:`, fileError);
      // Continue with database deletion even if file deletion fails
    }

    // Delete document from database
    await Document.findByIdAndDelete(documentId);
    logger.info(`Deleted document: ${documentId} for user: ${userId}`);

    return true;
  } catch (error) {
    logger.error('Error deleting document:', error);
    throw error;
  }
};

