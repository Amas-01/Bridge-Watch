import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export type SamplingTarget = "all_requests" | "endpoint_pattern" | "client_id";

export interface SamplingRule {
  id: string;
  name: string;
  description: string | null;
  sampleRate: number;
  target: SamplingTarget;
  targetValue: string | null;
  enabled: boolean;
  priority: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSamplingRuleParams {
  name: string;
  description?: string;
  sampleRate: number;
  target?: SamplingTarget;
  targetValue?: string;
  enabled?: boolean;
  priority?: number;
  createdBy: string;
}

export interface UpdateSamplingRuleParams {
  name?: string;
  description?: string;
  sampleRate?: number;
  target?: SamplingTarget;
  targetValue?: string;
  enabled?: boolean;
  priority?: number;
}

/** Minimal request descriptor used by shouldSampleRequest and evaluateRequest */
export interface SamplingRequestDescriptor {
  /** Fastify request ID or any stable per-request identifier */
  id: string;
  /** The URL path being requested */
  url: string;
  /** Client identifier (API key id or IP) */
  clientId?: string;
}

export interface EvaluatedRule {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  sampleRate: number;
  sampled: boolean;
}

export interface EvaluateResult {
  rules: EvaluatedRule[];
  finalDecision: boolean;
  matchedRuleId: string | null;
  matchedRuleName: string | null;
}

// =============================================================================
// SERVICE
// =============================================================================

export class RequestSamplingService {
  private static instance: RequestSamplingService;

  private constructor() {}

  public static getInstance(): RequestSamplingService {
    if (!RequestSamplingService.instance) {
      RequestSamplingService.instance = new RequestSamplingService();
    }
    return RequestSamplingService.instance;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * Returns all enabled sampling rules ordered by priority ascending.
   * Active rules are returned first so the evaluation loop can short-circuit.
   */
  public async getSamplingRules(): Promise<SamplingRule[]> {
    const db = getDatabase();
    const rows = await db("sampling_rules").orderBy("priority", "asc");
    return rows.map(this.mapRow);
  }

  /**
   * Returns a single rule by ID. Returns null when not found.
   */
  public async getRuleById(id: string): Promise<SamplingRule | null> {
    const db = getDatabase();
    const row = await db("sampling_rules").where("id", id).first();
    return row ? this.mapRow(row) : null;
  }

  /**
   * Creates a new sampling rule. Validates that sample_rate is within [0.0, 1.0].
   * @throws Error when sampleRate is outside the valid range.
   */
  public async createRule(
    params: CreateSamplingRuleParams
  ): Promise<SamplingRule> {
    this.validateSampleRate(params.sampleRate);

    const db = getDatabase();
    const [row] = await db("sampling_rules")
      .insert({
        id: crypto.randomUUID(),
        name: params.name,
        description: params.description ?? null,
        sample_rate: params.sampleRate,
        target: params.target ?? "all_requests",
        target_value: params.targetValue ?? null,
        enabled: params.enabled ?? true,
        priority: params.priority ?? 0,
        created_by: params.createdBy,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "request_sampling",
        action: "rule_created",
        actor: params.createdBy,
        resource_id: row.id,
        rule_name: params.name,
        sample_rate: params.sampleRate,
      },
      "Sampling rule created"
    );

    return this.mapRow(row);
  }

  /**
   * Updates an existing sampling rule. Returns the updated rule.
   * @throws Error when the rule is not found or sampleRate is out of range.
   */
  public async updateRule(
    id: string,
    params: UpdateSamplingRuleParams,
    updatedBy: string
  ): Promise<SamplingRule> {
    if (params.sampleRate !== undefined) {
      this.validateSampleRate(params.sampleRate);
    }

    const db = getDatabase();
    const updateData: Record<string, unknown> = { updated_at: new Date() };

    if (params.name !== undefined) updateData.name = params.name;
    if (params.description !== undefined) updateData.description = params.description;
    if (params.sampleRate !== undefined) updateData.sample_rate = params.sampleRate;
    if (params.target !== undefined) updateData.target = params.target;
    if ("targetValue" in params) updateData.target_value = params.targetValue ?? null;
    if (params.enabled !== undefined) updateData.enabled = params.enabled;
    if (params.priority !== undefined) updateData.priority = params.priority;

    const [row] = await db("sampling_rules")
      .where("id", id)
      .update(updateData)
      .returning("*");

    if (!row) {
      throw new Error(`Sampling rule not found: ${id}`);
    }

    logger.info(
      {
        feature: "request_sampling",
        action: "rule_updated",
        actor: updatedBy,
        resource_id: id,
      },
      "Sampling rule updated"
    );

    return this.mapRow(row);
  }

  /**
   * Deletes a sampling rule by ID.
   * @throws Error when the rule is not found.
   */
  public async deleteRule(id: string, deletedBy: string): Promise<void> {
    const db = getDatabase();
    const count = await db("sampling_rules").where("id", id).delete();

    if (count === 0) {
      throw new Error(`Sampling rule not found: ${id}`);
    }

    logger.info(
      {
        feature: "request_sampling",
        action: "rule_deleted",
        actor: deletedBy,
        resource_id: id,
      },
      "Sampling rule deleted"
    );
  }

  // ---------------------------------------------------------------------------
  // SAMPLING DECISION
  // ---------------------------------------------------------------------------

  /**
   * Determines whether a request should be sampled.
   *
   * Evaluates all enabled rules in ascending priority order. The first rule
   * whose target matches the request governs the decision. Sampling is
   * deterministic: the same request ID always produces the same boolean
   * outcome for a given rule configuration.
   *
   * Returns true (include in sample) when:
   * - No rules match (default: sample everything)
   * - The matching rule's sample_rate is 1.0
   * - The deterministic hash of the request ID falls within the rate bucket
   *
   * Returns false (exclude from sample) when:
   * - The matching rule's sample_rate is 0.0
   * - The deterministic hash falls outside the rate bucket
   */
  public async shouldSampleRequest(
    req: SamplingRequestDescriptor
  ): Promise<boolean> {
    const db = getDatabase();
    const rows = await db("sampling_rules")
      .where("enabled", true)
      .orderBy("priority", "asc");

    const rules: SamplingRule[] = rows.map(this.mapRow);

    for (const rule of rules) {
      if (this.ruleMatchesRequest(rule, req)) {
        const sampled = this.deterministicSample(req.id, rule.sampleRate);
        logger.info(
          {
            feature: "request_sampling",
            action: "rule_evaluated",
            resource_id: rule.id,
            matched: true,
            sampled,
          },
          "Sampling decision made"
        );
        return sampled;
      }
    }

    // No rule matched — default is to sample everything
    return true;
  }

  /**
   * Evaluates all rules against a mock request descriptor without executing
   * the request. Used by the /evaluate admin endpoint to test rule configurations.
   */
  public async evaluateRequest(
    req: SamplingRequestDescriptor
  ): Promise<EvaluateResult> {
    const db = getDatabase();
    const rows = await db("sampling_rules")
      .where("enabled", true)
      .orderBy("priority", "asc");

    const rules: SamplingRule[] = rows.map(this.mapRow);

    let finalDecision = true;
    let matchedRuleId: string | null = null;
    let matchedRuleName: string | null = null;
    let decided = false;

    const evaluated: EvaluatedRule[] = rules.map((rule) => {
      const matched = this.ruleMatchesRequest(rule, req);
      const sampled = matched ? this.deterministicSample(req.id, rule.sampleRate) : false;

      if (matched && !decided) {
        finalDecision = sampled;
        matchedRuleId = rule.id;
        matchedRuleName = rule.name;
        decided = true;
      }

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        matched,
        sampleRate: rule.sampleRate,
        sampled,
      };
    });

    return { rules: evaluated, finalDecision, matchedRuleId, matchedRuleName };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Checks whether a rule's target matches the given request descriptor.
   */
  private ruleMatchesRequest(
    rule: SamplingRule,
    req: SamplingRequestDescriptor
  ): boolean {
    switch (rule.target) {
      case "all_requests":
        return true;

      case "endpoint_pattern": {
        if (!rule.targetValue) return false;
        // Support simple glob patterns: * matches any segment
        const pattern = rule.targetValue
          .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex chars except *
          .replace(/\*/g, ".*");
        return new RegExp(`^${pattern}`).test(req.url);
      }

      case "client_id":
        return !!rule.targetValue && rule.targetValue === req.clientId;

      default:
        return false;
    }
  }

  /**
   * Deterministically decides whether to include a request in the sample.
   *
   * Uses a truncated SHA-256 hash of the request ID to produce a stable
   * integer in [0, 999]. The request is sampled when this integer is
   * less than floor(sampleRate * 1000). This ensures:
   *  - sampleRate=1.0 always returns true
   *  - sampleRate=0.0 always returns false
   *  - Any rate in between is consistently applied per request ID
   */
  private deterministicSample(requestId: string, sampleRate: number): boolean {
    if (sampleRate >= 1.0) return true;
    if (sampleRate <= 0.0) return false;

    const hash = crypto
      .createHash("sha256")
      .update(requestId)
      .digest("hex");

    // Take the first 8 hex chars (32-bit unsigned integer)
    const bucket = parseInt(hash.slice(0, 8), 16) % 1000;
    return bucket < Math.floor(sampleRate * 1000);
  }

  /** Throws a descriptive Error when sampleRate is outside [0.0, 1.0]. */
  private validateSampleRate(rate: number): void {
    if (typeof rate !== "number" || isNaN(rate) || rate < 0.0 || rate > 1.0) {
      throw new Error(
        `sample_rate must be a number between 0.0 and 1.0 inclusive, got: ${rate}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // MAPPER
  // ---------------------------------------------------------------------------

  private mapRow(row: Record<string, unknown>): SamplingRule {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? null,
      sampleRate: parseFloat(String(row.sample_rate)),
      target: row.target as SamplingTarget,
      targetValue: (row.target_value as string) ?? null,
      enabled: row.enabled as boolean,
      priority: row.priority as number,
      createdBy: row.created_by as string,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const requestSamplingService = RequestSamplingService.getInstance();
