import { database } from '../config/database.js';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database: {
    connected: boolean;
    status: string;
  };
  environment: string;
}

export class HealthService {
  async getHealthStatus(): Promise<HealthStatus> {
    const dbConnected = database.getConnectionStatus();
    const dbStatus = dbConnected ? 'connected' : 'disconnected';

    return {
      status: dbConnected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: dbConnected,
        status: dbStatus,
      },
      environment: process.env.NODE_ENV || 'development',
    };
  }
}

export const healthService = new HealthService();

