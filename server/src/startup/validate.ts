import { createRedisClient } from '../infra/redis.js';
import { logger } from '../utils/logger.js';

export async function validateExternalDepsOrExit(): Promise<void> {
  let client: any | null = null;
  const maxRetries = 5;
  const baseDelayMs = 500;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      client = createRedisClient();
      const res = await client.ping();
      logger.info('[startup] Redis ping OK', res);
      await client.quit();
      return;
    } catch (err: any) {
      const message = err?.message ?? String(err);
      const code = err?.code ?? 'UNKNOWN';
      const stack = err?.stack ?? '';

      logger.error('[startup] Redis ping failed', {
        message,
        code,
        stack,
        attempt,
        maxRetries,
      });

      try {
        if (client) await client.quit();
      } catch {
        // ignore
      }

      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        logger.info(`[startup] Redis retry ${attempt}/${maxRetries} - waiting ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries exhausted, log warning but do NOT exit
  logger.warn('[startup] Redis unavailable at startup, will retry lazily in BullMQ');
}
