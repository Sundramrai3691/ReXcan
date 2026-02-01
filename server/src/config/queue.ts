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

type QueueConnectionOptions = {
  family?: number;
  enableReadyCheck?: boolean;
  maxRetriesPerRequest?: number | null;
  retryStrategy?: (times: number) => number;
  tls?: { servername?: string };
};

type QueueConnStringReturn = {
  connection: string;
  connectionOptions?: QueueConnectionOptions;
};

type QueueConnObjReturn = {
  connection: {
    host: string;
    port: number;
    password?: string;
    family?: number;
    enableReadyCheck?: boolean;
    maxRetriesPerRequest?: number | null;
    retryStrategy?: (times: number) => number;
  };
};

type QueueConnectionReturn = QueueConnStringReturn | QueueConnObjReturn;

const getHostnameFromUrl = (url: string): string | undefined => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return undefined;
  }
};

const getQueueConnection = (): QueueConnectionReturn => {
  if (env.redis.url) {
    const hostname = getHostnameFromUrl(env.redis.url);

    return {
      connection: env.redis.url,
      connectionOptions: {
        family: 4,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => Math.min(times * 100, 2000),
        ...(hostname && { tls: { servername: hostname } }),
      },
    };
  }

  return {
    connection: {
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password,
      family: 4,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 100, 2000),
    },
  };
};
// Create queue instances
const redisConn = getQueueConnection();

export const documentProcessingQueue = new Queue<DocumentJobData>(
  QueueName.DOCUMENT_PROCESSING,
  {
    ...(typeof redisConn.connection === 'string'
      ? { connection: redisConn.connection, connectionOptions: (redisConn as QueueConnStringReturn).connectionOptions }
      : { connection: (redisConn as QueueConnObjReturn).connection }),

    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800 },
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

