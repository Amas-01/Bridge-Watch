import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import AdminImpersonationSafeguards from "./AdminImpersonationSafeguards";

const mockSession = {
  id: "session-1",
  adminId: "admin-security-chief",
  impersonatedUserId: "user-target-88",
  reason: "Investigating user issue ticket #SUP-4412",
  approvalTicketId: "SUP-4412",
  status: "ACTIVE" as const,
  tokenHash: "hash-123",
  maxDurationMinutes: 30,
  expiresAt: new Date(Date.now() + 1800000).toISOString(),
  endedAt: null,
  ipAddress: "127.0.0.1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockAuditLogs = [
  {
    id: "log-1",
    sessionId: "session-1",
    requestMethod: "GET",
    requestPath: "/api/v1/user/profile",
    actorAdminId: "admin-security-chief",
    targetUserId: "user-target-88",
    ipAddress: "127.0.0.1",
    timestamp: new Date().toISOString(),
  },
];

let currentSessions = [mockSession];

function setup() {
  currentSessions = [mockSession];
  server.use(
    http.get("/api/v1/admin/impersonation/sessions", () =>
      HttpResponse.json({ sessions: currentSessions })
    ),
    http.post("/api/v1/admin/impersonation/start", () =>
      HttpResponse.json({
        session: mockSession,
        token: "impersonation-token-123",
      })
    ),
    http.post("/api/v1/admin/impersonation/stop", () => {
      currentSessions = [{ ...mockSession, status: "ENDED" }];
      return HttpResponse.json({ success: true });
    }),
    http.get("/api/v1/admin/impersonation/audit-logs", () =>
      HttpResponse.json({ auditLogs: mockAuditLogs })
    )
  );
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", JSON.stringify("test-token"));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminImpersonationSafeguards />
    </MemoryRouter>
  );
}

describe("AdminImpersonationSafeguards page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders heading and active impersonation session", async () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /admin impersonation safeguards/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/ACTIVE IMPERSONATION SESSION/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText("user-target-88").length).toBeGreaterThan(0);
  });

  it("handles stopping an impersonation session", async () => {
    renderPage();

    const stopButton = await screen.findByRole("button", { name: /end session now/i });
    expect(stopButton).toBeInTheDocument();
    await userEvent.click(stopButton);

    await waitFor(() => {
      expect(screen.queryByText(/ACTIVE IMPERSONATION SESSION/i)).not.toBeInTheDocument();
    });
  });

  it("fetches audit logs when session detail is requested", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("user-target-88").length).toBeGreaterThan(0);
    });

    const auditTrailButtons = screen.getAllByRole("button", { name: /audit trail/i });
    if (auditTrailButtons.length > 0) {
      await userEvent.click(auditTrailButtons[0]);
      await waitFor(() => {
        expect(screen.getByText("/api/v1/user/profile")).toBeInTheDocument();
      });
    }
  });
});
