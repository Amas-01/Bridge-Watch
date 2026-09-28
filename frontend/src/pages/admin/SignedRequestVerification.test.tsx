import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SignedRequestVerification from "./SignedRequestVerification";

function renderPage() {
  return render(
    <MemoryRouter>
      <SignedRequestVerification />
    </MemoryRouter>
  );
}

describe("SignedRequestVerification page", () => {
  it("renders page title and active signing keys", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /signed request verification middleware/i })
    ).toBeInTheDocument();
    expect(screen.getByText("payment-gateway")).toBeInTheDocument();
    expect(screen.getByText("partner-oracle")).toBeInTheDocument();
  });

  it("opens create key modal and adds a new key", async () => {
    renderPage();
    const createBtn = screen.getByRole("button", { name: /\+ Issue New Signing Key/i });
    await userEvent.click(createBtn);

    const ownerInput = screen.getByPlaceholderText(/e\.g\. payment-processor/i);
    await userEvent.type(ownerInput, "analytics-worker");

    const submitBtn = screen.getByRole("button", { name: /generate key credentials/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText("analytics-worker")).toBeInTheDocument();
  });

  it("runs the signature verification sandbox", async () => {
    renderPage();
    const verifyBtn = screen.getByRole("button", { name: /compute & verify test signature/i });
    await userEvent.click(verifyBtn);

    expect(screen.getByText(/Generated Signature Header/i)).toBeInTheDocument();
  });
});
