import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine which env file to load based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';

// Load environment-specific file first, then fallback to .env
dotenv.config({ path: path.resolve(__dirname, '../../', envFile) });
dotenv.config({ path: path.resolve(__dirname, '../../', '.env') }); // .env takes precedence if exists

interface EnvConfig {
  nodeEnv: string;
  port: number;
  mongodb: {
    uri: string;
    uriTest: string;
  };
  jwt: {
    secret: string;
    expire: string;
  };
  cors: {
    origin: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  logLevel: string;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  storage: {
    basePath: string;
  };
  apiKeys: {
    anthropic: string;
    google: string;
    openai: string;
    groq: string;
  };
  pubsub: {
    projectId: string;
    topicName: string;
    subscriptionName: string;
    credentialsPath?: string;
  };
  email: {
    provider: 'gmail' | 'imap';
    gmail?: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
    };
    imap?: {
      host: string;
      port: number;
      user: string;
      password: string;
      tls: boolean;
    };
    pollInterval: number; // in milliseconds
  };
}

const validateEnv = (): void => {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

export const env: EnvConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/resxcan',
    uriTest: process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/resxcan_test',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expire: process.env.JWT_EXPIRE || '7d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  },
  storage: {
    basePath: process.env.STORAGE_BASE_PATH || 'storage',
  },
  apiKeys: {
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    google: process.env.GOOGLE_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
  },
  pubsub: {
    projectId: process.env.PUBSUB_PROJECT_ID || '',
    topicName: process.env.PUBSUB_TOPIC_NAME || 'email-invoices',
    subscriptionName: process.env.PUBSUB_SUBSCRIPTION_NAME || 'email-invoices-sub',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },
  email: {
    provider: (process.env.EMAIL_PROVIDER || 'gmail') as 'gmail' | 'imap',
    gmail: {
      clientId: process.env.GMAIL_CLIENT_ID || '',
      clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
      refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
    },
    imap: {
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      user: process.env.IMAP_USER || '',
      password: process.env.IMAP_PASSWORD || '',
      tls: process.env.IMAP_TLS !== 'false',
    },
    pollInterval: parseInt(process.env.EMAIL_POLL_INTERVAL || '60000', 10), // Default 1 minute
  },
};

// Validate environment on import
if (env.nodeEnv !== 'test') {
  validateEnv();
}

