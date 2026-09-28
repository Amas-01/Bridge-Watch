import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { MemoryRouter } from "react-router-dom";
import AllowlistManagement from "./AllowlistManagement";

const mockAllowlist = [
  {
    id: "entry-1",
    contractAddress: "CCW67TSB3SSS4ZXGBOI2CCBGH2QPBDH2VMKCEW47GFZ2G5J57TL2JG3V",
    addedBy: "admin-1",
    addedAt: new Date().toISOString(),
    isActive: true,
  },
];

const mockRequests = [
  {
    id: "req-1",
    contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMWAXA26TXTXFX",
    action: "add" as const,
    reason: "New liquidity pool integration",
    requestedBy: "op-lead",
    status: "pending" as const,
    reviewedBy: null,
    reviewComment: null,
    reviewedAt: null,
    createdAt: new Date().toISOString(),
  },
];

function setup() {
  server.use(
    http.get("/api/v1/admin/allowlist", () =>
      HttpResponse.json({ allowlist: mockAllowlist })
    ),
    http.get("/api/v1/admin/allowlist/change-requests", () =>
      HttpResponse.json({ changeRequests: mockRequests })
    ),
    http.post("/api/v1/admin/allowlist/change-requests", () =>
      HttpResponse.json({ success: true }, { status: 201 })
    ),
    http.post("/api/v1/admin/allowlist/change-requests/:id/review", () =>
      HttpResponse.json({ success: true })
    )
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AllowlistManagement />
    </MemoryRouter>
  );
}

describe("AllowlistManagement page", () => {
  beforeEach(() => {
    setup();
  });

  it("renders page heading and allowlist entries", async () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /contract allowlist management/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("CCW67TSB3SSS4ZXGBOI2CCBGH2QPBDH2VMKCEW47GFZ2G5J57TL2JG3V")
      ).toBeInTheDocument();
    });
  });

  it("switches tabs and displays change requests", async () => {
    renderPage();
    const requestsTabButton = screen.getByRole("button", { name: /change requests/i });
    await userEvent.click(requestsTabButton);

    await waitFor(() => {
      expect(
        screen.getByText("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMWAXA26TXTXFX")
      ).toBeInTheDocument();
    });
  });

  it("allows submitting a new change request", async () => {
    const { container } = renderPage();
    const addressInput = screen.getByPlaceholderText("0x...");
    const textareaReason = container.querySelector("textarea")!;
    const submitBtn = screen.getByRole("button", { name: /submit request/i });

    await userEvent.type(addressInput, "CABC1234567890TESTCONTRACTADDRESSEXAMPLE");
    await userEvent.type(textareaReason, "Testing submission flow");
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(addressInput).toHaveValue("");
    });
  });
});
