import { documentWorker } from './document.worker.js';
import { emailPubSubWorker } from './email-pubsub.worker.js';
import { logger } from '../utils/logger.js';

export const startWorkers = (): void => {
  logger.info('Starting document processing workers...');
  // Workers are automatically started when imported
  // Additional worker initialization can be added here if needed

  // Start email Pub/Sub worker if configured
  if (emailPubSubWorker) {
    emailPubSubWorker.start().catch((error) => {
      logger.error('Failed to start email Pub/Sub worker:', error);
    });
  }
};

export { documentWorker, emailPubSubWorker };

