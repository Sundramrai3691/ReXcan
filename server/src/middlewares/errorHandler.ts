import { Request, Response, NextFunction } from 'express';
import { ApiResponseHelper } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  // Log error
  if (statusCode >= 500) {
    logger.error('Error:', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
    });
  } else {
    logger.warn('Client error:', {
      message: error.message,
      statusCode,
      url: req.url,
      method: req.method,
    });
  }

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorDetails = isDevelopment ? error.stack : undefined;

  return ApiResponseHelper.error(res, message, statusCode, errorDetails);
};

