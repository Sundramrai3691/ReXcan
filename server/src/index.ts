import app from './app.js';
import { env } from './config/env.js';
import { database } from './config/database.js';
import { logger } from './utils/logger.js';
import { initializeStorage } from './config/storage.js';

const startServer = async (): Promise<void> => {
  try {
    // Initialize storage directories
    await initializeStorage();

    // Connect to database
    await database.connect();

    // Create and start server
    const expressApp = app();
    expressApp.listen(env.port, () => {
      logger.info(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      void database.disconnect().then(() => {
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT signal received: closing HTTP server');
      void database.disconnect().then(() => {
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

void startServer();

