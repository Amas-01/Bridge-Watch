import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import AlertEscalationPolicyPreview from "./AlertEscalationPolicyPreview";

const mockPreview = {
  assetCode: "USDC",
  alertType: "depeg",
  startingSeverity: "low",
  activeConditionHistoryId: null,
  steps: [
    {
      ruleId: "rule-1",
      fromSeverity: "low",
      toSeverity: "medium",
      triggerType: "frequency",
      thresholdDescription: "3 occurrence(s) within 30m",
      notificationChannels: ["email"],
    },
  ],
  projectedFinalSeverity: "medium",
  warnings: [],
};

function setup() {
  server.use(
    http.get("/api/v1/alert-escalation/preview", () =>
      HttpResponse.json({ preview: mockPreview })
    )
  );
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", "test-token");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AlertEscalationPolicyPreview />
    </MemoryRouter>
  );
}

describe("AlertEscalationPolicyPreview page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the page heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /alert escalation policy preview/i })
    ).toBeInTheDocument();
  });

  it("loads and renders the escalation chain", async () => {
    renderPage();

    await userEvent.type(screen.getByPlaceholderText("USDC"), "USDC");
    await userEvent.type(screen.getByPlaceholderText("depeg"), "depeg");
    await userEvent.click(screen.getByRole("button", { name: /preview policy/i }));

    await waitFor(() => {
      expect(screen.getByText("3 occurrence(s) within 30m")).toBeInTheDocument();
    });
    expect(screen.getByText(/Notifies: email/i)).toBeInTheDocument();
  });
});
