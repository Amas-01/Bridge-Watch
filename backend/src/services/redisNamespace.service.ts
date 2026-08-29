import { redis } from "../utils/redis.js";

export type RedisNamespaceSummary = {
  namespace: string;
  keyCount: number;
  samples: Array<{ key: string; ttlSeconds: number }>;
};

function namespaceFromKey(key: string): string {
  const [first, second] = key.split(":");
  return second ? `${first}:${second}` : first;
}

export async function inspectRedisNamespaces(
  pattern = "*",
  sampleSize = 5,
): Promise<RedisNamespaceSummary[]> {
  const namespaces = new Map<string, RedisNamespaceSummary>();
  let cursor = "0";

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 250);
    cursor = nextCursor;

    for (const key of keys) {
      const namespace = namespaceFromKey(key);
      const summary = namespaces.get(namespace) ?? { namespace, keyCount: 0, samples: [] };
      summary.keyCount += 1;
      if (summary.samples.length < sampleSize) {
        summary.samples.push({ key, ttlSeconds: await redis.ttl(key) });
      }
      namespaces.set(namespace, summary);
    }
  } while (cursor !== "0");

  return Array.from(namespaces.values()).sort((a, b) => b.keyCount - a.keyCount);
}
