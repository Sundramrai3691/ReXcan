import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types.js';
import { authService } from '../services/auth.service.js';
import { ApiResponseHelper } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Middleware to authenticate user using JWT token
 * Verifies the token and attaches user to request object
 */
export const authenticate = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ApiResponseHelper.unauthorized(res, 'Authentication required. Please provide a valid token.');
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Verify token
      const decoded = authService.verifyToken(token);

      // Get user from database
      const user = await authService.getUserById(decoded.userId);

      if (!user) {
        ApiResponseHelper.unauthorized(res, 'User not found. Token is invalid.');
        return;
      }

      // Attach user to request object
      req.user = user;
      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token verification failed';
      ApiResponseHelper.unauthorized(res, errorMessage);
      return;
    }
  }
);

