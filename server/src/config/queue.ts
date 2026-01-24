import { Queue } from 'bullmq';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export enum QueueName {
  DOCUMENT_PROCESSING = 'document-processing',
}

interface QueueConfig {
  connection: {
    host: string;
    port: number;
    password?: string;
  };
}

const getQueueConfig = (): QueueConfig => {
  return {
    connection: {
      host: env.redis.host,
      port: env.redis.port,
      ...(env.redis.password && { password: env.redis.password }),
    },
  };
};

// Create queue instances
export const documentProcessingQueue = new Queue<DocumentJobData>(
  QueueName.DOCUMENT_PROCESSING,
  {
    connection: getQueueConfig().connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep max 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  }
);

// Queue event listeners
documentProcessingQueue.on('error', (error) => {
  logger.error('Queue error:', error);
});

documentProcessingQueue.on('waiting', (job) => {
  logger.info(`Job ${job.id} is waiting`);
});

documentProcessingQueue.on('active', (job) => {
  logger.info(`Job ${job.id} is now active`);
});

documentProcessingQueue.on('completed', (job) => {
  logger.info(`Job ${job.id} has completed`);
});

documentProcessingQueue.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} has failed:`, err);
});

export interface DocumentJobData {
  documentId: string;
  userId: string;
  filePath: string;
  fileType: 'pdf' | 'image';
  fileName: string;
  selectedModel?: string; // AI model: 'gemini', 'openai', 'groq', 'claude', 'rexcan', 'best'
}

export const addDocumentToQueue = async (data: DocumentJobData): Promise<string> => {
  const job = await documentProcessingQueue.add('process-document', data, {
    jobId: `doc-${data.documentId}`,
  });
  logger.info(`Document ${data.documentId} added to queue with job ID: ${job.id}`);
  return job.id!;
};

