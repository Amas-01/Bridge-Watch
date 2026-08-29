import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import OperatorAvailabilityCalendar from "./OperatorAvailabilityCalendar";

const mockCalendar = {
  op_alice: [
    {
      id: "avail-1",
      operator: "op_alice",
      status: "on_call",
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 86400000).toISOString(),
      notes: "Primary on-call",
    },
  ],
};

function setup() {
  server.use(
    http.get("/api/v1/operator/availability/calendar", () =>
      HttpResponse.json({ calendar: mockCalendar })
    ),
    http.post("/api/v1/operator/availability", () =>
      HttpResponse.json({ availability: mockCalendar.op_alice[0] }, { status: 201 })
    )
  );
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", "test-token");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OperatorAvailabilityCalendar />
    </MemoryRouter>
  );
}

describe("OperatorAvailabilityCalendar page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the page heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /operator availability calendar/i })
    ).toBeInTheDocument();
  });

  it("loads and displays the operator calendar", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("op_alice")).toBeInTheDocument();
    });
    expect(screen.getByText("On call")).toBeInTheDocument();
  });

  it("shows the add-availability form when toggled", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /add availability/i }));
    expect(screen.getByText(/add availability window/i)).toBeInTheDocument();
  });
});
