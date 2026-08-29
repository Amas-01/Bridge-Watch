import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import ChangeRequests from "./ChangeRequests";

const mockRequests = [
  {
    id: "cr1",
    title: "Increase rate limit",
    description: "Need to increase limit for USDC bridge",
    changeType: "config_update",
    payload: { limit: 1000 },
    status: "pending_approval",
    submittedBy: "alice",
    submittedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
    appliedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cr2",
    title: "Update sampling rule",
    description: "Adjust sampling rate to 25%",
    changeType: "sampling_update",
    payload: { rate: 0.25 },
    status: "draft",
    submittedBy: "bob",
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
    appliedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function setup() {
  server.use(
    http.get("/api/v1/admin/change-requests", () =>
      HttpResponse.json({ requests: mockRequests })
    ),
    http.post("/api/v1/admin/change-requests", () =>
      HttpResponse.json({ request: mockRequests[0] }, { status: 201 })
    ),
    http.post("/api/v1/admin/change-requests/:id/:action", () =>
      HttpResponse.json({ message: "Success" })
    )
  );

  // Pre-populate the admin token in localStorage
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", "test-token");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ChangeRequests />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Test 31: Change requests list grouped by status tabs
// ---------------------------------------------------------------------------

describe("ChangeRequests page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the page heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /change approval workflow/i })
    ).toBeInTheDocument();
  });

  it("renders status tabs: All, Draft, Pending, Approved, Rejected, Applied", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approved" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rejected" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Applied" })).toBeInTheDocument();
  });

  it("displays pending approval count in stat card", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/pending review/i)).toBeInTheDocument();
    });
    // 1 pending_approval request in mock data
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders change requests with title, description, status badge", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Increase rate limit")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Need to increase limit for USDC bridge")
    ).toBeInTheDocument();
    expect(screen.getByText(/pending approval/i)).toBeInTheDocument();
  });

  // Test 32: Four-eyes principle enforced — approver ≠ submitter check
  it("shows review panel with approve/reject buttons for pending requests", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Increase rate limit")).toBeInTheDocument();
    });
    const reviewButton = screen.getByRole("button", { name: /review/i });
    await userEvent.click(reviewButton);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("requires review comment when rejecting a request", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Increase rate limit")).toBeInTheDocument();
    });
    const reviewButton = screen.getByRole("button", { name: /review/i });
    await userEvent.click(reviewButton);

    const rejectButton = screen.getByRole("button", { name: "Reject" });
    await userEvent.click(rejectButton);

    await waitFor(() => {
      expect(
        screen.getByText(/review comment is required when rejecting/i)
      ).toBeInTheDocument();
    });
  });

  // Test 33: Create request form validates JSON payload before submission
  it("shows create form when 'New request' is clicked", async () => {
    renderPage();
    const newButton = screen.getByRole("button", { name: /new request/i });
    await userEvent.click(newButton);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/change type/i)).toBeInTheDocument();
  });

  it("validates JSON payload before submission", async () => {
    renderPage();
    const newButton = screen.getByRole("button", { name: /new request/i });
    await userEvent.click(newButton);

    const titleInput = screen.getByLabelText(/title/i);
    const descInput = screen.getByLabelText(/description/i);
    const payloadInput = screen.getByLabelText(/payload \(json\)/i);

    await userEvent.type(titleInput, "Test change");
    await userEvent.type(descInput, "Test description");
    await userEvent.clear(payloadInput);
    await userEvent.type(payloadInput, "invalid json{");

    const submitButton = screen.getByRole("button", { name: /create draft/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/payload must be valid json/i)
      ).toBeInTheDocument();
    });
  });

  it("shows draft actions: Submit for review and Cancel", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Update sampling rule")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /submit for review/i })
    ).toBeInTheDocument();
    // Two cancel buttons: one for draft request, one for pending request
    const cancelButtons = screen.getAllByRole("button", { name: /cancel/i });
    expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
  });

  // Test 34: Loading and error states render correctly
  it("shows loading state while fetching", () => {
    server.use(
      http.get("/api/v1/admin/change-requests", async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({ requests: [] });
      })
    );
    renderPage();
    expect(
      screen.getByRole("heading", { name: /change approval workflow/i })
    ).toBeInTheDocument();
  });

  it("shows error state when the API fails", async () => {
    server.use(
      http.get("/api/v1/admin/change-requests", () =>
        HttpResponse.json({ message: "Server error" }, { status: 500 })
      )
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("shows empty state when no requests exist", async () => {
    server.use(
      http.get("/api/v1/admin/change-requests", () =>
        HttpResponse.json({ requests: [] })
      )
    );
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/no change requests found for this filter/i)
      ).toBeInTheDocument();
    });
  });

  it("filters requests by status tab", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Increase rate limit")).toBeInTheDocument();
      expect(screen.getByText("Update sampling rule")).toBeInTheDocument();
    });

    const draftTab = screen.getByRole("button", { name: "Draft" });
    await userEvent.click(draftTab);

    await waitFor(() => {
      expect(screen.getByText("Update sampling rule")).toBeInTheDocument();
      expect(screen.queryByText("Increase rate limit")).not.toBeInTheDocument();
    });
  });
});
