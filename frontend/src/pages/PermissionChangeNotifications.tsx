import { useEffect, useState, type FormEvent } from "react";
import {
  createPermissionNotification,
  getPermissionNotificationStats,
  listPermissionNotifications,
  markPermissionNotificationRead,
} from "../services/api";
import type {
  PermissionAction,
  PermissionChangeNotificationRecord,
  PermissionNotificationStats,
} from "../types";

const ACTIONS: PermissionAction[] = [
  "ROLE_ASSIGNED",
  "ROLE_REVOKED",
  "PERMISSION_GRANTED",
  "PERMISSION_REVOKED",
];

export default function PermissionChangeNotifications() {
  const [notifications, setNotifications] = useState<PermissionChangeNotificationRecord[]>([]);
  const [stats, setStats] = useState<PermissionNotificationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [form, setForm] = useState({
    targetUserId: "user-operator-42",
    actorId: "super-admin",
    action: "ROLE_ASSIGNED" as PermissionAction,
    permissionOrRole: "SECURITY_OPERATOR",
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resNotes, resStats] = await Promise.all([
        listPermissionNotifications("user-operator-42", unreadOnly),
        getPermissionNotificationStats(),
      ]);
      setNotifications(resNotes.notifications);
      setStats(resStats.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createPermissionNotification({
        targetUserId: form.targetUserId,
        actorId: form.actorId,
        action: form.action,
        permissionOrRole: form.permissionOrRole,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger notification");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await markPermissionNotificationRead(id, "user-operator-42");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark notification read");
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Security & Governance</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Permission Change Notifications</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            User notification dispatch system for role assignments, permission grants, and security policy changes.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Total Notifications</p>
            <p className="mt-2 text-3xl font-semibold text-white">{stats?.total ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Sent Dispatches</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-400">{stats?.byStatus.SENT ?? 0}</p>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr,2fr]">
        <form onSubmit={handleCreate} className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Trigger Permission Alert</h2>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Target User ID</span>
            <input
              type="text"
              value={form.targetUserId}
              onChange={(e) => setForm({ ...form, targetUserId: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Actor ID (Initiator)</span>
            <input
              type="text"
              value={form.actorId}
              onChange={(e) => setForm({ ...form, actorId: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Action Type</span>
            <select
              value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value as PermissionAction })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Role / Permission Name</span>
            <input
              type="text"
              value={form.permissionOrRole}
              onChange={(e) => setForm({ ...form, permissionOrRole: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-stellar-blue px-5 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Dispatching..." : "Dispatch Notification"}
          </button>
        </form>

        <div className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Notification Feed</h2>
            <label className="flex items-center gap-2 text-sm text-stellar-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="rounded border-stellar-border bg-stellar-dark text-stellar-blue"
              />
              Show Unread Only
            </label>
          </div>

          <div className="space-y-4">
            {notifications.length === 0 && (
              <p className="py-8 text-center text-sm text-stellar-text-secondary">
                No permission notifications found.
              </p>
            )}

            {notifications.map((n) => (
              <article
                key={n.id}
                className={`rounded-2xl border p-4 space-y-2 transition ${
                  n.readAt
                    ? "border-stellar-border bg-stellar-dark/40 opacity-70"
                    : "border-stellar-blue/50 bg-stellar-dark/80"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white text-base">{n.action}</span>
                    <span className="rounded-md bg-stellar-blue/15 px-2.5 py-0.5 text-xs text-stellar-blue font-semibold">
                      {n.permissionOrRole}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stellar-text-secondary">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                    {!n.readAt && (
                      <button
                        onClick={() => void handleMarkRead(n.id)}
                        className="rounded-full bg-stellar-blue/20 px-3 py-1 text-xs text-stellar-blue hover:bg-stellar-blue hover:text-white transition"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-300">
                  Target User: <span className="text-white font-medium">{n.targetUserId}</span> | Initiated by:{" "}
                  <span className="text-white font-medium">{n.actorId}</span>
                </p>

                <div className="flex items-center gap-2 text-xs text-stellar-text-secondary">
                  <span>Channels: {n.channels.join(", ")}</span>
                  <span>•</span>
                  <span>Status: {n.status}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
