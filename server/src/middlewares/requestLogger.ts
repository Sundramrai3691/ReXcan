import { Request, Response } from 'express';
import morgan from 'morgan';
import { logger } from '../utils/logger.js';

const morganFormat = ':method :url :status :response-time ms - :res[content-length]';

morgan.token('custom', (req: Request, res: Response) => {
  return `${req.method} ${req.url} ${res.statusCode}`;
});

export const requestLogger = morgan(morganFormat, {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    },
  },
});

