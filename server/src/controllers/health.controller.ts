import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponseHelper } from '../utils/apiResponse.js';
import { healthService } from '../services/health.service.js';

export const getHealth = asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const healthStatus = await healthService.getHealthStatus();
  return ApiResponseHelper.success(res, healthStatus, 'Health check successful');
});

