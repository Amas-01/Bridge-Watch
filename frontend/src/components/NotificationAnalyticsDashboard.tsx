import React, { useState, useEffect } from "react";

interface Analytics {
  totalNotifications: number;
  successCount: number;
  failureCount: number;
  bouncedCount: number;
  deliveredCount: number;
  successRate: number;
  averageDeliveryTimeMs: number;
  byChannel: Record<string, { sent: number; delivered: number; failed: number; bounced: number }>;
}

export function NotificationAnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

        const response = await fetch(
          `/api/v1/notification-analytics/analytics?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
        );
        const data = await response.json();
        setAnalytics(data);
      } catch (error) {
        console.error("Failed to fetch analytics:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  if (loading) return <div className="text-center py-4">Loading analytics...</div>;
  if (!analytics) return <div className="text-center py-4">Failed to load analytics</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6">Notification Delivery Analytics</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded">
          <div className="text-sm font-semibold text-gray-600">Total Notifications</div>
          <div className="text-3xl font-bold text-blue-600">{analytics.totalNotifications}</div>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <div className="text-sm font-semibold text-gray-600">Success Rate</div>
          <div className="text-3xl font-bold text-green-600">{analytics.successRate.toFixed(1)}%</div>
        </div>
        <div className="bg-red-50 p-4 rounded">
          <div className="text-sm font-semibold text-gray-600">Failed</div>
          <div className="text-3xl font-bold text-red-600">{analytics.failureCount}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded">
          <div className="text-sm font-semibold text-gray-600">Avg Delivery Time</div>
          <div className="text-3xl font-bold text-yellow-600">{analytics.averageDeliveryTimeMs}ms</div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">By Channel</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Channel</th>
                <th className="px-4 py-2 text-left font-semibold">Sent</th>
                <th className="px-4 py-2 text-left font-semibold">Delivered</th>
                <th className="px-4 py-2 text-left font-semibold">Failed</th>
                <th className="px-4 py-2 text-left font-semibold">Bounced</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(analytics.byChannel).map(([channel, stats]) => (
                <tr key={channel} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-semibold">{channel}</td>
                  <td className="px-4 py-2">{stats.sent}</td>
                  <td className="px-4 py-2 text-green-600">{stats.delivered}</td>
                  <td className="px-4 py-2 text-red-600">{stats.failed}</td>
                  <td className="px-4 py-2 text-yellow-600">{stats.bounced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
