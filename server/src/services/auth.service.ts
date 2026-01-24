import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User.model.js';
import { env } from '../config/env.js';
import { SignupRequestBody, LoginRequestBody, AuthResponseData, TokenPayload } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';

class AuthService {
  /**
   * Generate JWT token
   */
  private generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, env.jwt.secret, {
      expiresIn: env.jwt.expire,
    });
  }

  /**
   * Sign up a new user
   */
  async signup(userData: SignupRequestBody): Promise<AuthResponseData> {
    // Check if user already exists
    const existingUser = await User.findOne({ email: userData.email.toLowerCase() });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create new user
    const user = new User({
      name: userData.name.trim(),
      email: userData.email.toLowerCase().trim(),
      password: userData.password,
      role: 'user',
    });

    await user.save();

    // Generate token
    const token = this.generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    logger.info(`New user registered: ${user.email}`);

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    };
  }

  /**
   * Login user
   */
  async login(credentials: LoginRequestBody): Promise<AuthResponseData> {
    // Find user and include password for comparison
    const user = await User.findOne({ email: credentials.email.toLowerCase() }).select('+password');

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(credentials.password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate token
    const token = this.generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    logger.info(`User logged in: ${user.email}`);

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<IUser | null> {
    return User.findById(userId);
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, env.jwt.secret) as TokenPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw new Error('Token verification failed');
    }
  }
}

export const authService = new AuthService();

