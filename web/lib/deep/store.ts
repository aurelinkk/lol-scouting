import "server-only";
import { Redis } from "@upstash/redis";

/**
 * Stockage des analyses « deep » : Upstash Redis (ajouté via le Marketplace
 * Vercel, qui crée les variables d'environnement), ou mémoire en local.
 */
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  /** Pose un verrou s'il n'existe pas ; renvoie true si on l'a obtenu. */
  lock(key: string, seconds: number): Promise<boolean>;
  unlock(key: string): Promise<void>;
  push(key: string, values: unknown[]): Promise<void>;
  range<T>(key: string): Promise<T[]>;
  del(key: string): Promise<void>;
}

function redisFromEnv(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

class RedisStore implements Store {
  constructor(private r: Redis) {}
  get<T>(key: string) {
    return this.r.get<T>(key);
  }
  async set(key: string, value: unknown) {
    await this.r.set(key, value);
  }
  async lock(key: string, seconds: number) {
    return (await this.r.set(key, "1", { nx: true, ex: seconds })) === "OK";
  }
  async unlock(key: string) {
    await this.r.del(key);
  }
  async push(key: string, values: unknown[]) {
    if (values.length) await this.r.rpush(key, ...values);
  }
  range<T>(key: string) {
    return this.r.lrange<T>(key, 0, -1);
  }
  async del(key: string) {
    await this.r.del(key);
  }
}

// En local (sans Upstash) : mémoire du processus, suffisant pour tester
const memory = globalThis as unknown as { __deepMem?: Map<string, unknown>; __deepLocks?: Map<string, number> };
class MemoryStore implements Store {
  private m = (memory.__deepMem ??= new Map());
  private locks = (memory.__deepLocks ??= new Map());
  async get<T>(key: string) {
    return (this.m.get(key) as T) ?? null;
  }
  async set(key: string, value: unknown) {
    this.m.set(key, JSON.parse(JSON.stringify(value)));
  }
  async lock(key: string, seconds: number) {
    const until = this.locks.get(key) ?? 0;
    if (until > Date.now()) return false;
    this.locks.set(key, Date.now() + seconds * 1000);
    return true;
  }
  async unlock(key: string) {
    this.locks.delete(key);
  }
  async push(key: string, values: unknown[]) {
    const list = (this.m.get(key) as unknown[]) ?? [];
    this.m.set(key, [...list, ...JSON.parse(JSON.stringify(values))]);
  }
  async range<T>(key: string) {
    return ((this.m.get(key) as T[]) ?? []).slice();
  }
  async del(key: string) {
    this.m.delete(key);
  }
}

let store: Store | null = null;
export function getStore(): Store {
  if (!store) {
    const r = redisFromEnv();
    store = r ? new RedisStore(r) : new MemoryStore();
  }
  return store;
}

export const hasPersistentStore = () => redisFromEnv() !== null;
