import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type DeliveryStatus = "sent" | "delivered" | "failed" | "bounced";

export interface NotificationDelivery {
  id: string;
  notificationType: string;
  channel: string;
  recipient: string;
  status: DeliveryStatus;
  deliveryTimeMs: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  sentAt: Date;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryAnalytics {
  totalNotifications: number;
  successCount: number;
  failureCount: number;
  bouncedCount: number;
  deliveredCount: number;
  successRate: number;
  averageDeliveryTimeMs: number;
  byChannel: Record<string, { sent: number; delivered: number; failed: number; bounced: number }>;
}

export class NotificationAnalyticsService {
  async logDelivery(
    notificationType: string,
    channel: string,
    recipient: string,
    status: DeliveryStatus,
    deliveryTimeMs?: number,
    errorMessage?: string,
    metadata?: Record<string, unknown>
  ): Promise<NotificationDelivery> {
    const db = getDatabase();
    const [delivery] = await db("notification_deliveries")
      .insert({
        notification_type: notificationType,
        channel,
        recipient,
        status,
        delivery_time_ms: deliveryTimeMs || null,
        error_message: errorMessage || null,
        metadata: metadata || null,
      })
      .returning("*");
    return this.formatDelivery(delivery);
  }

  async getAnalytics(
    startDate: Date,
    endDate: Date,
    notificationType?: string
  ): Promise<DeliveryAnalytics> {
    const db = getDatabase();

    let query = db("notification_deliveries")
      .whereBetween("sent_at", [startDate, endDate]);

    if (notificationType) {
      query = query.where("notification_type", notificationType);
    }

    const deliveries = await query;
    const byChannel: Record<string, { sent: number; delivered: number; failed: number; bounced: number }> = {};

    for (const delivery of deliveries) {
      if (!byChannel[delivery.channel]) {
        byChannel[delivery.channel] = { sent: 0, delivered: 0, failed: 0, bounced: 0 };
      }
      byChannel[delivery.channel].sent++;
      if (delivery.status === "delivered") byChannel[delivery.channel].delivered++;
      if (delivery.status === "failed") byChannel[delivery.channel].failed++;
      if (delivery.status === "bounced") byChannel[delivery.channel].bounced++;
    }

    const successCount = deliveries.filter((d) => d.status === "delivered").length;
    const failureCount = deliveries.filter((d) => d.status === "failed").length;
    const bouncedCount = deliveries.filter((d) => d.status === "bounced").length;
    const deliveryTimes = deliveries
      .filter((d) => d.delivery_time_ms !== null)
      .map((d) => d.delivery_time_ms as number);
    const averageDeliveryTimeMs =
      deliveryTimes.length > 0 ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length : 0;

    return {
      totalNotifications: deliveries.length,
      successCount,
      failureCount,
      bouncedCount,
      deliveredCount: successCount,
      successRate: deliveries.length > 0 ? (successCount / deliveries.length) * 100 : 0,
      averageDeliveryTimeMs: Math.round(averageDeliveryTimeMs),
      byChannel,
    };
  }

  async getDeliveryHistory(channel: string, limit = 100): Promise<NotificationDelivery[]> {
    const db = getDatabase();
    const deliveries = await db("notification_deliveries")
      .where("channel", channel)
      .orderBy("sent_at", "desc")
      .limit(limit);
    return deliveries.map((d) => this.formatDelivery(d));
  }

  private formatDelivery(row: any): NotificationDelivery {
    return {
      id: row.id,
      notificationType: row.notification_type,
      channel: row.channel,
      recipient: row.recipient,
      status: row.status,
      deliveryTimeMs: row.delivery_time_ms,
      errorMessage: row.error_message,
      metadata: row.metadata,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
