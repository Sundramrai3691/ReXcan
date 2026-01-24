import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types.js';
import { ApiResponseHelper } from '../utils/apiResponse.js';

type UserRole = 'user' | 'admin';

/**
 * Middleware to authorize user based on roles
 * Must be used after authenticate middleware
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      ApiResponseHelper.unauthorized(res, 'Authentication required');
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      ApiResponseHelper.forbidden(
        res,
        'You do not have permission to access this resource'
      );
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 */
export const isAdmin = authorize('admin');

/**
 * Middleware to check if user is authenticated (user or admin)
 */
export const isAuthenticated = authorize('user', 'admin');

