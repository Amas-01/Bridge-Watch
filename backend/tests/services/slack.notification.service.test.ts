import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SlackNotificationService } from "../../src/services/slack.notification.service.js";
import type { RouteableAlert } from "../../src/services/alertRouting.service.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock configuration
vi.mock("../../src/config/index.js", () => ({
  config: {
    SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/TEST/WEBHOOK/URL",
  },
}));

// Mock logger
vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("SlackNotificationService", () => {
  let slackService: SlackNotificationService;
  let mockAlert: RouteableAlert;

  beforeEach(() => {
    slackService = new SlackNotificationService();
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

  describe("sendAlert", () => {
    it("sends correct Block Kit payload to Slack webhook", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await slackService.sendAlert(mockAlert);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/services/TEST/WEBHOOK/URL",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: expect.stringContaining("CRITICAL Bridge Alert"),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.blocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "header",
            text: expect.objectContaining({
              text: "🚨 CRITICAL Bridge Alert",
            }),
          }),
          expect.objectContaining({
            type: "section",
            fields: expect.arrayContaining([
              expect.objectContaining({
                text: "*Asset:*\nUSDC",
              }),
              expect.objectContaining({
                text: "*Severity:*\ncritical",
              }),
              expect.objectContaining({
                text: "*Threshold:*\n1.02",
              }),
            ]),
          }),
        ])
      );
    });

    it("includes severity-specific emoji and color", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      // Test critical severity
      await slackService.sendAlert({ ...mockAlert, severity: "critical" });
      let callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.blocks[0].text.text).toContain("🚨");
      expect(callBody.attachments[0].color).toBe("danger");

      // Test high severity
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      await slackService.sendAlert({ ...mockAlert, severity: "high" });
      callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.blocks[0].text.text).toContain("⚠️");
      expect(callBody.attachments[0].color).toBe("warning");

      // Test medium severity
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      await slackService.sendAlert({ ...mockAlert, severity: "medium" });
      callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.blocks[0].text.text).toContain("⚡");
      expect(callBody.attachments[0].color).toBe("#ffeb3b");

      // Test low severity
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      await slackService.sendAlert({ ...mockAlert, severity: "low" });
      callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.blocks[0].text.text).toContain("ℹ️");
      expect(callBody.attachments[0].color).toBe("good");
    });

    it("handles webhook failure gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request"),
      });

      await expect(slackService.sendAlert(mockAlert)).rejects.toThrow(
        "Slack webhook responded with 400: Bad Request"
      );
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(slackService.sendAlert(mockAlert)).rejects.toThrow("Network error");
    });

    it("skips sending when webhook URL is not configured", async () => {
      const serviceWithoutUrl = new SlackNotificationService();
      // Mock config without webhook URL
      vi.doMock("../../src/config/index.js", () => ({
        config: {
          SLACK_WEBHOOK_URL: null,
        },
      }));

      await slackService.sendAlert(mockAlert);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("testConnection", () => {
    it("sends test message successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await slackService.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/services/TEST/WEBHOOK/URL",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Bridge Watch Slack integration test"),
        })
      );
    });

    it("returns false when test fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await slackService.testConnection();
      expect(result).toBe(false);
    });

    it("returns false when not configured", async () => {
      // Mock service without URL
      vi.doMock("../../src/config/index.js", () => ({
        config: {
          SLACK_WEBHOOK_URL: null,
        },
      }));

      const serviceWithoutUrl = new SlackNotificationService();
      const result = await serviceWithoutUrl.testConnection();
      expect(result).toBe(false);
    });
  });

  describe("isConfigured", () => {
    it("returns true when webhook URL is set", () => {
      expect(slackService.isConfigured()).toBe(true);
    });

    it("returns false when webhook URL is not set", () => {
      vi.doMock("../../src/config/index.js", () => ({
        config: {
          SLACK_WEBHOOK_URL: null,
        },
      }));

      const serviceWithoutUrl = new SlackNotificationService();
      expect(serviceWithoutUrl.isConfigured()).toBe(false);
    });
  });
});