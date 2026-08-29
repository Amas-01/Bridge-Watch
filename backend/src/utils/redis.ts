import { RedisClientFactory } from "../config/redis.js";

export const factory = RedisClientFactory.getInstance();
export const redis = factory.getClient();
export const redisSubscriber = factory.getSubscriber();
export { RedisClientFactory };
