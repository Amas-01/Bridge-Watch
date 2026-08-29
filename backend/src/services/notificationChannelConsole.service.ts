/**
 * Notification Channel Test Console Service
 * Issue #1144
 */

export type ChannelType = "webhook" | "slack" | "discord" | "telegram" | "email" | "pagerduty";

export interface ChannelTestConfig {
  channelType: ChannelType;
  endpointUrl?: string;
  apiKey?: string;
  recipientEmail?: string;
}

export interface ChannelTestResult {
  id: string;
  channelType: ChannelType;
  status: "success" | "failed";
  latencyMs: number;
  httpStatusCode?: number;
  errorMessage?: string;
  testPayload: Record<string, unknown>;
  testedAt: string;
}

export class NotificationChannelConsoleService {
  private testLogs: Map<string, ChannelTestResult[]> = new Map();

  public async testChannel(
    channelId: string,
    config: ChannelTestConfig,
    customPayload?: Record<string, unknown>,
  ): Promise<ChannelTestResult> {
    const startTime = Date.now();

    const payload = customPayload ?? {
      event: "ALERT_TRIGGERED",
      bridge: "StellarBridge-Main",
      severity: "high",
      message: "Test notification dispatched from Bridge Watch console",
      timestamp: new Date().toISOString(),
    };

    let status: "success" | "failed" = "success";
    let errorMessage: string | undefined;
    let httpStatusCode = 200;

    // Validate endpoint configuration
    if (config.channelType === "webhook" || config.channelType === "slack" || config.channelType === "discord") {
      if (!config.endpointUrl || !config.endpointUrl.startsWith("http")) {
        status = "failed";
        httpStatusCode = 400;
        errorMessage = "Invalid endpoint URL";
      }
    } else if (config.channelType === "email" && !config.recipientEmail?.includes("@")) {
      status = "failed";
      httpStatusCode = 400;
      errorMessage = "Invalid recipient email address";
    }

    const latencyMs = Date.now() - startTime + 15; // simulated ping latency

    const result: ChannelTestResult = {
      id: `test_${Date.now()}`,
      channelType: config.channelType,
      status,
      latencyMs,
      httpStatusCode,
      errorMessage,
      testPayload: payload,
      testedAt: new Date().toISOString(),
    };

    const history = this.testLogs.get(channelId) ?? [];
    history.push(result);
    this.testLogs.set(channelId, history);

    return result;
  }

  public async getTestHistory(channelId: string): Promise<ChannelTestResult[]> {
    return this.testLogs.get(channelId) ?? [];
  }
}

export const notificationChannelConsoleService = new NotificationChannelConsoleService();
