import { Router } from 'express';
import { signup, login, logout, getCurrentUser } from '../controllers/auth.controller.js';
import { validateSignup, validateLogin } from '../middlewares/validation.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

/**
 * @route   POST /api/v1/auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post('/signup', validateSignup, signup);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validateLogin, login);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user
 * @access  Private
 */
router.get('/me', authenticate, getCurrentUser);

export const authRoutes = router;

