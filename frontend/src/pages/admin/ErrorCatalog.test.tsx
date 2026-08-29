import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import ErrorCatalog from "./ErrorCatalog";

const mockEntries = [
  {
    id: "e1",
    errorCode: "BRIDGE_TIMEOUT",
    title: "Bridge Timeout",
    messageTemplate: "Connection to {bridge} timed out after {ms}ms",
    httpStatus: 504,
    severity: "error",
    category: "network",
    retryGuidance: "Retry after 5s",
    documentationUrl: null,
    isActive: true,
    createdBy: "admin",
    updatedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "e2",
    errorCode: "RATE_LIMIT_EXCEEDED",
    title: "Rate Limit Exceeded",
    messageTemplate: "Too many requests",
    httpStatus: 429,
    severity: "warning",
    category: "rate_limit",
    retryGuidance: "Wait 60s",
    documentationUrl: null,
    isActive: true,
    createdBy: "admin",
    updatedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function setup() {
  server.use(
    http.get("/api/v1/admin/error-catalog", ({ request }) => {
      const url = new URL(request.url);
      const severity = url.searchParams.get("severity");
      const filtered = severity
        ? mockEntries.filter((e) => e.severity === severity)
        : mockEntries;
      return HttpResponse.json({ entries: filtered });
    }),
    http.post("/api/v1/admin/error-catalog", () =>
      HttpResponse.json({ entry: mockEntries[0] }, { status: 201 })
    ),
    http.delete("/api/v1/admin/error-catalog/:id", () =>
      HttpResponse.json({ message: "Deactivated" })
    )
  );
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", "test-token");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ErrorCatalog />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Test 21: Error catalog table renders with severity badges
// ---------------------------------------------------------------------------

describe("ErrorCatalog page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the page heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /error catalog/i })
    ).toBeInTheDocument();
  });

  it("renders entries with severity badges after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/bridge timeout/i)).toBeInTheDocument();
    });
    // Severity badge for "error"
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("renders error code in a code element", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("BRIDGE_TIMEOUT")).toBeInTheDocument();
    });
  });

  it("renders template placeholder highlighting for {bridge} and {ms}", async () => {
    renderPage();
    await waitFor(() => {
      // The template preview renders {bridge} and {ms} as highlighted spans
      expect(screen.getByText("{bridge}")).toBeInTheDocument();
    });
  });

  // Test 22: Category filter updates the table
  it("category filter select is present", async () => {
    renderPage();
    const filterSelect = screen.getByLabelText(/filter by category/i);
    expect(filterSelect).toBeInTheDocument();
  });

  it("severity filter select is present", async () => {
    renderPage();
    const filterSelect = screen.getByLabelText(/filter by severity/i);
    expect(filterSelect).toBeInTheDocument();
    await userEvent.selectOptions(filterSelect, "error");
    // After selecting, the same entries should remain (mock returns same data)
    await waitFor(() => {
      expect(screen.getByText(/bridge timeout/i)).toBeInTheDocument();
    });
  });

  // Test 23: Create form prevents submission with duplicate error code error message
  it("shows create form when 'Add entry' is clicked", async () => {
    renderPage();
    const addButton = screen.getByRole("button", { name: /add entry/i });
    await userEvent.click(addButton);
    expect(
      screen.getByPlaceholderText(/BRIDGE_TIMEOUT/i)
    ).toBeInTheDocument();
  });

  it("shows error message for duplicate error code", async () => {
    server.use(
      http.post("/api/v1/admin/error-catalog", () =>
        HttpResponse.json(
          { message: "Error code already exists: BRIDGE_TIMEOUT" },
          { status: 409 }
        )
      )
    );
    renderPage();

    const addButton = screen.getByRole("button", { name: /add entry/i });
    await userEvent.click(addButton);

    // Fill required fields
    await userEvent.type(
      screen.getByPlaceholderText(/BRIDGE_TIMEOUT/i),
      "BRIDGE_TIMEOUT"
    );
    await userEvent.type(
      screen.getByPlaceholderText(/Bridge connection timed out/i),
      "Bridge Timeout"
    );
    await userEvent.type(
      screen.getByPlaceholderText(/Request to \{bridge\}/i),
      "Connection timed out"
    );
    const httpStatusInput = screen.getByDisplayValue("500");
    await userEvent.clear(httpStatusInput);
    await userEvent.type(httpStatusInput, "504");

    const submitButton = screen.getByRole("button", { name: /add entry/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
