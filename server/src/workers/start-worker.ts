import { database } from '../config/database.js';
import { initializeStorage } from '../config/storage.js';
import { logger } from '../utils/logger.js';
import { startWorkers } from './index.js';

const startWorkerProcess = async (): Promise<void> => {
  try {
    logger.info('Starting worker process...');

    // Initialize storage directories
    await initializeStorage();

    // Connect to database
    await database.connect();

    // Start workers
    startWorkers();

    logger.info('Worker process started successfully');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: shutting down worker');
      await database.disconnect();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT signal received: shutting down worker');
      await database.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start worker process:', error);
    process.exit(1);
  }
};

void startWorkerProcess();

