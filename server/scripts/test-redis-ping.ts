import { createRedisClient } from '../src/infra/redis.js';

const run = async () => {
  try {
    const client = createRedisClient();
    const res = await client.ping();
    console.log('PING ->', res);
    await client.quit();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Redis ping failed', err);
    process.exit(2);
  }
};

void run();
