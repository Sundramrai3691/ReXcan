import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const STORAGE_BASE_PATH = path.resolve(__dirname, '../../', env.storage.basePath);

// Ensure storage directories exist
export const initializeStorage = async (): Promise<void> => {
  try {
    const directories = [
      STORAGE_BASE_PATH,
      path.join(STORAGE_BASE_PATH, 'uploads'),
      path.join(STORAGE_BASE_PATH, 'uploads', 'pdfs'),
      path.join(STORAGE_BASE_PATH, 'uploads', 'images'),
      path.join(STORAGE_BASE_PATH, 'processed'),
    ];

    for (const dir of directories) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        logger.info(`Created storage directory: ${dir}`);
      }
    }

    logger.info('Storage directories initialized');
  } catch (error) {
    logger.error('Failed to initialize storage directories:', error);
    throw error;
  }
};

export const getUploadPath = (fileType: 'pdf' | 'image'): string => {
  return path.join(STORAGE_BASE_PATH, 'uploads', fileType === 'pdf' ? 'pdfs' : 'images');
};

export const generateFileName = (originalFileName: string, userId: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const ext = path.extname(originalFileName);
  const baseName = path.basename(originalFileName, ext);
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${userId}_${timestamp}_${randomString}_${sanitizedBaseName}${ext}`;
};

