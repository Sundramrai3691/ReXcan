import { URL } from 'url';

export const getRedisOptions = (): ConstructorParameters<
  typeof import('ioredis').default
>[0] => {
  const raw = process.env.REDIS_URL;
  if (!raw) {
    throw new Error('REDIS_URL is not defined; set REDIS_URL to Upstash rediss://...');
  }

  const url = new URL(raw);
  const hostname = url.hostname;
  const port = Number(url.port || '6380');
  const username = url.username || undefined;
  const password = url.password || undefined;
  const isTls = url.protocol === 'rediss:' || url.protocol === 'rediss';

  const options: any = {
    host: hostname,
    port,
    username,
    password,
    family: 4,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
  };

  if (isTls) {
    options.tls = { servername: hostname };
  }

  return options;
};

export const createRedisClient = () => {
  // Use require to avoid interop issues with ESM/CJS differences
  // ioredis default export is a class
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const IORedis = require('ioredis');
  return new IORedis(getRedisOptions());
};
