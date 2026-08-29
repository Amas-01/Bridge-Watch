import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../config/index.js";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  usageCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  clientId?: string | null;
  oauthEnabled?: boolean;
}

export interface ApiKeyAuditRecord {
  id: string;
  apiKeyId: string;
  action: string;
  actor: string;
  detail: string | null;
  createdAt: string;
}

interface StoredApiKeyRecord extends ApiKeyRecord {
  salt: string;
  hash: string;
  clientSecretHash?: string | null;
}

interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  rateLimitPerMinute?: number;
  expiresAt?: string | null;
  createdBy: string;
  enableOAuth?: boolean;
}

interface ApiKeyValidationResult {
  id: string;
  name: string;
  scopes: string[];
  rateLimitPerMinute: number;
  source: "api-key" | "bootstrap";
}

export type ApiKeyValidationFailureReason = "invalid_key" | "insufficient_scope";

export type ApiKeyValidationOutcome =
  | { ok: true; result: ApiKeyValidationResult }
  | { ok: false; reason: ApiKeyValidationFailureReason };

interface ApiKeyRepository {
  create(record: StoredApiKeyRecord): Promise<void>;
  update(record: StoredApiKeyRecord): Promise<void>;
  getById(id: string): Promise<StoredApiKeyRecord | null>;
  getByPrefix(prefix: string): Promise<StoredApiKeyRecord[]>;
  getByClientId(clientId: string): Promise<StoredApiKeyRecord | null>;
  list(): Promise<ApiKeyRecord[]>;
  addAudit(entry: ApiKeyAuditRecord): Promise<void>;
}

const DEFAULT_SCOPES = ["jobs:read", "jobs:trigger"];
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;
const KEY_PREFIX = "bwk_live_";

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(): string {
  return randomBytes(16).toString("hex");
}

function makeSalt(): string {
  return randomBytes(16).toString("hex");
}

function deriveHash(apiKey: string, salt: string): string {
  return scryptSync(apiKey, salt, 64).toString("hex");
}

function constantTimeMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function createPlaintextKey(): { plaintext: string; prefix: string } {
  const secret = randomBytes(24).toString("hex");
  const plaintext = `${KEY_PREFIX}${secret}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 16),
  };
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  const next = (scopes?.length ? scopes : DEFAULT_SCOPES)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return Array.from(new Set(next));
}

function normalizeRateLimit(rateLimitPerMinute?: number): number {
  if (!rateLimitPerMinute || rateLimitPerMinute < 1) {
    return DEFAULT_RATE_LIMIT_PER_MINUTE;
  }
  return Math.floor(rateLimitPerMinute);
}

function isExpired(expiresAt: string | null): boolean {
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
}

class MemoryApiKeyRepository implements ApiKeyRepository {
  private static records = new Map<string, StoredApiKeyRecord>();

  private static audits: ApiKeyAuditRecord[] = [];

  async create(record: StoredApiKeyRecord): Promise<void> {
    MemoryApiKeyRepository.records.set(record.id, record);
  }

  async update(record: StoredApiKeyRecord): Promise<void> {
    MemoryApiKeyRepository.records.set(record.id, record);
  }

  async getById(id: string): Promise<StoredApiKeyRecord | null> {
    return MemoryApiKeyRepository.records.get(id) ?? null;
  }

  async getByPrefix(prefix: string): Promise<StoredApiKeyRecord[]> {
    return Array.from(MemoryApiKeyRepository.records.values()).filter(
      (record) => record.prefix === prefix
    );
  }

  async getByClientId(clientId: string): Promise<StoredApiKeyRecord | null> {
    return (
      Array.from(MemoryApiKeyRepository.records.values()).find(
        (record) => record.clientId === clientId
      ) ?? null
    );
  }

  async list(): Promise<ApiKeyRecord[]> {
    return Array.from(MemoryApiKeyRepository.records.values())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(({ salt: _salt, hash: _hash, ...record }) => record);
  }

  async addAudit(entry: ApiKeyAuditRecord): Promise<void> {
    MemoryApiKeyRepository.audits.push(entry);
  }
}

class DatabaseApiKeyRepository implements ApiKeyRepository {
  async create(record: StoredApiKeyRecord): Promise<void> {
    await getDatabase()("api_keys").insert({
      id: record.id,
      name: record.name,
      key_prefix: record.prefix,
      key_hash: record.hash,
      key_salt: record.salt,
      scopes: JSON.stringify(record.scopes),
      rate_limit_per_minute: record.rateLimitPerMinute,
      usage_count: record.usageCount,
      expires_at: record.expiresAt,
      revoked_at: record.revokedAt,
      last_used_at: record.lastUsedAt,
      last_used_ip: record.lastUsedIp,
      created_by: record.createdBy,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      client_id: record.clientId ?? null,
      client_secret_hash: record.clientSecretHash ?? null,
      oauth_enabled: record.oauthEnabled ?? false,
    });
  }

  async update(record: StoredApiKeyRecord): Promise<void> {
    await getDatabase()("api_keys")
      .where({ id: record.id })
      .update({
        name: record.name,
        key_prefix: record.prefix,
        key_hash: record.hash,
        key_salt: record.salt,
        scopes: JSON.stringify(record.scopes),
        rate_limit_per_minute: record.rateLimitPerMinute,
        usage_count: record.usageCount,
        expires_at: record.expiresAt,
        revoked_at: record.revokedAt,
        last_used_at: record.lastUsedAt,
        last_used_ip: record.lastUsedIp,
        created_by: record.createdBy,
        updated_at: record.updatedAt,
        client_id: record.clientId ?? null,
        client_secret_hash: record.clientSecretHash ?? null,
        oauth_enabled: record.oauthEnabled ?? false,
      });
  }

  async getById(id: string): Promise<StoredApiKeyRecord | null> {
    const row = await getDatabase()("api_keys").where({ id }).first();
    return row ? this.toStoredRecord(row) : null;
  }

  async getByPrefix(prefix: string): Promise<StoredApiKeyRecord[]> {
    const rows = await getDatabase()("api_keys").where({ key_prefix: prefix });
    return rows.map((row) => this.toStoredRecord(row));
  }

  async getByClientId(clientId: string): Promise<StoredApiKeyRecord | null> {
    const row = await getDatabase()("api_keys")
      .where({ client_id: clientId })
      .first();
    return row ? this.toStoredRecord(row) : null;
  }

  async list(): Promise<ApiKeyRecord[]> {
    const rows = await getDatabase()("api_keys")
      .select("*")
      .orderBy("created_at", "desc");
    return rows.map((row) => this.toPublicRecord(this.toStoredRecord(row)));
  }

  async addAudit(entry: ApiKeyAuditRecord): Promise<void> {
    await getDatabase()("api_key_audit_logs").insert({
      id: entry.id,
      api_key_id: entry.apiKeyId,
      action: entry.action,
      actor: entry.actor,
      detail: entry.detail,
      created_at: entry.createdAt,
    });
  }

  private toStoredRecord(row: Record<string, unknown>): StoredApiKeyRecord {
    const scopes =
      typeof row.scopes === "string"
        ? (JSON.parse(row.scopes) as string[])
        : ((row.scopes as string[]) ?? []);

    return {
      id: String(row.id),
      name: String(row.name),
      prefix: String(row.key_prefix),
      hash: String(row.key_hash),
      salt: String(row.key_salt),
      scopes,
      rateLimitPerMinute: Number(row.rate_limit_per_minute),
      usageCount: Number(row.usage_count ?? 0),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
      lastUsedIp: row.last_used_ip ? String(row.last_used_ip) : null,
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      clientId: row.client_id ? String(row.client_id) : null,
      oauthEnabled: Boolean(row.oauth_enabled),
      clientSecretHash: row.client_secret_hash ? String(row.client_secret_hash) : null,
    };
  }

  private toPublicRecord(record: StoredApiKeyRecord): ApiKeyRecord {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { salt, hash, clientSecretHash, ...publicRecord } = record;
    return publicRecord as unknown as ApiKeyRecord;
  }
}

export class ApiKeyService {
  private static memoryRateLimits = new Map<
    string,
    { windowStartedAt: number; count: number }
  >();

  private readonly repository: ApiKeyRepository;

  constructor(repository?: ApiKeyRepository) {
    this.repository = repository ?? this.getDefaultRepository();
  }

  async createKey(input: CreateApiKeyInput): Promise<{
    apiKey: string;
    key: ApiKeyRecord;
    clientId?: string;
    clientSecret?: string;
  }> {
    const issuedAt = nowIso();
    const { plaintext, prefix } = createPlaintextKey();
    const salt = makeSalt();
    
    let clientId: string | undefined;
    let clientSecret: string | undefined;
    let clientSecretHash: string | undefined;

    if (input.enableOAuth) {
      const oauth2Service = await import("./oauth2.service.js");
      const service = new oauth2Service.OAuth2Service();
      const credentials = service.generateClientCredentials();
      clientId = credentials.clientId;
      clientSecret = credentials.clientSecret;
      clientSecretHash = service.hashClientSecret(clientSecret);
    }

    const record: StoredApiKeyRecord = {
      id: makeId(),
      name: input.name.trim(),
      prefix,
      hash: deriveHash(plaintext, salt),
      salt,
      scopes: normalizeScopes(input.scopes),
      rateLimitPerMinute: normalizeRateLimit(input.rateLimitPerMinute),
      usageCount: 0,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      lastUsedAt: null,
      lastUsedIp: null,
      createdBy: input.createdBy,
      createdAt: issuedAt,
      updatedAt: issuedAt,
      clientId: clientId ?? null,
      oauthEnabled: input.enableOAuth ?? false,
      clientSecretHash: clientSecretHash ?? null,
    };

    await this.repository.create(record);
    await this.log(record.id, "created", input.createdBy, record.name);

    return {
      apiKey: plaintext,
      key: this.toPublicRecord(record),
      ...(clientId && { clientId }),
      ...(clientSecret && { clientSecret }),
    };
  }

  async listKeys(): Promise<ApiKeyRecord[]> {
    return this.repository.list();
  }

  async revokeKey(id: string, actor: string): Promise<ApiKeyRecord> {
    const record = await this.requireRecord(id);
    record.revokedAt = nowIso();
    record.updatedAt = record.revokedAt;
    await this.repository.update(record);
    await this.log(id, "revoked", actor, null);
    return this.toPublicRecord(record);
  }

  async rotateKey(
    id: string,
    actor: string
  ): Promise<{ apiKey: string; key: ApiKeyRecord }> {
    const record = await this.requireRecord(id);
    const { plaintext, prefix } = createPlaintextKey();
    const salt = makeSalt();

    record.prefix = prefix;
    record.salt = salt;
    record.hash = deriveHash(plaintext, salt);
    record.revokedAt = null;
    record.lastUsedAt = null;
    record.lastUsedIp = null;
    record.updatedAt = nowIso();
    await this.repository.update(record);
    await this.log(id, "rotated", actor, null);

    return {
      apiKey: plaintext,
      key: this.toPublicRecord(record),
    };
  }

  async extendKeyExpiration(
    id: string,
    actor: string,
    extraDays: number
  ): Promise<ApiKeyRecord> {
    const record = await this.requireRecord(id);
    const baseTime = record.expiresAt ? Date.parse(record.expiresAt) : Date.now();
    const nextExpiry = new Date(baseTime + extraDays * 24 * 60 * 60 * 1000);
    record.expiresAt = nextExpiry.toISOString();
    record.updatedAt = nowIso();
    await this.repository.update(record);
    await this.log(id, "extended", actor, `${extraDays} days`);
    return this.toPublicRecord(record);
  }

  async validateOAuth2ClientCredentials(
    clientId: string,
    clientSecret: string
  ): Promise<StoredApiKeyRecord | null> {
    const record = await this.repository.getByClientId(clientId);
    
    if (!record) {
      return null;
    }

    if (record.revokedAt || isExpired(record.expiresAt)) {
      return null;
    }

    if (!record.oauthEnabled || !record.clientSecretHash) {
      return null;
    }

    const oauth2Service = await import("./oauth2.service.js");
    const service = new oauth2Service.OAuth2Service();
    
    if (!service.verifyClientSecret(clientSecret, record.clientSecretHash)) {
      return null;
    }

    return record;
  }

  async validateKey(
    plaintextKey: string,
    requiredScopes: string[] = [],
    clientIp?: string
  ): Promise<ApiKeyValidationOutcome> {
    const bootstrapToken = config.API_KEY_BOOTSTRAP_TOKEN;
    if (bootstrapToken && plaintextKey === bootstrapToken) {
      return {
        ok: true,
        result: {
          id: "bootstrap",
          name: "Bootstrap admin token",
          scopes: ["*"],
          rateLimitPerMinute: Number.MAX_SAFE_INTEGER,
          source: "bootstrap",
        },
      };
    }

    const prefix = plaintextKey.slice(0, 16);
    const candidates = await this.repository.getByPrefix(prefix);
    for (const candidate of candidates) {
      if (candidate.revokedAt || isExpired(candidate.expiresAt)) {
        continue;
      }

      const attemptedHash = deriveHash(plaintextKey, candidate.salt);
      if (!constantTimeMatch(candidate.hash, attemptedHash)) {
        continue;
      }

      if (!this.hasScopes(candidate.scopes, requiredScopes)) {
        return { ok: false, reason: "insufficient_scope" };
      }

      if (!this.consumeRateLimit(candidate.id, candidate.rateLimitPerMinute)) {
        throw new Error("API key rate limit exceeded");
      }

      candidate.usageCount += 1;
      candidate.lastUsedAt = nowIso();
      candidate.lastUsedIp = clientIp ?? null;
      candidate.updatedAt = candidate.lastUsedAt;
      await this.repository.update(candidate);
      await this.log(candidate.id, "used", candidate.name, clientIp ?? null);

      return {
        ok: true,
        result: {
          id: candidate.id,
          name: candidate.name,
          scopes: candidate.scopes,
          rateLimitPerMinute: candidate.rateLimitPerMinute,
          source: "api-key",
        },
      };
    }

    return { ok: false, reason: "invalid_key" };
  }

  private getDefaultRepository(): ApiKeyRepository {
    if (process.env.NODE_ENV === "test") {
      return new MemoryApiKeyRepository();
    }
    try {
      return new DatabaseApiKeyRepository();
    } catch (error) {
      logger.warn({ error }, "Falling back to in-memory API key storage");
      return new MemoryApiKeyRepository();
    }
  }

  private hasScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
    if (!requiredScopes.length) {
      return true;
    }
    if (grantedScopes.includes("*")) {
      return true;
    }
    return requiredScopes.every((scope) => grantedScopes.includes(scope));
  }

  private consumeRateLimit(id: string, limitPerMinute: number): boolean {
    const now = Date.now();
    const bucket = ApiKeyService.memoryRateLimits.get(id);
    if (!bucket || now - bucket.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
      ApiKeyService.memoryRateLimits.set(id, { windowStartedAt: now, count: 1 });
      return true;
    }

    if (bucket.count >= limitPerMinute) {
      return false;
    }

    bucket.count += 1;
    ApiKeyService.memoryRateLimits.set(id, bucket);
    return true;
  }

  private async requireRecord(id: string): Promise<StoredApiKeyRecord> {
    const record = await this.repository.getById(id);
    if (!record) {
      throw new Error("API key not found");
    }
    return record;
  }

  private async log(
    apiKeyId: string,
    action: string,
    actor: string,
    detail: string | null
  ): Promise<void> {
    await this.repository.addAudit({
      id: makeId(),
      apiKeyId,
      action,
      actor,
      detail,
      createdAt: nowIso(),
    });
  }

  private toPublicRecord(record: StoredApiKeyRecord): ApiKeyRecord {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { salt, hash, ...publicRecord } = record;
    return publicRecord as unknown as ApiKeyRecord;
  }
}
