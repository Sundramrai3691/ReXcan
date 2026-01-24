import { Router } from 'express';
import { fetchAndPublishEmails, getEmailStatus } from '../controllers/email.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

// All email routes require authentication
router.use(authenticate);

// Fetch emails and publish to Pub/Sub
router.post('/fetch', fetchAndPublishEmails);

// Get email service status
router.get('/status', getEmailStatus);

export { router as emailRoutes };

