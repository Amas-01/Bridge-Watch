import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import ExternalSourceResponseArchive from "./ExternalSourceResponseArchive";

const record = {
  id: "resp-1",
  sourceKey: "coingecko",
  endpoint: "simple/price",
  method: "GET",
  requestParams: { ids: "stellar", api_key: "[REDACTED]" },
  outcome: "server_error",
  statusCode: 503,
  latencyMs: 812,
  errorMessage: "upstream 503",
  contentType: "application/json",
  bodyTruncated: false,
  bodyHash: "deadbeef",
  bodyBytes: 40,
  collectionRunId: "run-1",
  subject: "XLM",
  collectedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-31T00:00:00.000Z",
};

function setup() {
  server.use(
    http.get("/api/v1/sources/response-archive/", () =>
      HttpResponse.json({ items: [record], nextCursor: null })
    ),
    http.get("/api/v1/sources/response-archive/resp-1/body", () =>
      HttpResponse.json({
        id: "resp-1",
        contentType: "application/json",
        bodyTruncated: false,
        bodyHash: "deadbeef",
        bodyBytes: 40,
        responseBody: '{"error":"service unavailable"}',
      })
    ),
    http.patch("/api/v1/sources/response-archive/resp-1/retention", () =>
      HttpResponse.json({ ...record, expiresAt: null })
    )
  );
  window.localStorage.setItem("bridge-watch:admin-api-key:v1", JSON.stringify("test-token"));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ExternalSourceResponseArchive />
    </MemoryRouter>
  );
}

describe("ExternalSourceResponseArchive page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /external source response archive/i })
    ).toBeInTheDocument();
  });

  it("lists archived responses", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("coingecko")).toBeInTheDocument();
    });
    expect(screen.getByText("simple/price")).toBeInTheDocument();
    expect(screen.getByText("503")).toBeInTheDocument();
    // "Server error" appears both as a filter option and as the row badge.
    expect(screen.getAllByText("Server error").length).toBeGreaterThanOrEqual(2);
  });

  it("loads the body when a row is inspected", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("coingecko")).toBeInTheDocument());
    await userEvent.click(screen.getByText("coingecko"));
    await waitFor(() => {
      expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
    });
    // Redacted secret is visible in the request params view.
    expect(screen.getByText(/\[REDACTED\]/)).toBeInTheDocument();
  });

  it("can place a legal hold on a response", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("coingecko")).toBeInTheDocument());
    await userEvent.click(screen.getByText("coingecko"));
    await userEvent.click(await screen.findByRole("button", { name: /place legal hold/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /release hold/i })).toBeInTheDocument();
    });
  });
});
