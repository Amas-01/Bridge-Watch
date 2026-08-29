import { Knex } from "knex";
import {
  MaintenanceCalendarModel,
  MaintenanceWindow,
} from "../database/models/MaintenanceCalendar.js";
import { logger } from "../utils/logger.js";

export class MaintenanceCalendarService {
  private model: MaintenanceCalendarModel;

  constructor(private db: Knex) {
    this.model = new MaintenanceCalendarModel(db);
  }

  async scheduleMaintenanceWindow(
    window: Omit<MaintenanceWindow, "id" | "created_at" | "updated_at">,
  ): Promise<MaintenanceWindow> {
    if (window.scheduled_end <= window.scheduled_start) {
      throw new Error("Scheduled end must be after scheduled start");
    }

    const created = await this.model.createMaintenanceWindow(window);

    if (window.notify_users) {
      await this.scheduleNotifications(created.id, created.scheduled_start);
    }

    logger.info({ windowId: created.id }, "Scheduled maintenance window");
    return created;
  }

  async startMaintenance(windowId: string): Promise<MaintenanceWindow> {
    const window = await this.model.updateMaintenanceWindow(windowId, {
      status: "in_progress",
      actual_start: new Date(),
    });

    logger.info({ windowId }, "Started maintenance window");
    return window;
  }

  async completeMaintenance(windowId: string): Promise<MaintenanceWindow> {
    const window = await this.model.updateMaintenanceWindow(windowId, {
      status: "completed",
      actual_end: new Date(),
    });

    logger.info({ windowId }, "Completed maintenance window");
    return window;
  }

  async cancelMaintenance(windowId: string): Promise<MaintenanceWindow> {
    const window = await this.model.updateMaintenanceWindow(windowId, {
      status: "cancelled",
    });

    logger.info({ windowId }, "Cancelled maintenance window");
    return window;
  }

  async getUpcomingMaintenance(days: number = 7): Promise<MaintenanceWindow[]> {
    return await this.model.getUpcomingMaintenance(days);
  }

  async processPendingNotifications(): Promise<number> {
    const pending = await this.model.getPendingNotifications();
    let sent = 0;

    for (const notification of pending) {
      try {
        await this.sendNotification(notification);
        await this.model.markNotificationSent(notification.id);
        sent++;
      } catch (error: any) {
        logger.error(
          { notificationId: notification.id, error: error.message },
          "Failed to send notification",
        );
      }
    }

    return sent;
  }

  private async scheduleNotifications(
    windowId: string,
    scheduledStart: Date,
  ): Promise<void> {
    const notifications = [
      { hoursBeforeMillis: 24 * 60 * 60 * 1000, type: "email" as const },
      { hoursBeforeMillis: 1 * 60 * 60 * 1000, type: "in_app" as const },
    ];

    for (const notif of notifications) {
      const scheduledSendAt = new Date(
        scheduledStart.getTime() - notif.hoursBeforeMillis,
      );

      if (scheduledSendAt > new Date()) {
        await this.model.createNotification({
          maintenance_window_id: windowId,
          notification_type: notif.type,
          scheduled_send_at: scheduledSendAt,
          status: "pending",
          recipients: {},
        });
      }
    }
  }

  private async sendNotification(notification: any): Promise<void> {
    // Placeholder implementation
    logger.info({ notificationId: notification.id }, "Sending notification");
  }
}
