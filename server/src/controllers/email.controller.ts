import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { emailService } from '../services/email.service.js';
import { pubsubService } from '../services/pubsub.service.js';
import { ApiResponseHelper } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { AuthRequest } from '../types/auth.types.js';

/**
 * Manually trigger email fetching and publish to Pub/Sub
 */
export const fetchAndPublishEmails = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    const maxResults = parseInt((req.query.maxResults as string) || '10', 10);

    try {
      // Check if email service is initialized
      if (!emailService.isInitialized()) {
        return ApiResponseHelper.badRequest(
          res,
          'Email service is not configured. Please configure email settings in environment variables.'
        );
      }

      // Check if Pub/Sub is initialized
      if (!pubsubService.isInitialized()) {
        return ApiResponseHelper.badRequest(
          res,
          'Pub/Sub service is not configured. Please configure Pub/Sub settings in environment variables.'
        );
      }

      // Fetch emails with attachments
      logger.info(`Fetching emails for user: ${userId}`);
      const emailMessages = await emailService.fetchEmailsWithAttachments(maxResults);

      if (emailMessages.length === 0) {
        return ApiResponseHelper.success(
          res,
          { emailsProcessed: 0, messagesPublished: 0 },
          'No emails with invoice attachments found'
        );
      }

      // Publish each email to Pub/Sub
      const publishedMessages: string[] = [];
      for (const emailMessage of emailMessages) {
        try {
          // Associate email with user
          emailMessage.userId = userId;

          const messageId = await pubsubService.publishEmailInvoice(emailMessage);
          publishedMessages.push(messageId);
        } catch (error) {
          logger.error(
            `Failed to publish email ${emailMessage.emailId} to Pub/Sub:`,
            error
          );
          // Continue with other emails
        }
      }

      logger.info(
        `Published ${publishedMessages.length} email messages to Pub/Sub for user: ${userId}`
      );

      return ApiResponseHelper.success(
        res,
        {
          emailsProcessed: emailMessages.length,
          messagesPublished: publishedMessages.length,
          messageIds: publishedMessages,
        },
        `Successfully fetched and published ${publishedMessages.length} email(s) to Pub/Sub`
      );
    } catch (error) {
      logger.error('Error fetching and publishing emails:', error);
      return ApiResponseHelper.internalError(
        res,
        error instanceof Error ? error.message : 'Failed to fetch and publish emails'
      );
    }
  }
);

/**
 * Get email service status
 */
export const getEmailStatus = asyncHandler(
  async (_req: AuthRequest, res: Response): Promise<Response> => {
    const emailInitialized = emailService.isInitialized();
    const pubsubInitialized = pubsubService.isInitialized();

    return ApiResponseHelper.success(
      res,
      {
        email: {
          initialized: emailInitialized,
          provider: emailInitialized ? emailService.getProvider() : null,
        },
        pubsub: {
          initialized: pubsubInitialized,
        },
      },
      'Email service status retrieved'
    );
  }
);

