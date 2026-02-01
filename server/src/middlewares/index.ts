import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { requestLogger } from './requestLogger.js';

export const setupMiddlewares = (app: Express): void => {
  // Security middleware
  app.use(helmet());

  // CORS configuration
  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // In development, allow any localhost origin
      if (env.nodeEnv === 'development') {
        if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          callback(null, true);
          return;
        }
      }

      // In production, use configured origin(s)
      const allowedRaw = env.cors.origin || '';
      const allowedOrigins = allowedRaw.split(',').map((o) => o.trim()).filter(Boolean);

      // Allow wildcard
      if (allowedOrigins.includes('*')) {
        callback(null, true);
        return;
      }

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  };

  app.use(cors(corsOptions));
  // Ensure preflight (OPTIONS) requests are handled with the same CORS rules
  app.options('*', cors(corsOptions));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Compression middleware
  app.use(compression());

  // Request logging
  app.use(requestLogger);

  // Rate limiting
  const limiter = rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', limiter);
};

