import { PubSub } from '@google-cloud/pubsub';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface EmailInvoiceMessage {
  emailId: string;
  messageId: string;
  from: string;
  subject: string;
  receivedAt: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    data: string; // Base64 encoded
  }>;
  userId?: string; // Optional: if email is associated with a user
}

class PubSubService {
  private pubsub: PubSub | null = null;
  private topic: any = null;

  constructor() {
    if (env.pubsub.projectId) {
      try {
        this.pubsub = new PubSub({
          projectId: env.pubsub.projectId,
          ...(env.pubsub.credentialsPath && {
            keyFilename: env.pubsub.credentialsPath,
          }),
        });
        logger.info('Pub/Sub client initialized');
      } catch (error) {
        logger.error('Failed to initialize Pub/Sub client:', error);
      }
    } else {
      logger.warn('Pub/Sub project ID not configured, Pub/Sub features disabled');
    }
  }

  async initializeTopic(): Promise<void> {
    if (!this.pubsub) {
      throw new Error('Pub/Sub client not initialized');
    }

    try {
      // Check if topic exists, create if not
      const topicName = env.pubsub.topicName;
      this.topic = this.pubsub.topic(topicName);

      const [exists] = await this.topic.exists();
      if (!exists) {
        await this.topic.create();
        logger.info(`Created Pub/Sub topic: ${topicName}`);
      } else {
        logger.info(`Using existing Pub/Sub topic: ${topicName}`);
      }
    } catch (error) {
      logger.error('Failed to initialize Pub/Sub topic:', error);
      throw error;
    }
  }

  async publishEmailInvoice(message: EmailInvoiceMessage): Promise<string> {
    if (!this.topic) {
      await this.initializeTopic();
    }

    if (!this.topic) {
      throw new Error('Pub/Sub topic not initialized');
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const messageId = await this.topic.publishMessage({
        data: messageBuffer,
        attributes: {
          emailId: message.emailId,
          messageId: message.messageId,
          from: message.from,
          subject: message.subject,
        },
      });

      logger.info(`Published email invoice message: ${messageId} for email: ${message.emailId}`);
      return messageId;
    } catch (error) {
      logger.error('Failed to publish message to Pub/Sub:', error);
      throw error;
    }
  }

  async createSubscriptionIfNotExists(): Promise<void> {
    if (!this.pubsub) {
      throw new Error('Pub/Sub client not initialized');
    }

    if (!this.topic) {
      await this.initializeTopic();
    }

    try {
      const subscriptionName = env.pubsub.subscriptionName;
      const subscription = this.pubsub.subscription(subscriptionName);

      const [exists] = await subscription.exists();
      if (!exists) {
        await this.topic!.createSubscription(subscriptionName);
        logger.info(`Created Pub/Sub subscription: ${subscriptionName}`);
      } else {
        logger.info(`Using existing Pub/Sub subscription: ${subscriptionName}`);
      }
    } catch (error) {
      logger.error('Failed to create subscription:', error);
      throw error;
    }
  }

  getSubscription() {
    if (!this.pubsub) {
      throw new Error('Pub/Sub client not initialized');
    }

    return this.pubsub.subscription(env.pubsub.subscriptionName);
  }

  isInitialized(): boolean {
    return this.pubsub !== null;
  }
}

export const pubsubService = new PubSubService();

