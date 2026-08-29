export type NotificationType = "alert" | "system" | "info";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  link?: string;
}

export interface NotificationPreferences {
  soundEnabled: boolean;
}

export interface NotificationContextType {
  notifications: Notification[];
  preferences: NotificationPreferences;
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  clearRead: () => void;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  unreadCount: number;
}
