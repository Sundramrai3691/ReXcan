import { Queue } from 'bullmq';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export enum QueueName {
  DOCUMENT_PROCESSING = 'document-processing',
}

export interface DocumentJobData {
  documentId: string;
  userId: string;
  filePath: string;
  fileType: 'pdf' | 'image';
  fileName: string;
  selectedModel?: string; // AI model: 'gemini', 'openai', 'groq', 'claude', 'rexcan', 'best'
}

interface QueueConfig {
  connection: {

    url?: string;
    host?: string;
    port?: number;
    password?: string;
    family?: number;
    enableReadyCheck?: boolean;
    maxRetriesPerRequest?: number | null;
    retryStrategy?: (times: number) => number;
    tls?: { servername?: string };
  };
}

const getHostnameFromUrl = (url: string): string | undefined => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return undefined;
  }
};

const getQueueConfig = (): QueueConfig => {
  // Prefer REDIS_URL if available (handles TLS automatically)
  if (env.redis.url) {
    const hostname = getHostnameFromUrl(env.redis.url);
    return {
      connection: {
        url: env.redis.url,
        family: 4, // Force IPv4
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => Math.min(times * 50, 2000), // Exponential backoff, max 2s
        ...(hostname && { tls: { servername: hostname } }), // TLS with SNI
      },
    };
  }
  
  // Fallback to host/port configuration
  return {
    connection: {
      host: env.redis.host,
      port: env.redis.port,
      family: 4, // Force IPv4
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 50, 2000), // Exponential backoff, max 2s
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
documentProcessingQueue.on('error' as any, (error: any) => {
  logger.error('Queue error:', error);
});

documentProcessingQueue.on('waiting' as any, (job: any) => {
  logger.info(`Job ${job.id} is waiting`);
});

documentProcessingQueue.on('active' as any, (job: any) => {
  logger.info(`Job ${job.id} is now active`);
});

documentProcessingQueue.on('completed' as any, (job: any) => {
  logger.info(`Job ${job.id} has completed`);
});

documentProcessingQueue.on('failed' as any, (job: any, err: any) => {
  logger.error(`Job ${job?.id} has failed:`, err);
});

/* DocumentJobData is declared above */

export const addDocumentToQueue = async (data: DocumentJobData): Promise<string> => {
  const job = await documentProcessingQueue.add('process-document', data, {
    jobId: `doc-${data.documentId}`,
  });
  logger.info(`Document ${data.documentId} added to queue with job ID: ${job.id}`);
  return job.id!;
};

