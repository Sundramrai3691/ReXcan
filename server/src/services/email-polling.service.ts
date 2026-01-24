import { emailService } from './email.service.js';
import { pubsubService } from './pubsub.service.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Service to automatically poll emails and publish to Pub/Sub
 * This can run as a background service
 */
export class EmailPollingService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private userId?: string; // Optional: if polling for a specific user

  /**
   * Start polling emails at configured interval
   */
  start(userId?: string): void {
    if (this.isPolling) {
      logger.warn('Email polling service is already running');
      return;
    }

    if (!emailService.isInitialized()) {
      logger.warn('Email service not initialized, cannot start polling');
      return;
    }

    if (!pubsubService.isInitialized()) {
      logger.warn('Pub/Sub service not initialized, cannot start polling');
      return;
    }

    this.userId = userId;
    this.isPolling = true;

    // Poll immediately
    this.pollEmails();

    // Then poll at configured interval
    this.pollingInterval = setInterval(() => {
      this.pollEmails();
    }, env.email.pollInterval);

    logger.info(
      `Email polling service started (interval: ${env.email.pollInterval}ms)`
    );
  }

  /**
   * Stop polling emails
   */
  stop(): void {
    if (!this.isPolling) {
      return;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.isPolling = false;
    logger.info('Email polling service stopped');
  }

  /**
   * Poll emails and publish to Pub/Sub
   */
  private async pollEmails(): Promise<void> {
    try {
      logger.info('Polling emails for invoice attachments...');
      const emailMessages = await emailService.fetchEmailsWithAttachments(10);

      if (emailMessages.length === 0) {
        logger.debug('No emails with invoice attachments found');
        return;
      }

      logger.info(`Found ${emailMessages.length} email(s) with invoice attachments`);

      // Publish each email to Pub/Sub
      for (const emailMessage of emailMessages) {
        try {
          // Associate with user if provided
          if (this.userId) {
            emailMessage.userId = this.userId;
          }

          await pubsubService.publishEmailInvoice(emailMessage);
          logger.info(`Published email ${emailMessage.emailId} to Pub/Sub`);
        } catch (error) {
          logger.error(
            `Failed to publish email ${emailMessage.emailId} to Pub/Sub:`,
            error
          );
        }
      }
    } catch (error) {
      logger.error('Error polling emails:', error);
    }
  }

  isActive(): boolean {
    return this.isPolling;
  }
}

export const emailPollingService = new EmailPollingService();

