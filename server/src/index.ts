import { env } from './config/env.js';
import { database } from './config/database.js';
import { logger } from './utils/logger.js';
import { initializeStorage } from './config/storage.js';
import { validateExternalDepsOrExit } from './startup/validate.js';

process.on('unhandledRejection', (err) => {
  // eslint-disable-next-line no-console
  console.error('UNHANDLED_REJECTION', err);
});

const startServer = async (): Promise<void> => {
  try {
    // Initialize storage directories
    await initializeStorage();

    // Connect to database
    await database.connect();

    // Validate external dependencies (Redis ping, etc.) before importing modules
    await validateExternalDepsOrExit();

    // Import app after validation to avoid modules instantiating queues/workers
    const { default: app } = await import('./app.js');

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

