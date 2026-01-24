import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export class ApiResponseHelper {
  static success<T>(res: Response, data: T, message = 'Success', statusCode = 200): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    } as ApiResponse<T>);
  }

  static error(res: Response, message: string, statusCode = 500, error?: string): Response {
    return res.status(statusCode).json({
      success: false,
      message,
      error: error || message,
    } as ApiResponse);
  }

  static created<T>(res: Response, data: T, message = 'Resource created successfully'): Response {
    return this.success(res, data, message, 201);
  }

  static notFound(res: Response, message = 'Resource not found'): Response {
    return this.error(res, message, 404);
  }

  static badRequest(res: Response, message = 'Bad request', error?: string): Response {
    return this.error(res, message, 400, error);
  }

  static unauthorized(res: Response, message = 'Unauthorized'): Response {
    return this.error(res, message, 401);
  }

  static forbidden(res: Response, message = 'Forbidden'): Response {
    return this.error(res, message, 403);
  }

  static conflict(res: Response, message = 'Resource already exists'): Response {
    return this.error(res, message, 409);
  }

  static internalError(res: Response, message = 'Internal server error', error?: string): Response {
    return this.error(res, message, 500, error);
  }
}

