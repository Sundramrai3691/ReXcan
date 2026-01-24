import { pubsubService, EmailInvoiceMessage } from '../services/pubsub.service.js';
import { emailService } from '../services/email.service.js';
import { emailInvoiceService } from '../services/email-invoice.service.js';
import { logger } from '../utils/logger.js';

/**
 * Worker that subscribes to Pub/Sub messages for email invoices
 * and processes them through the document processing pipeline
 */
export class EmailPubSubWorker {
  private isRunning: boolean = false;
  private messageHandler: ((message: any) => Promise<void>) | null = null;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Email Pub/Sub worker is already running');
      return;
    }

    if (!pubsubService.isInitialized()) {
      logger.warn('Pub/Sub service not initialized, skipping email worker');
      return;
    }

    try {
      // Ensure subscription exists
      await pubsubService.createSubscriptionIfNotExists();

      const subscription = pubsubService.getSubscription();

      // Message handler
      this.messageHandler = async (message: any) => {
        try {
          const data = JSON.parse(message.data.toString()) as EmailInvoiceMessage;
          logger.info(`Processing email invoice message: ${data.emailId}`);

          // Process each attachment as a document
          for (const attachment of data.attachments) {
            try {
              await emailInvoiceService.processEmailAttachment(
                attachment,
                data.emailId,
                data.from,
                data.subject,
                data.userId
              );
            } catch (error) {
              logger.error(
                `Error processing attachment ${attachment.filename} from email ${data.emailId}:`,
                error
              );
              // Continue processing other attachments
            }
          }

          // Mark email as processed
          await emailService.markEmailAsProcessed(data.emailId);

          // Acknowledge message
          message.ack();
          logger.info(`Successfully processed email invoice: ${data.emailId}`);
        } catch (error) {
          logger.error('Error processing Pub/Sub message:', error);
          // Nack the message to retry
          message.nack();
        }
      };

      // Listen for messages
      subscription.on('message', this.messageHandler);

      subscription.on('error', (error: Error) => {
        logger.error('Pub/Sub subscription error:', error);
      });

      this.isRunning = true;
      logger.info('Email Pub/Sub worker started');
    } catch (error) {
      logger.error('Failed to start Email Pub/Sub worker:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const subscription = pubsubService.getSubscription();
      if (this.messageHandler) {
        subscription.removeListener('message', this.messageHandler);
      }
      this.isRunning = false;
      logger.info('Email Pub/Sub worker stopped');
    } catch (error) {
      logger.error('Error stopping Email Pub/Sub worker:', error);
      throw error;
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const emailPubSubWorker = new EmailPubSubWorker();

