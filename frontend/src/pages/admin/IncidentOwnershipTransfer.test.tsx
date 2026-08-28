import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import IncidentOwnershipTransfer from "./IncidentOwnershipTransfer";

const mockHistory = [
  {
    id: "transfer-1",
    incident_id: "incident-1",
    from_operator: "op_alice",
    to_operator: "op_bob",
    initiated_by: "op_alice",
    reason: "Going off shift",
    transferred_at: new Date().toISOString(),
  },
];

function setup() {
  server.use(
    http.post("/api/v1/incidents/:incidentId/transfer-ownership", () =>
      HttpResponse.json({ success: true, data: { transfer: mockHistory[0] } })
    ),
    http.get("/api/v1/incidents/:incidentId/ownership-transfers", () =>
      HttpResponse.json({ success: true, data: mockHistory })
    )
  );
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", "test-token");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <IncidentOwnershipTransfer />
    </MemoryRouter>
  );
}

describe("IncidentOwnershipTransfer page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the page heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /incident ownership transfer/i })
    ).toBeInTheDocument();
  });

  it("submits a transfer and shows a success message", async () => {
    renderPage();

    await userEvent.type(screen.getByPlaceholderText(/incident-123/i), "incident-1");
    await userEvent.type(screen.getByPlaceholderText(/op_bob/i), "op_bob");
    await userEvent.type(screen.getByPlaceholderText(/op_alice/i), "op_alice");
    await userEvent.click(screen.getByRole("button", { name: /transfer ownership/i }));

    await waitFor(() => {
      expect(screen.getByText(/transferred to op_bob/i)).toBeInTheDocument();
    });
  });

  it("loads transfer history for an incident", async () => {
    renderPage();

    const lookupInputs = screen.getAllByPlaceholderText(/incident-123/i);
    await userEvent.type(lookupInputs[lookupInputs.length - 1], "incident-1");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(screen.getByText("op_bob")).toBeInTheDocument();
    });
    expect(screen.getByText("Going off shift")).toBeInTheDocument();
  });
});
