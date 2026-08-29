import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import ProtectedRoute from "./ProtectedRoute";

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/" element={<div>Landing page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it("shows a full-page loading skeleton instead of the landing page while session validation is in flight", () => {
    window.localStorage.setItem("bridge_watch_session_token", "some-token");
    // No handler override for a resolved response -- the request will hang, keeping status "loading".
    server.use(http.post("/api/v1/sessions/validate", () => new Promise(() => {})));

    renderProtected();

    expect(screen.getByRole("status", { name: /verifying session/i })).toBeInTheDocument();
    expect(screen.queryByText("Landing page")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  it("renders the protected route content once a session is confirmed valid", async () => {
    window.localStorage.setItem("bridge_watch_session_token", "good-token");
    server.use(
      http.post("/api/v1/sessions/validate", () =>
        HttpResponse.json({
          success: true,
          data: {
            id: "sess-1",
            userId: "user-1",
            status: "active",
            expiresAt: "2026-08-01T00:00:00.000Z",
            lastActiveAt: "2026-07-27T00:00:00.000Z",
          },
        }),
      ),
    );

    renderProtected();

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /verifying session/i })).not.toBeInTheDocument();
  });

  it("redirects to the landing page instead of flashing protected content when there's no valid session", async () => {
    // No stored token at all.
    renderProtected();

    expect(await screen.findByText("Landing page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });
});
