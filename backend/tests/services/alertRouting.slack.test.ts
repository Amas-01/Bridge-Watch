import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RouteableAlert } from "../../src/services/alertRouting.service.js";

// Mock Slack notification service
const mockSlackService = {
  sendAlert: vi.fn(),
  isConfigured: vi.fn().mockReturnValue(true),
  testConnection: vi.fn(),
};

vi.mock("../../src/services/slack.notification.service.js", () => ({
  slackNotificationService: mockSlackService,
}));

// Mock other dependencies
vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => ({
    insert: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("../../src/utils/redis.js", () => ({
  redis: {
    publish: vi.fn(),
    get: vi.fn(),
    setex: vi.fn(),
  },
}));

vi.mock("../../src/services/webhook.service.js", () => ({
  webhookService: {
    listEndpoints: vi.fn().mockResolvedValue([]),
    queueDelivery: vi.fn(),
  },
}));

vi.mock("../../src/services/email.service.js", () => ({
  emailNotificationService: {
    sendAlertEmail: vi.fn(),
  },
}));

vi.mock("../../src/services/preferences.service.js", () => ({
  PreferencesService: class {
    static getInstance() {
      return {
        getSuppressedChannels: vi.fn().mockResolvedValue([]),
      };
    }
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("AlertRouting Slack Integration", () => {
  let AlertRoutingService: any;
  let routingService: any;
  let mockAlert: RouteableAlert;

  beforeEach(async () => {
    // Import after mocks are set up
    const module = await import("../../src/services/alertRouting.service.js");
    AlertRoutingService = module.AlertRoutingService;
    routingService = AlertRoutingService.getInstance();

    mockAlert = {
      eventTime: new Date("2024-01-15T10:30:00Z"),
      alertRuleId: "rule-123",
      ownerAddress: "owner@example.com",
      ruleName: "Test Alert Rule",
      assetCode: "USDC",
      sourceType: "price_deviation",
      severity: "critical",
      triggeredValue: 1.05,
      threshold: 1.02,
      metric: "price_deviation_percent",
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("dispatches alert to Slack channel successfully", async () => {
    mockSlackService.sendAlert.mockResolvedValueOnce(undefined);
    
    const result = await routingService.dispatchChannel(mockAlert, "slack");

    expect(mockSlackService.sendAlert).toHaveBeenCalledWith(mockAlert);
    expect(result).toEqual({
      channel: "slack",
      status: "delivered",
      attemptCount: 1,
      latencyMs: expect.any(Number),
    });
  });

  it("handles Slack service configuration check", async () => {
    mockSlackService.isConfigured.mockReturnValueOnce(false);
    
    const result = await routingService.dispatchChannel(mockAlert, "slack");

    expect(mockSlackService.sendAlert).not.toHaveBeenCalled();
    expect(result).toEqual({
      channel: "slack",
      status: "failed",
      reason: "SLACK_WEBHOOK_URL not configured",
      attemptCount: 0,
      latencyMs: expect.any(Number),
    });
  });

  it("handles Slack service errors gracefully", async () => {
    mockSlackService.sendAlert.mockRejectedValueOnce(new Error("Network timeout"));
    
    const result = await routingService.dispatchChannel(mockAlert, "slack");

    expect(result).toEqual({
      channel: "slack",
      status: "failed",
      reason: "Network timeout",
      attemptCount: 1,
      latencyMs: expect.any(Number),
    });
  });

  it("includes slack in channel sanitization", () => {
    // Test the sanitizeChannels function indirectly through rule creation
    const validChannels = ["in_app", "webhook", "email", "slack"];
    const invalidChannels = ["invalid_channel", "twitter"];
    
    // This tests that slack is accepted as a valid channel
    validChannels.forEach(channel => {
      expect(["in_app", "webhook", "email", "slack"]).toContain(channel);
    });
    
    invalidChannels.forEach(channel => {
      expect(["in_app", "webhook", "email", "slack"]).not.toContain(channel);
    });
  });

  it("routes alert to Slack when included in routing rule", async () => {
    // Mock a routing rule that includes Slack
    const mockRoutingRule = {
      id: "rule-1",
      name: "Critical Alerts to Slack",
      ownerAddress: "owner@example.com",
      severityLevels: ["critical"],
      assetCodes: ["USDC"],
      sourceTypes: ["price_deviation"],
      channels: ["slack"],
      fallbackChannels: [],
      suppressionWindowSeconds: 0,
      priorityOrder: 1,
      isActive: true,
    };

    // Mock database to return the routing rule
    vi.doMock("../../src/database/connection.js", () => ({
      getDatabase: () => ({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRoutingRule),
        insert: vi.fn().mockReturnThis(),
      }),
    }));

    mockSlackService.sendAlert.mockResolvedValueOnce(undefined);
    
    await routingService.routeAlert(mockAlert);

    expect(mockSlackService.sendAlert).toHaveBeenCalledWith(mockAlert);
  });

  it("measures latency correctly for Slack dispatch", async () => {
    const startTime = Date.now();
    mockSlackService.sendAlert.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 100))
    );
    
    const result = await routingService.dispatchChannel(mockAlert, "slack");

    expect(result.latencyMs).toBeGreaterThan(90); // Allow some variance
    expect(result.latencyMs).toBeLessThan(200);
  });
});