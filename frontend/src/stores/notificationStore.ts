import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { devtools } from "zustand/middleware";

export type NotificationType =
  | "price_alert"
  | "supply_mismatch"
  | "bridge_downtime"
  | "health_score_drop"
  | "system"
  | "info";

export type NotificationPriority = "critical" | "high" | "medium" | "low";

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  assetCode?: string;
  bridgeId?: string;
  timestamp: number;
  read: boolean;
  dismissed: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  criticalCount: number;
  highCount: number;
  notificationHistory: Notification[];
  maxHistorySize: number;
  readStateById: Record<string, boolean>;
}

export interface NotificationInput
  extends Omit<Notification, "id" | "timestamp" | "read" | "dismissed"> {
  id?: string;
  timestamp?: number;
  read?: boolean;
  dismissed?: boolean;
}

export interface NotificationActions {
  /**
   * Adds a notification to the active list and history, preserving timestamp-desc ordering.
   * Reuses persisted read-state by identifier when available.
   */
  addNotification: (notification: NotificationInput) => void;
  /** Marks one notification as read by identifier and persists the read flag. */
  markAsRead: (id: string) => void;
  /** Marks all current notifications as read and persists read flags for each identifier. */
  markAllAsRead: () => void;
  /** Removes all notifications with `read=true` from the active list and read-state map. */
  clearReadNotifications: () => void;
  dismissNotification: (id: string) => void;
  dismissAll: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  getUnreadNotifications: () => Notification[];
  getNotificationsByType: (type: NotificationType) => Notification[];
  getNotificationsByPriority: (priority: NotificationPriority) => Notification[];
  getNotificationsByAsset: (assetCode: string) => Notification[];
  setMaxHistorySize: (size: number) => void;
}

const MAX_HISTORY_DEFAULT = 100;
const NOTIFICATION_READ_STATE_KEY = "bridge-watch-notification-read-state";

export const NOTIFICATION_PRIORITY_ORDER: NotificationPriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

const createNotificationId = (): string =>
  `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const sortNotificationsByTimestampDesc = (notifications: Notification[]): Notification[] =>
  [...notifications].sort((a, b) => b.timestamp - a.timestamp);

const countByPredicate = (notifications: Notification[], predicate: (n: Notification) => boolean): number =>
  notifications.filter((n) => !n.dismissed && predicate(n)).length;

const deriveCounts = (notifications: Notification[]) => ({
  unreadCount: countByPredicate(notifications, (n) => !n.read),
  criticalCount: countByPredicate(
    notifications,
    (n) => n.priority === "critical" && !n.read
  ),
  highCount: countByPredicate(
    notifications,
    (n) => n.priority === "high" && !n.read
  ),
});

export const useNotificationStore = create<NotificationState & NotificationActions>()(
  devtools(
    persist(
      (set, get) => ({
        notifications: [],
        unreadCount: 0,
        criticalCount: 0,
        highCount: 0,
        notificationHistory: [],
        maxHistorySize: MAX_HISTORY_DEFAULT,
        readStateById: {},

        addNotification: (notificationData) => {
          const existingReadState = notificationData.id
            ? get().readStateById[notificationData.id]
            : undefined;
          const notification: Notification = {
            ...notificationData,
            id: notificationData.id ?? createNotificationId(),
            timestamp: notificationData.timestamp ?? Date.now(),
            read: notificationData.read ?? existingReadState ?? false,
            dismissed: notificationData.dismissed ?? false,
          };

          set((state) => {
            const newNotifications = sortNotificationsByTimestampDesc([
              notification,
              ...state.notifications.filter((existing) => existing.id !== notification.id),
            ]);
            const newHistory = sortNotificationsByTimestampDesc([
              notification,
              ...state.notificationHistory,
            ]).slice(0, state.maxHistorySize);

            return {
              notifications: newNotifications,
              notificationHistory: newHistory,
              ...deriveCounts(newNotifications),
            };
          }, false, "addNotification");
        },

        markAsRead: (id) => {
          set((state) => {
            const newNotifications = state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            );

            return {
              notifications: newNotifications,
              readStateById: { ...state.readStateById, [id]: true },
              ...deriveCounts(newNotifications),
            };
          }, false, "markAsRead");
        },

        markAllAsRead: () => {
          set((state) => {
            const newNotifications = state.notifications.map((n) => ({
              ...n,
              read: true,
            }));
            const readStateById = newNotifications.reduce<Record<string, boolean>>(
              (accumulator, notification) => {
                accumulator[notification.id] = true;
                return accumulator;
              },
              { ...state.readStateById }
            );

            return {
              notifications: newNotifications,
              readStateById,
              ...deriveCounts(newNotifications),
            };
          }, false, "markAllAsRead");
        },

        clearReadNotifications: () => {
          set((state) => {
            const remainingNotifications = state.notifications.filter(
              (notification) => !notification.read
            );
            const remainingIds = new Set(
              remainingNotifications.map((notification) => notification.id)
            );
            const readStateById = Object.fromEntries(
              Object.entries(state.readStateById).filter(([id]) => remainingIds.has(id))
            );

            return {
              notifications: remainingNotifications,
              notificationHistory: state.notificationHistory.filter(
                (notification) => !notification.read
              ),
              readStateById,
              ...deriveCounts(remainingNotifications),
            };
          }, false, "clearReadNotifications");
        },

        dismissNotification: (id) => {
          set((state) => {
            const newNotifications = state.notifications.map((n) =>
              n.id === id ? { ...n, dismissed: true } : n
            );

            return {
              notifications: newNotifications,
              ...deriveCounts(newNotifications),
            };
          }, false, "dismissNotification");
        },

        dismissAll: () => {
          set((state) => {
            const notifications = state.notifications.map((n) => ({
              ...n,
              dismissed: true,
            }));

            return {
              notifications,
              ...deriveCounts(notifications),
            };
          }, false, "dismissAll");
        },

        removeNotification: (id) => {
          set((state) => {
            const newNotifications = state.notifications.filter((n) => n.id !== id);
            const readStateById = Object.fromEntries(
              Object.entries(state.readStateById).filter(([entryId]) => entryId !== id)
            );

            return {
              notifications: newNotifications,
              readStateById,
              ...deriveCounts(newNotifications),
            };
          }, false, "removeNotification");
        },

        clearAll: () => {
          set(
            {
              notifications: [],
              unreadCount: 0,
              criticalCount: 0,
              highCount: 0,
              readStateById: {},
            },
            false,
            "clearAll"
          );
        },

        getUnreadNotifications: () => {
          return get().notifications.filter((n) => !n.read && !n.dismissed);
        },

        getNotificationsByType: (type) => {
          return get().notifications.filter(
            (n) => n.type === type && !n.dismissed
          );
        },

        getNotificationsByPriority: (priority) => {
          return get().notifications.filter(
            (n) => n.priority === priority && !n.dismissed
          );
        },

        getNotificationsByAsset: (assetCode) => {
          return get().notifications.filter(
            (n) => n.assetCode === assetCode && !n.dismissed
          );
        },

        setMaxHistorySize: (size) => {
          set((state) => ({
            maxHistorySize: size,
            notificationHistory: state.notificationHistory.slice(0, size),
          }), false, "setMaxHistorySize");
        },
      }),
      {
        name: NOTIFICATION_READ_STATE_KEY,
        storage: createJSONStorage(() => localStorage),
        version: 1,
        partialize: (state) => ({
          readStateById: state.readStateById,
        }),
      }
    ),
    { name: "NotificationStore" }
  )
);

// Selectors for optimized re-renders
export const selectNotifications = (state: NotificationState & NotificationActions) =>
  state.notifications.filter((n) => !n.dismissed);

export const selectUnreadCount = (state: NotificationState & NotificationActions) =>
  state.unreadCount;

export const selectCriticalCount = (state: NotificationState & NotificationActions) =>
  state.criticalCount;

export const selectHighPriorityCount = (state: NotificationState & NotificationActions) =>
  state.highCount;

export const selectNotificationStats = (state: NotificationState & NotificationActions) => ({
  total: state.notifications.filter((n) => !n.dismissed).length,
  unread: state.unreadCount,
  critical: state.criticalCount,
  high: state.highCount,
});

/**
 * Groups visible notifications by priority using the canonical taxonomy order:
 * critical -> high -> medium -> low.
 */
export const selectNotificationsGroupedByPriority = (
  state: NotificationState & NotificationActions
) => {
  const visibleNotifications = state.notifications.filter((n) => !n.dismissed);

  return NOTIFICATION_PRIORITY_ORDER.reduce<Record<NotificationPriority, Notification[]>>(
    (accumulator, priority) => {
      accumulator[priority] = visibleNotifications.filter(
        (notification) => notification.priority === priority
      );
      return accumulator;
    },
    {
      critical: [],
      high: [],
      medium: [],
      low: [],
    }
  );
};
