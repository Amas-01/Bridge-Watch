import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildEscalationChain,
  describeEscalationThreshold,
  AlertEscalationService,
} from "../../src/services/alertEscalation.service.js";

describe("describeEscalationThreshold", () => {
  it("describes a frequency-based rule", () => {
    expect(
      describeEscalationThreshold({
        id: "r1",
        fromSeverity: "low",
        toSeverity: "medium",
        triggerType: "frequency",
        frequencyThreshold: 5,
        timeWindowMinutes: 30,
        notificationChannels: [],
      })
    ).toBe("5 occurrence(s) within 30m");
  });

  it("describes a duration-based rule", () => {
    expect(
      describeEscalationThreshold({
        id: "r2",
        fromSeverity: "medium",
        toSeverity: "high",
        triggerType: "duration",
        durationMinutes: 15,
        timeWindowMinutes: 60,
        notificationChannels: [],
      })
    ).toBe("condition persists for 15m");
  });

  it("describes a manual rule", () => {
    expect(
      describeEscalationThreshold({
        id: "r3",
        fromSeverity: "high",
        toSeverity: "critical",
        triggerType: "manual",
        timeWindowMinutes: 60,
        notificationChannels: [],
      })
    ).toBe("manual escalation only");
  });
});

describe("buildEscalationChain", () => {
  const rules = [
    {
      id: "r1",
      fromSeverity: "low" as const,
      toSeverity: "medium" as const,
      triggerType: "frequency" as const,
      frequencyThreshold: 3,
      timeWindowMinutes: 30,
      notificationChannels: ["email"],
    },
    {
      id: "r2",
      fromSeverity: "medium" as const,
      toSeverity: "high" as const,
      triggerType: "duration" as const,
      durationMinutes: 10,
      timeWindowMinutes: 30,
      notificationChannels: ["email", "telegram"],
    },
    {
      id: "r3",
      fromSeverity: "high" as const,
      toSeverity: "critical" as const,
      triggerType: "recurrence" as const,
      recurrenceCount: 2,
      timeWindowMinutes: 60,
      notificationChannels: ["webhook"],
    },
  ];

  it("walks the full chain from low to critical", () => {
    const steps = buildEscalationChain(rules, "low");
    expect(steps.map((s) => s.toSeverity)).toEqual(["medium", "high", "critical"]);
  });

  it("starts mid-chain when given a higher starting severity", () => {
    const steps = buildEscalationChain(rules, "medium");
    expect(steps.map((s) => s.toSeverity)).toEqual(["high", "critical"]);
  });

  it("returns no steps when no rule matches the starting severity", () => {
    const steps = buildEscalationChain(rules, "critical");
    expect(steps).toEqual([]);
  });

  it("stops instead of looping when rules form a cycle", () => {
    const cyclicRules = [
      {
        id: "c1",
        fromSeverity: "low" as const,
        toSeverity: "medium" as const,
        triggerType: "frequency" as const,
        timeWindowMinutes: 30,
        notificationChannels: [],
      },
      {
        id: "c2",
        fromSeverity: "medium" as const,
        toSeverity: "low" as const,
        triggerType: "frequency" as const,
        timeWindowMinutes: 30,
        notificationChannels: [],
      },
    ];

    const steps = buildEscalationChain(cyclicRules, "low");
    expect(steps).toHaveLength(2);
  });
});

describe("AlertEscalationService.previewEscalationPolicy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns an ordered preview based on configured rules", async () => {
    vi.doMock("../../src/database/connection.js", () => {
      const rules = [
        {
          id: "r1",
          asset_code: "USDC",
          alert_type: "depeg",
          from_severity: "low",
          to_severity: "medium",
          trigger_type: "frequency",
          frequency_threshold: 3,
          time_window_minutes: 30,
          notification_channels: JSON.stringify(["email"]),
          is_active: true,
        },
        {
          id: "r2",
          asset_code: "USDC",
          alert_type: "depeg",
          from_severity: "medium",
          to_severity: "high",
          trigger_type: "duration",
          duration_minutes: 10,
          time_window_minutes: 30,
          notification_channels: JSON.stringify(["telegram"]),
          is_active: true,
        },
      ];

      const mockDb: any = vi.fn().mockImplementation((table: string) => {
        if (table === "alert_escalation_rules") {
          const builder: any = {
            where: vi.fn().mockReturnValue(builder),
            then: (resolve: any) => Promise.resolve(rules).then(resolve),
          };
          return builder;
        }
        if (table === "alert_condition_history") {
          return {
            where: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      return { getDatabase: () => mockDb };
    });
    vi.doMock("../../src/utils/logger.js", () => ({
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    }));

    const { AlertEscalationService: Service } = await import(
      "../../src/services/alertEscalation.service.js"
    );
    const service = new Service();

    const preview = await service.previewEscalationPolicy("USDC", "depeg");

    expect(preview.startingSeverity).toBe("low");
    expect(preview.steps.map((s: any) => s.toSeverity)).toEqual(["medium", "high"]);
    expect(preview.projectedFinalSeverity).toBe("high");
    expect(preview.warnings).toEqual([]);
  });

  it("warns when no rules are configured", async () => {
    vi.doMock("../../src/database/connection.js", () => {
      const mockDb: any = vi.fn().mockImplementation((table: string) => {
        if (table === "alert_escalation_rules") {
          const builder: any = {
            where: vi.fn().mockReturnValue(builder),
            then: (resolve: any) => Promise.resolve([]).then(resolve),
          };
          return builder;
        }
        if (table === "alert_condition_history") {
          return {
            where: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });
      return { getDatabase: () => mockDb };
    });
    vi.doMock("../../src/utils/logger.js", () => ({
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    }));

    const { AlertEscalationService: Service } = await import(
      "../../src/services/alertEscalation.service.js"
    );
    const service = new Service();

    const preview = await service.previewEscalationPolicy("XLM", "liquidity_drop");
    expect(preview.steps).toEqual([]);
    expect(preview.warnings.length).toBeGreaterThan(0);
  });
});
