import { createClient } from 'redis';

// Central Redis client used by backend modules that need cache/session style storage
export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

// Surface connection/auth failures early without crashing import-time code
redisClient.on('error', (err) => console.error('Redis Client Error', err));

export async function connectRedis() {
  // connect() throws if called while already open, so guard repeated callers
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}
