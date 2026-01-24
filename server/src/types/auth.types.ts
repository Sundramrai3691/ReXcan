import { Request } from 'express';
import { IUser } from '../models/User.model.js';

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: IUser;
}

// Signup request body
export interface SignupRequestBody {
  name: string;
  email: string;
  password: string;
}

// Login request body
export interface LoginRequestBody {
  email: string;
  password: string;
}

// Auth response data
export interface AuthResponseData {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isEmailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  token: string;
}

// Token payload
export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

