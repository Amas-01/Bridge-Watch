import { render, screen } from "@testing-library/react";
import UnreadCountBadge from "./UnreadCountBadge";

describe("UnreadCountBadge", () => {
  it("renders count when non-zero", () => {
    render(<UnreadCountBadge unreadCount={5} />);

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("is hidden when count is zero", () => {
    const { container } = render(<UnreadCountBadge unreadCount={0} />);

    expect(container.querySelector(".bg-red-500")).not.toBeInTheDocument();
  });

  it("truncates count above threshold", () => {
    render(<UnreadCountBadge unreadCount={25} maxVisibleCount={9} />);

    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("announces count changes via aria-live", () => {
    const { rerender } = render(<UnreadCountBadge unreadCount={0} />);
    expect(screen.getByRole("status")).toHaveTextContent("No unread notifications");

    rerender(<UnreadCountBadge unreadCount={1} />);
    expect(screen.getByRole("status")).toHaveTextContent("1 unread notifications");
  });
});
