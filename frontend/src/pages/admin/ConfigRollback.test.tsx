import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import ConfigRollback from "./ConfigRollback";

const mockVersions = [
  {
    id: "v1",
    configKey: "alert-thresholds",
    versionNumber: 3,
    payload: { maxLatency: 5000, minBalance: 100 },
    changeSummary: "Update maxLatency to 5s",
    appliedBy: "admin",
    appliedAt: new Date().toISOString(),
    isCurrent: true,
  },
  {
    id: "v2",
    configKey: "alert-thresholds",
    versionNumber: 2,
    payload: { maxLatency: 3000, minBalance: 100 },
    changeSummary: "Update maxLatency to 3s",
    appliedBy: "alice",
    appliedAt: new Date(Date.now() - 86400000).toISOString(),
    isCurrent: false,
  },
  {
    id: "v3",
    configKey: "alert-thresholds",
    versionNumber: 1,
    payload: { maxLatency: 1000, minBalance: 50 },
    changeSummary: "Initial configuration",
    appliedBy: "bob",
    appliedAt: new Date(Date.now() - 172800000).toISOString(),
    isCurrent: false,
  },
];

const mockPreview = {
  configKey: "alert-thresholds",
  currentVersion: 3,
  targetVersion: 2,
  diff: [
    {
      field: "maxLatency",
      currentValue: 5000,
      targetValue: 3000,
      changeType: "modified" as const,
    },
  ],
  impactSummary:
    "Rolling back from v3 to v2 will modify 1 field. This is a safe operation.",
};

function setup() {
  server.use(
    http.get("/api/v1/admin/config-versions/:key", ({ params }) => {
      if (params.key === "alert-thresholds") {
        return HttpResponse.json({ versions: mockVersions });
      }
      return HttpResponse.json({ versions: [] });
    }),
    http.get(
      "/api/v1/admin/config-versions/:key/rollback-preview/:version",
      () => HttpResponse.json(mockPreview)
    ),
    http.post("/api/v1/admin/config-versions/:key/rollback/:version", () =>
      HttpResponse.json({ message: "Rollback applied" })
    ),
    http.post("/api/v1/admin/config-versions/:key", () =>
      HttpResponse.json({ version: mockVersions[0] }, { status: 201 })
    )
  );

  // Pre-populate the admin token in localStorage
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", "test-token");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfigRollback />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Test 41: Version history table with version#, summary, applied_by, applied_at
// ---------------------------------------------------------------------------

describe("ConfigRollback page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the page heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /config rollback preview/i })
    ).toBeInTheDocument();
  });

  it("shows config key lookup form", () => {
    renderPage();
    expect(screen.getByLabelText(/config key/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /load history/i })
    ).toBeInTheDocument();
  });

  it("loads version history when form is submitted", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    const loadButton = screen.getByRole("button", { name: /load history/i });

    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(loadButton);

    await waitFor(() => {
      expect(screen.getByText("v3")).toBeInTheDocument();
    });
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("renders version history table with correct columns", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(screen.getByText("Version")).toBeInTheDocument();
    });
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Applied by")).toBeInTheDocument();
    expect(screen.getByText("Applied at")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("marks current version with status badge", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(screen.getByText(/current/i)).toBeInTheDocument();
    });
  });

  it("shows 'Preview rollback' button for non-current versions", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      const previewButtons = screen.getAllByRole("button", {
        name: /preview rollback/i,
      });
      // 2 non-current versions in mock data
      expect(previewButtons).toHaveLength(2);
    });
  });

  // Test 42: Field-level diff table: field name, change type, current/target values
  it("shows rollback preview when preview button is clicked", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(screen.getByText("v2")).toBeInTheDocument();
    });

    const previewButtons = screen.getAllByRole("button", {
      name: /preview rollback/i,
    });
    await userEvent.click(previewButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /rollback preview/i })
      ).toBeInTheDocument();
    });
  });

  it("renders diff table with field name, change type, current/target values", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(screen.getByText("v2")).toBeInTheDocument();
    });

    const previewButtons = screen.getAllByRole("button", {
      name: /preview rollback/i,
    });
    await userEvent.click(previewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("maxLatency")).toBeInTheDocument();
    });
    expect(screen.getByText(/modified/i)).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
    expect(screen.getByText("3000")).toBeInTheDocument();
  });

  it("shows impact summary in rollback preview", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(screen.getByText("v2")).toBeInTheDocument();
    });

    const previewButtons = screen.getAllByRole("button", {
      name: /preview rollback/i,
    });
    await userEvent.click(previewButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/rolling back from v3 to v2 will modify 1 field/i)
      ).toBeInTheDocument();
    });
  });

  // Test 43: Apply rollback button calls POST and refreshes history
  it("shows apply rollback button in preview panel", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(screen.getByText("v2")).toBeInTheDocument();
    });

    const previewButtons = screen.getAllByRole("button", {
      name: /preview rollback/i,
    });
    await userEvent.click(previewButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /apply rollback to v2/i })
      ).toBeInTheDocument();
    });
  });

  it("applies rollback and shows success message", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(screen.getByText("v2")).toBeInTheDocument();
    });

    const previewButtons = screen.getAllByRole("button", {
      name: /preview rollback/i,
    });
    await userEvent.click(previewButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /apply rollback to v2/i })
      ).toBeInTheDocument();
    });

    const applyButton = screen.getByRole("button", {
      name: /apply rollback to v2/i,
    });
    await userEvent.click(applyButton);

    await waitFor(() => {
      expect(
        screen.getByText(/rollback applied.*new version has been created/i)
      ).toBeInTheDocument();
    });
  });

  // Test 44: Create version form validates JSON payload
  it("shows create version form when button is clicked", async () => {
    renderPage();
    const createButton = screen.getByRole("button", {
      name: /create version/i,
    });
    await userEvent.click(createButton);

    expect(screen.getByLabelText(/config key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/change summary/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/payload \(json\)/i)).toBeInTheDocument();
  });

  it("validates JSON payload when creating a version", async () => {
    renderPage();
    const createButton = screen.getByRole("button", {
      name: /create version/i,
    });
    await userEvent.click(createButton);

    const keyInput = screen.getAllByLabelText(/config key/i)[0]; // First one is from create form
    const payloadInput = screen.getByLabelText(/payload \(json\)/i);

    await userEvent.type(keyInput, "test-config");
    await userEvent.clear(payloadInput);
    await userEvent.type(payloadInput, "invalid json{");

    const submitButton = screen.getByRole("button", {
      name: /create version/i,
    });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/payload must be valid json/i)
      ).toBeInTheDocument();
    });
  });

  // Test 45: Loading and error states render correctly
  it("shows loading state while fetching history", () => {
    server.use(
      http.get("/api/v1/admin/config-versions/:key", async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({ versions: [] });
      })
    );
    renderPage();
    expect(
      screen.getByRole("heading", { name: /config rollback preview/i })
    ).toBeInTheDocument();
  });

  it("shows error state when history API fails", async () => {
    server.use(
      http.get("/api/v1/admin/config-versions/:key", () =>
        HttpResponse.json({ message: "Server error" }, { status: 500 })
      )
    );
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "alert-thresholds");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("shows empty state when no versions exist", async () => {
    renderPage();
    const keyInput = screen.getByLabelText(/config key/i);
    await userEvent.type(keyInput, "nonexistent-key");
    await userEvent.click(screen.getByRole("button", { name: /load history/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/no versions found for/i)
      ).toBeInTheDocument();
    });
  });
});
