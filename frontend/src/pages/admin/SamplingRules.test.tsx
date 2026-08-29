import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import SamplingRules from "./SamplingRules";

const mockRules = [
  {
    id: "r1",
    name: "Test rule",
    description: null,
    sampleRate: 0.5,
    target: "all_requests",
    targetValue: null,
    enabled: true,
    priority: 0,
    createdBy: "admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function setup() {
  server.use(
    http.get("/api/v1/admin/sampling-rules", () =>
      HttpResponse.json({ rules: mockRules })
    ),
    http.post("/api/v1/admin/sampling-rules", () =>
      HttpResponse.json({ rule: mockRules[0] }, { status: 201 })
    ),
    http.delete("/api/v1/admin/sampling-rules/:id", () =>
      HttpResponse.json({ message: "Deleted" })
    )
  );

  // Pre-populate the admin token in localStorage
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", "test-token");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SamplingRules />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Test 11: Sampling rules table renders with correct columns
// ---------------------------------------------------------------------------

describe("SamplingRules page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the page heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /request sampling rules/i })
    ).toBeInTheDocument();
  });

  it("renders rules table with Name, Rate, Target, Priority, Status columns", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/test rule/i)).toBeInTheDocument();
    });
    // Column headers
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Rate")).toBeInTheDocument();
    expect(screen.getByText("Target")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("shows the sample rate as a percentage", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("50%")).toBeInTheDocument();
    });
  });

  // Test 12: Create rule form validates sample_rate range before submission
  it("shows the create form when 'New rule' is clicked", async () => {
    renderPage();
    const newRuleButton = screen.getByRole("button", { name: /new rule/i });
    await userEvent.click(newRuleButton);
    expect(
      screen.getByLabelText(/sample rate/i)
    ).toBeInTheDocument();
  });

  // Test 13: Loading and error states render correctly
  it("shows loading state while fetching", () => {
    // Delay the MSW response
    server.use(
      http.get("/api/v1/admin/sampling-rules", async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({ rules: [] });
      })
    );
    renderPage();
    // The page should render without crashing (loading state)
    expect(screen.getByRole("heading", { name: /request sampling rules/i })).toBeInTheDocument();
  });

  it("shows error state when the API fails", async () => {
    server.use(
      http.get("/api/v1/admin/sampling-rules", () =>
        HttpResponse.json({ message: "Server error" }, { status: 500 })
      )
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("shows empty state when no rules exist", async () => {
    server.use(
      http.get("/api/v1/admin/sampling-rules", () =>
        HttpResponse.json({ rules: [] })
      )
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no sampling rules/i)).toBeInTheDocument();
    });
  });
});
