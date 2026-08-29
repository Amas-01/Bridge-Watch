import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { MemoryRouter } from "react-router-dom";
import OnboardingDialog from "./OnboardingDialog";

describe("OnboardingDialog", () => {
  it("moves between steps and completes flow", async () => {
    const onClose = vi.fn();
    const onComplete = vi.fn();

    const { container } = render(
      <MemoryRouter>
        <OnboardingDialog open onClose={onClose} onComplete={onComplete} />
      </MemoryRouter>
    );

    // Accessibility test
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    expect(screen.getByRole("heading", { name: "Welcome to Bridge Watch" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Developer Help" })).toHaveAttribute(
      "href",
      "https://developers.stellar.org/docs/build/smart-contracts"
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Start on the Dashboard" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Compare assets in Analytics" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
