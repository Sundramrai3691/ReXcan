import { Response } from 'express';
import { AuthRequest } from '../types/auth.types.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponseHelper } from '../utils/apiResponse.js';
import { authService } from '../services/auth.service.js';
import { SignupRequestBody, LoginRequestBody } from '../types/auth.types.js';

/**
 * Sign up a new user
 */
export const signup = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    const userData: SignupRequestBody = req.body;
    const result = await authService.signup(userData);
    return ApiResponseHelper.created(res, result, 'User registered successfully');
  }
);

/**
 * Login user
 */
export const login = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    const credentials: LoginRequestBody = req.body;
    const result = await authService.login(credentials);
    return ApiResponseHelper.success(res, result, 'Login successful');
  }
);

/**
 * Logout user (client-side token removal, but we can add token blacklisting here if needed)
 */
export const logout = asyncHandler(
  async (_req: AuthRequest, res: Response): Promise<Response> => {
    // In a stateless JWT setup, logout is handled client-side by removing the token
    // If you need server-side logout, implement token blacklisting here
    return ApiResponseHelper.success(res, { message: 'Logged out successfully' }, 'Logout successful');
  }
);

/**
 * Get current authenticated user
 */
export const getCurrentUser = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<Response> => {
    if (!req.user) {
      return ApiResponseHelper.unauthorized(res, 'User not authenticated');
    }

    const user = {
      id: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      isEmailVerified: req.user.isEmailVerified,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    };

    return ApiResponseHelper.success(res, { user }, 'User retrieved successfully');
  }
);

