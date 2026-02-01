import { createRedisClient } from '../infra/redis.js';
import { logger } from '../utils/logger.js';

export async function validateExternalDepsOrExit(): Promise<void> {
  let client: any | null = null;
  try {
    client = createRedisClient();
    const res = await client.ping();
    logger.info('[startup] Redis ping OK', res);
  } catch (err) {
    logger.error('[startup] Redis ping failed:', err);
    // Fail fast if Redis not reachable
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  } finally {
    try {
      if (client) await client.quit();
    } catch {
      // ignore
    }
  }
}
