import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WebhookIpAllowlist from "./WebhookIpAllowlist";

function renderPage() {
  return render(
    <MemoryRouter>
      <WebhookIpAllowlist />
    </MemoryRouter>
  );
}

describe("WebhookIpAllowlist page", () => {
  it("renders page title and initial allowlist entries", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /webhook ip allowlist/i })
    ).toBeInTheDocument();

    expect(screen.getByText("192.168.1.0/24")).toBeInTheDocument();
    expect(screen.getByText("10.0.4.50")).toBeInTheDocument();
  });

  it("adds a new IP allowlist entry via modal", async () => {
    const { container } = renderPage();
    const addBtn = screen.getByRole("button", { name: /\+ Add Allowlist Entry/i });
    await userEvent.click(addBtn);

    const ipInput = screen.getByPlaceholderText(/e\.g\. 192\.168\.1\.0\/24/i);
    const descTextarea = container.querySelector("textarea")!;

    await userEvent.type(ipInput, "172.16.0.0/16");
    await userEvent.type(descTextarea, "VPN Subnet");

    const submitBtn = screen.getByRole("button", { name: /add rule/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText("172.16.0.0/16")).toBeInTheDocument();
    expect(screen.getByText("VPN Subnet")).toBeInTheDocument();
  });

  it("tests an IP against active rules", async () => {
    renderPage();
    const testIpInput = screen.getByPlaceholderText(/Enter test IP/i);
    const runTestBtn = screen.getByRole("button", { name: /Evaluate Access/i });

    await userEvent.type(testIpInput, "192.168.1.50");
    await userEvent.click(runTestBtn);

    expect(screen.getByText(/Matched rule/i)).toBeInTheDocument();
  });
});
