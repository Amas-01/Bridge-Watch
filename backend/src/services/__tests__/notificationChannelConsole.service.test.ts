import { describe, it, expect, beforeEach } from "vitest";
import { NotificationChannelConsoleService } from "../notificationChannelConsole.service.js";

describe("NotificationChannelConsoleService (#1144)", () => {
  let service: NotificationChannelConsoleService;

  beforeEach(() => {
    service = new NotificationChannelConsoleService();
  });

  it("should successfully execute test ping for valid webhook", async () => {
    const result = await service.testChannel("chan_1", {
      channelType: "webhook",
      endpointUrl: "https://hooks.slack.com/services/T000/B000/XXXX",
    });

    expect(result.status).toBe("success");
    expect(result.httpStatusCode).toBe(200);
    expect(result.latencyMs).toBeGreaterThan(0);

    const history = await service.getTestHistory("chan_1");
    expect(history.length).toBe(1);
  });

  it("should fail test ping for invalid endpoint configuration", async () => {
    const result = await service.testChannel("chan_2", {
      channelType: "webhook",
      endpointUrl: "not-a-url",
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("Invalid endpoint URL");
  });
});
