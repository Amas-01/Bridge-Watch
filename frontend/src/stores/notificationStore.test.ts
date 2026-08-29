import {
  selectNotificationsGroupedByPriority,
  useNotificationStore,
} from "./notificationStore";

const PERSIST_KEY = "bridge-watch-notification-read-state";

function resetStoreState() {
  const initialState = useNotificationStore.getInitialState();
  useNotificationStore.setState(initialState, true);
}

describe("notificationStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreState();
  });

  it("initializes with empty notifications and zero unread count", () => {
    const state = useNotificationStore.getState();

    expect(state.notifications).toEqual([]);
    expect(state.unreadCount).toBe(0);
  });

  it("adds notification and increments unread count", () => {
    useNotificationStore.getState().addNotification({
      id: "notif-1",
      type: "info",
      priority: "medium",
      title: "Info",
      message: "Message",
      timestamp: 1,
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.id).toBe("notif-1");
    expect(state.unreadCount).toBe(1);
  });

  it("marks one notification as read", () => {
    const store = useNotificationStore.getState();
    store.addNotification({
      id: "notif-1",
      type: "system",
      priority: "high",
      title: "One",
      message: "One",
      timestamp: 1,
    });
    store.addNotification({
      id: "notif-2",
      type: "system",
      priority: "high",
      title: "Two",
      message: "Two",
      timestamp: 2,
    });

    store.markAsRead("notif-1");

    const state = useNotificationStore.getState();
    expect(state.notifications.find((notification) => notification.id === "notif-1")?.read).toBe(
      true
    );
    expect(state.notifications.find((notification) => notification.id === "notif-2")?.read).toBe(
      false
    );
    expect(state.unreadCount).toBe(1);
  });

  it("marks all notifications as read", () => {
    const store = useNotificationStore.getState();
    store.addNotification({
      id: "a",
      type: "info",
      priority: "low",
      title: "A",
      message: "A",
      timestamp: 1,
    });
    store.addNotification({
      id: "b",
      type: "info",
      priority: "medium",
      title: "B",
      message: "B",
      timestamp: 2,
    });
    store.addNotification({
      id: "c",
      type: "system",
      priority: "critical",
      title: "C",
      message: "C",
      timestamp: 3,
    });

    store.markAllAsRead();

    const state = useNotificationStore.getState();
    expect(state.notifications.every((notification) => notification.read)).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  it("clears only read notifications", () => {
    const store = useNotificationStore.getState();
    store.addNotification({
      id: "read-1",
      type: "info",
      priority: "low",
      title: "Read",
      message: "Read",
      timestamp: 1,
    });
    store.addNotification({
      id: "unread-1",
      type: "info",
      priority: "medium",
      title: "Unread",
      message: "Unread",
      timestamp: 2,
    });

    store.markAsRead("read-1");
    store.clearReadNotifications();

    const state = useNotificationStore.getState();
    expect(state.notifications.map((notification) => notification.id)).toEqual(["unread-1"]);
    expect(state.unreadCount).toBe(1);
  });

  it("groups notifications by priority in taxonomy order", () => {
    const store = useNotificationStore.getState();
    store.addNotification({
      id: "low-1",
      type: "info",
      priority: "low",
      title: "Low",
      message: "Low",
      timestamp: 1,
    });
    store.addNotification({
      id: "critical-1",
      type: "system",
      priority: "critical",
      title: "Critical",
      message: "Critical",
      timestamp: 3,
    });
    store.addNotification({
      id: "high-1",
      type: "system",
      priority: "high",
      title: "High",
      message: "High",
      timestamp: 2,
    });

    const grouped = selectNotificationsGroupedByPriority(useNotificationStore.getState());
    expect(Object.keys(grouped)).toEqual(["critical", "high", "medium", "low"]);
    expect(grouped.critical.map((notification) => notification.id)).toEqual(["critical-1"]);
    expect(grouped.high.map((notification) => notification.id)).toEqual(["high-1"]);
    expect(grouped.medium).toEqual([]);
    expect(grouped.low.map((notification) => notification.id)).toEqual(["low-1"]);
  });

  it("writes read-state persistence on mutation", () => {
    const store = useNotificationStore.getState();
    store.addNotification({
      id: "persist-1",
      type: "info",
      priority: "medium",
      title: "Persist",
      message: "Persist",
      timestamp: 1,
    });

    store.markAsRead("persist-1");

    const persisted = localStorage.getItem(PERSIST_KEY);
    expect(persisted).toContain("persist-1");
  });

  it("rehydrates read-state and applies it to incoming notifications", async () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        state: {
          readStateById: {
            "rehydrated-1": true,
          },
        },
        version: 1,
      })
    );

    await useNotificationStore.persist.rehydrate();

    useNotificationStore.getState().addNotification({
      id: "rehydrated-1",
      type: "info",
      priority: "medium",
      title: "Rehydrated",
      message: "Rehydrated",
      timestamp: 1,
    });

    const notification = useNotificationStore
      .getState()
      .notifications.find((entry) => entry.id === "rehydrated-1");
    expect(notification?.read).toBe(true);
  });
});
