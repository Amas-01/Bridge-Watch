import { axe } from "vitest-axe";
import { fireEvent, render, screen, act } from "@testing-library/react";
import NotificationsDrawer from "./NotificationsDrawer";
import { useNotificationStore } from "../stores/notificationStore";

function resetNotifications() {
  useNotificationStore.setState(useNotificationStore.getInitialState(), true);
}

function seedNotifications() {
  const store = useNotificationStore.getState();
  store.addNotification({
    id: "critical-1",
    type: "system",
    priority: "critical",
    title: "Critical issue",
    message: "Critical body",
    timestamp: 3,
  });
  store.addNotification({
    id: "high-1",
    type: "system",
    priority: "high",
    title: "High issue",
    message: "High body",
    timestamp: 2,
  });
  store.addNotification({
    id: "low-1",
    type: "info",
    priority: "low",
    title: "Low issue",
    message: "Low body",
    timestamp: 1,
  });
}

describe("NotificationsDrawer", () => {
  beforeEach(() => {
    resetNotifications();
    localStorage.clear();
  });

  it("opens and closes", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <NotificationsDrawer open={false} drawerId="notifications-drawer" onClose={onClose} />
    );

    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();

    rerender(<NotificationsDrawer open drawerId="notifications-drawer" onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close notifications" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<NotificationsDrawer open drawerId="notifications-drawer" onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps focus with Tab navigation", () => {
    seedNotifications();
    render(<NotificationsDrawer open drawerId="notifications-drawer" onClose={vi.fn()} />);

    const closeButton = screen.getByRole("button", { name: "Close notifications" });
    const lastMarkAsReadButton = screen.getByRole("button", { name: "Mark Low issue as read" });
    lastMarkAsReadButton.focus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
  });

  it("renders severity groups and omits empty ones", () => {
    seedNotifications();

    render(<NotificationsDrawer open drawerId="notifications-drawer" onClose={vi.fn()} />);

    expect(screen.getByLabelText("Critical notifications")).toBeInTheDocument();
    expect(screen.getByLabelText("High notifications")).toBeInTheDocument();
    expect(screen.getByLabelText("Low notifications")).toBeInTheDocument();
    expect(screen.queryByLabelText("Medium notifications")).not.toBeInTheDocument();
  });

  it("marks a single notification as read", () => {
    seedNotifications();

    render(<NotificationsDrawer open drawerId="notifications-drawer" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /mark critical issue as read/i }));

    const updated = useNotificationStore
      .getState()
      .notifications.find((notification) => notification.id === "critical-1");

    expect(updated?.read).toBe(true);
  });

  it("marks all as read and disables the action", () => {
    seedNotifications();

    render(<NotificationsDrawer open drawerId="notifications-drawer" onClose={vi.fn()} />);

    const markAll = screen.getByRole("button", { name: "Mark all as read" });
    fireEvent.click(markAll);

    expect(useNotificationStore.getState().unreadCount).toBe(0);
    expect(markAll).toBeDisabled();
  });

  it("clears read notifications and disables clear button when none exist", () => {
    seedNotifications();
    useNotificationStore.getState().markAsRead("critical-1");

    render(<NotificationsDrawer open drawerId="notifications-drawer" onClose={vi.fn()} />);

    const clearRead = screen.getByRole("button", { name: "Clear read" });
    fireEvent.click(clearRead);

    expect(
      useNotificationStore.getState().notifications.some((notification) => notification.id === "critical-1")
    ).toBe(false);
    expect(clearRead).toBeDisabled();
  });

  it("renders new notifications while open and announces updates", () => {
    render(<NotificationsDrawer open drawerId="notifications-drawer" onClose={vi.fn()} />);

    act(() => {
      useNotificationStore.getState().addNotification({
        id: "live-1",
        type: "system",
        priority: "high",
        title: "Live event",
        message: "Live body",
        timestamp: 100,
      });
    });

    expect(screen.getByText("Live event")).toBeInTheDocument();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(/new high notification/i);
  });

  it("exposes dialog aria attributes", () => {
    render(<NotificationsDrawer open drawerId="notifications-drawer" onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(dialog).toHaveAttribute("id", "notifications-drawer");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("has no accessibility violations when open", async () => {
    seedNotifications();
    const { container } = render(
      <NotificationsDrawer open drawerId="notifications-drawer" onClose={vi.fn()} />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
