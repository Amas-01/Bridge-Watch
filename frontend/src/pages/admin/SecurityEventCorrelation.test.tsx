import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SecurityEventCorrelation from "./SecurityEventCorrelation";

function renderPage() {
  return render(
    <MemoryRouter>
      <SecurityEventCorrelation />
    </MemoryRouter>
  );
}

describe("SecurityEventCorrelation page", () => {
  it("renders page heading and initial security correlations", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /security event correlation/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText("Multiple Failed Webhook & Auth Signatures")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sensitive Field Bulk Export Anomaly")
    ).toBeInTheDocument();
  });

  it("filters correlations by search term", async () => {
    renderPage();
    const searchInput = screen.getByPlaceholderText(/search correlation views/i);
    await userEvent.type(searchInput, "Webhook");

    expect(
      screen.getByText("Multiple Failed Webhook & Auth Signatures")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Sensitive Field Bulk Export Anomaly")
    ).not.toBeInTheDocument();
  });

  it("opens create modal and adds a correlation rule", async () => {
    const { container } = renderPage();
    const createBtn = screen.getByRole("button", { name: /\+ Create Correlation View/i });
    await userEvent.click(createBtn);

    const titleInput = container.querySelector('form input[type="text"]')!;
    await userEvent.type(titleInput, "Unusual Geo IP Spike");

    const submitBtn = screen.getByRole("button", { name: /save correlation view/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText("Unusual Geo IP Spike")).toBeInTheDocument();
  });
});
