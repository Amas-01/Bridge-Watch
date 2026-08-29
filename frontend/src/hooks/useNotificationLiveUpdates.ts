import { useCallback } from "react";
import { useWebSocket } from "./useWebSocketEnhanced";
import { useNotificationStore, type NotificationPriority, type NotificationType } from "../stores/notificationStore";

interface NotificationEventPayload {
  id?: string;
  title: string;
  message: string;
  priority?: NotificationPriority;
  severity?: "critical" | "warning" | "info";
  notificationType?: NotificationType;
  assetCode?: string;
  bridgeId?: string;
  actionUrl?: string;
  actionLabel?: string;
  timestamp?: number;
}

interface RawNotificationEvent {
  type?: string;
  channel?: string;
  data?: NotificationEventPayload;
}

const severityToPriority: Record<"critical" | "warning" | "info", NotificationPriority> = {
  critical: "critical",
  warning: "high",
  info: "medium",
};

const fallbackTypeByPriority: Record<NotificationPriority, NotificationType> = {
  critical: "system",
  high: "system",
  medium: "info",
  low: "info",
};

/**
 * Subscribes to the app's existing notifications channel and forwards incoming
 * notification events into the Zustand notification store.
 *
 * Notification lifecycle:
 * 1) Events arrive from the notifications channel.
 * 2) Payloads are normalized to the store's notification schema.
 * 3) Notifications are inserted and grouped by priority in the drawer selector.
 * 4) Read state is managed by store actions and persisted by identifier.
 * 5) Read notifications can be bulk-cleared from the active list.
 */
export function useNotificationLiveUpdates() {
  const addNotification = useNotificationStore((state) => state.addNotification);

  const handleIncomingMessage = useCallback(
    (payload: unknown) => {
      const event = payload as RawNotificationEvent;
      const eventPayload = event.data;

      if ((event.type !== "notification" && event.channel !== "notifications") || !eventPayload) {
        return;
      }

      if (!eventPayload.title || !eventPayload.message) {
        return;
      }

      const derivedPriority =
        eventPayload.priority ??
        (eventPayload.severity ? severityToPriority[eventPayload.severity] : "medium");

      addNotification({
        id: eventPayload.id,
        type: eventPayload.notificationType ?? fallbackTypeByPriority[derivedPriority],
        priority: derivedPriority,
        title: eventPayload.title,
        message: eventPayload.message,
        assetCode: eventPayload.assetCode,
        bridgeId: eventPayload.bridgeId,
        actionUrl: eventPayload.actionUrl,
        actionLabel: eventPayload.actionLabel,
        timestamp: eventPayload.timestamp,
      });
    },
    [addNotification]
  );

  useWebSocket("notifications", handleIncomingMessage);
}
