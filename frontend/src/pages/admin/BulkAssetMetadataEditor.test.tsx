import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import BulkAssetMetadataEditor from "./BulkAssetMetadataEditor";

const mockResult = {
  batchId: "batch-1",
  total: 2,
  succeeded: 1,
  failed: 1,
  results: [
    { assetId: "asset-1", success: true },
    { assetId: "asset-2", success: false, error: "Invalid website URL" },
  ],
};

function setup() {
  server.use(
    http.post("/api/v1/metadata/bulk", () => HttpResponse.json(mockResult))
  );
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", "test-token");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BulkAssetMetadataEditor />
    </MemoryRouter>
  );
}

describe("BulkAssetMetadataEditor page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the page heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /bulk asset metadata editor/i })
    ).toBeInTheDocument();
  });

  it("shows the batch edit form", () => {
    renderPage();
    expect(screen.getByText(/asset ids or symbols/i)).toBeInTheDocument();
    expect(screen.getByText(/updated by/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /apply to all assets/i })
    ).toBeInTheDocument();
  });

  it("submits the batch and renders per-asset results", async () => {
    renderPage();

    await userEvent.type(
      screen.getByPlaceholderText(/asset_usdc_stellar/i),
      "asset-1\nasset-2"
    );
    await userEvent.type(screen.getByPlaceholderText(/ops-user/i), "ops-user");
    await userEvent.click(screen.getByRole("button", { name: /apply to all assets/i }));

    await waitFor(() => {
      expect(screen.getByText(/1\/2 succeeded/i)).toBeInTheDocument();
    });
    expect(screen.getByText("asset-1")).toBeInTheDocument();
    expect(screen.getByText("Invalid website URL")).toBeInTheDocument();
  });
});
