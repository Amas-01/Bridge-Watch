import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import ParseQuarantineQueue from "./ParseQuarantineQueue";

const mockRecord = {
  id: "qr-101",
  source: "horizon-ingestor",
  dataType: "transaction_meta",
  rawPayload: { hash: "0x123abc" },
  parseError: "Unexpected end of JSON input",
  errorCode: "ERR_JSON_PARSE",
  status: "quarantined" as const,
  retryCount: 1,
  priority: 5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockStats = {
  total: 10,
  byStatus: {
    quarantined: 4,
    in_review: 2,
    resolved: 3,
    disposed: 1,
    failed: 0,
  },
  bySource: {
    "horizon-ingestor": 10,
  },
};

function setup() {
  server.use(
    http.get("/api/v1/admin/quarantine", () =>
      HttpResponse.json({ records: [mockRecord] })
    ),
    http.get("/api/v1/admin/quarantine/stats", () =>
      HttpResponse.json({ stats: mockStats })
    ),
    http.post("/api/v1/admin/quarantine", () =>
      HttpResponse.json({ record: mockRecord }, { status: 201 })
    ),
    http.post("/api/v1/admin/quarantine/:id/retry", () =>
      HttpResponse.json({ record: { ...mockRecord, status: "resolved" } })
    ),
    http.post("/api/v1/admin/quarantine/:id/resolve", () =>
      HttpResponse.json({ record: { ...mockRecord, status: "resolved" } })
    ),
    http.delete("/api/v1/admin/quarantine/:id", () =>
      HttpResponse.json({ success: true })
    )
  );
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", JSON.stringify("test-token"));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ParseQuarantineQueue />
    </MemoryRouter>
  );
}

describe("ParseQuarantineQueue page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders heading and quarantine queue items", async () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /failed parse quarantine/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("horizon-ingestor")).toBeInTheDocument();
    });
    expect(screen.getByText(/ERR_JSON_PARSE/i)).toBeInTheDocument();
  });

  it("handles enqueueing a new quarantine item", async () => {
    renderPage();

    const sourceInput = screen.getByPlaceholderText("some-exchange");
    const dataTypeInput = screen.getByPlaceholderText("asset");
    const parseErrorInput = screen.getByPlaceholderText("Unexpected field 'foo'");

    await userEvent.type(sourceInput, "horizon-stream");
    await userEvent.type(dataTypeInput, "ledger_header");
    await userEvent.type(parseErrorInput, "SyntaxError");

    const enqueueBtn = screen.getByRole("button", { name: /enqueue record/i });
    await userEvent.click(enqueueBtn);

    await waitFor(() => {
      expect(sourceInput).toHaveValue("");
    });
  });

  it("retries and resolves quarantine items", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("horizon-ingestor")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await userEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /failed parse quarantine/i })).toBeInTheDocument();
    });
  });
});
