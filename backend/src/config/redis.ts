import Redis, { Cluster, RedisOptions, ClusterNode, ClusterOptions } from "ioredis";
import { config } from "./index.js";
import { logger } from "../utils/logger.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 100;
const MAX_POOL_SIZE = 10;

interface PoolConfig {
  maxConnections: number;
  retryStrategy: (times: number) => number | null;
}

const defaultPoolConfig: PoolConfig = {
  maxConnections: MAX_POOL_SIZE,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * DEFAULT_RETRY_BASE_MS, 3000);
    return delay;
  },
};

export class RedisClientFactory {
  private static instance: RedisClientFactory;

  private standardClient: Redis | Cluster | null = null;
  private subscriberClient: Redis | Cluster | null = null;
  private poolConfig: PoolConfig;

  private constructor(poolConfig?: Partial<PoolConfig>) {
    this.poolConfig = { ...defaultPoolConfig, ...poolConfig };
  }

  static getInstance(poolConfig?: Partial<PoolConfig>): RedisClientFactory {
    if (!RedisClientFactory.instance) {
      RedisClientFactory.instance = new RedisClientFactory(poolConfig);
    }
    return RedisClientFactory.instance;
  }

  private createBaseOptions(): RedisOptions {
    return {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: DEFAULT_MAX_RETRIES,
      retryStrategy: this.poolConfig.retryStrategy,
      enableReadyCheck: true,
      lazyConnect: true,
    };
  }

  private createClient(extraOpts?: Partial<RedisOptions>): Redis | Cluster {
    const opts: RedisOptions = { ...this.createBaseOptions(), ...extraOpts };

    if (config.NODE_ENV === "production" && process.env.REDIS_CLUSTER === "true") {
      const nodes: ClusterNode[] = [
        { host: config.REDIS_HOST, port: config.REDIS_PORT },
      ];
      const clusterOpts: ClusterOptions = {
        redisOptions: {
          password: config.REDIS_PASSWORD || undefined,
        },
        clusterRetryStrategy: this.poolConfig.retryStrategy,
        enableReadyCheck: true,
        scaleReads: "slave",
      };
      return new Redis.Cluster(nodes, clusterOpts);
    }

    return new Redis(opts);
  }

  getClient(): Redis | Cluster {
    if (!this.standardClient) {
      this.standardClient = this.createClient();
      this.attachHandlers(this.standardClient, "standard");
    }
    return this.standardClient;
  }

  getSubscriber(): Redis | Cluster {
    if (!this.subscriberClient) {
      this.subscriberClient = this.createClient({ lazyConnect: true });
      this.attachHandlers(this.subscriberClient, "subscriber");
    }
    return this.subscriberClient;
  }

  getBullMQConnection() {
    return {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      retryStrategy: this.poolConfig.retryStrategy,
    };
  }

  private attachHandlers(client: Redis | Cluster, label: string): void {
    client.on("error", (err) => {
      logger.error({ err, client: label }, `Redis (${label}) connection error`);
    });
    client.on("connect", () => {
      logger.info({ client: label }, `Redis (${label}) connected`);
    });
    client.on("close", () => {
      logger.warn({ client: label }, `Redis (${label}) connection closed`);
    });
  }

  async shutdown(): Promise<void> {
    const instances = [this.standardClient, this.subscriberClient];
    for (const client of instances) {
      if (client) {
        try {
          await client.quit();
        } catch (err) {
          logger.warn({ err }, "Error quitting Redis client during shutdown");
        }
      }
    }
    this.standardClient = null;
    this.subscriberClient = null;
    logger.info("Redis client factory shut down");
  }
}

export const createRedisClient = (): Redis | Cluster => {
  return RedisClientFactory.getInstance().getClient();
};
