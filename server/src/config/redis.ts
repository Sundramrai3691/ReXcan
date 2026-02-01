import { env } from './env.js';

export interface RedisConnectionOptions {
  // explicit fields for clarity
  socket?: any;
  username?: string;
  password?: string;
}

export const getRedisConnectionOptions = (): RedisConnectionOptions => {
  if (env.redis.url) {
    const url = new URL(env.redis.url);
    const hostname = url.hostname;
    const port = parseInt(url.port || '6380', 10);
    const username = url.username || undefined;
    const password = url.password || undefined;

    return {
      socket: {
        host: hostname,
        port,
        family: 4,
        tls: { servername: hostname },
        connectTimeout: 10000,
      },
      username,
      password,
      // node-redis options
      // @ts-ignore allow null to satisfy some clients
      maxRetriesPerRequest: null as any,
    } as RedisConnectionOptions;
  }

  return {
    socket: {
      host: env.redis.host,
      port: env.redis.port,
      family: 4,
      connectTimeout: 10000,
    },
    password: env.redis.password,
    maxRetriesPerRequest: null as any,
  } as RedisConnectionOptions;
};
