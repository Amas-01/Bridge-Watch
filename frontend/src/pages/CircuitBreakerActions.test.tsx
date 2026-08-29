import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CircuitBreakerActions from "./CircuitBreakerActions";

describe("CircuitBreakerActions Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/actions")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              actions: [
                {
                  id: "act-1",
                  name: "Script Remediation",
                  alert_type: "price_deviation",
                  action_type: "script",
                  config: JSON.stringify({ command: "/usr/bin/pause.sh" }),
                  enabled: true,
                  timeout_ms: 30000,
                },
              ],
            }),
        });
      }
      if (url.includes("/action-logs")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              logs: [
                {
                  id: "log-1",
                  action_config_id: "act-1",
                  alert_type: "price_deviation",
                  action_type: "script",
                  status: "success",
                  output: '{"stdout": "paused"}',
                  error_message: null,
                  execution_time_ms: 120,
                  executed_at: new Date().toISOString(),
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it("renders header and summary metrics", async () => {
    render(<CircuitBreakerActions />);

    expect(screen.getByText("Circuit Breaker Remediation Engine")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Script Remediation")).toBeInTheDocument();
    });
  });

  it("switches tabs between Action Configurations and Execution Audit Logs", async () => {
    render(<CircuitBreakerActions />);

    const logsTab = screen.getByRole("button", { name: /Execution Audit Logs/i });
    fireEvent.click(logsTab);

    await waitFor(() => {
      expect(screen.getByText("Success")).toBeInTheDocument();
    });
  });

  it("opens modal on New Remediation Action click", async () => {
    render(<CircuitBreakerActions />);

    const newBtn = screen.getByRole("button", { name: /New Remediation Action/i });
    fireEvent.click(newBtn);

    expect(screen.getByText("Register Remediation Action Configuration")).toBeInTheDocument();
  });
});
