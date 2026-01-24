import { Request, Response, NextFunction } from 'express';
import { ApiResponseHelper } from '../utils/apiResponse.js';

export const notFoundHandler = (req: Request, res: Response, _next: NextFunction): Response => {
  return ApiResponseHelper.notFound(res, `Route ${req.originalUrl} not found`);
};

