import { ReactNode } from "react";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { NotificationContext } from "./NotificationContextValue";
import type {
  Notification,
  NotificationPreferences,
  NotificationContextType,
} from "./NotificationContext.types";

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useLocalStorageState<Notification[]>(
    "stellar-notifications",
    []
  );
  const [preferences, setPreferences] = useLocalStorageState<NotificationPreferences>(
    "notification-prefs",
    { soundEnabled: true }
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = (notif: Omit<Notification, "id" | "timestamp" | "read">) => {
    const newNotif: Notification = {
      ...notif,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);

    if (preferences.soundEnabled) {
      const audio = new Audio("/notification-sound.mp3");
      audio.play().catch(() => {
        console.warn("Notification sound blocked by browser");
      });
    }
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const clearRead = () => {
    setNotifications((prev) => prev.filter((n) => !n.read));
  };

  const updatePreferences = (newPrefs: Partial<NotificationPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...newPrefs }));
  };

  const value: NotificationContextType = {
    notifications,
    preferences,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
    clearRead,
    updatePreferences,
    unreadCount,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

