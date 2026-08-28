import { useEffect, useState, type FormEvent } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

// =============================================================================
// TYPES
// =============================================================================

type AvailabilityStatus = "available" | "unavailable" | "on_call";

interface AvailabilityEntry {
  id: string;
  operator: string;
  status: AvailabilityStatus;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_by: string;
}

const STATUS_BADGE: Record<AvailabilityStatus, { bg: string; text: string; label: string }> = {
  available: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Available" },
  unavailable: { bg: "bg-stellar-border/40", text: "text-stellar-text-secondary", label: "Unavailable" },
  on_call: { bg: "bg-yellow-500/15", text: "text-yellow-300", label: "On call" },
};

async function apiFetch<T>(
  path: string,
  apiKey: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      msg = body.message ?? body.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

function startOfWeek(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - day);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function endOfWeekPlus(start: Date, days: number): Date {
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + days);
  return end;
}

const INITIAL_FORM = {
  operator: "",
  status: "available" as AvailabilityStatus,
  startTime: "",
  endTime: "",
  notes: "",
};

// =============================================================================
// COMPONENT
// =============================================================================

export default function OperatorAvailabilityCalendar() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );

  const [calendar, setCalendar] = useState<Record<string, AvailabilityEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const rangeStart = startOfWeek();
  const rangeEnd = endOfWeekPlus(rangeStart, 14);

  const loadCalendar = async () => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ calendar: Record<string, AvailabilityEntry[]> }>(
        `/operator/availability/calendar?from=${rangeStart.toISOString()}&to=${rangeEnd.toISOString()}`,
        adminToken
      );
      setCalendar(data.calendar);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load operator calendar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setCreateError(null);

    if (!form.operator.trim() || !form.startTime || !form.endTime) {
      setCreateError("Operator, start time, and end time are required.");
      return;
    }

    setCreateLoading(true);
    try {
      await apiFetch("/operator/availability", adminToken, {
        method: "POST",
        body: JSON.stringify({
          operator: form.operator.trim(),
          status: form.status,
          startTime: new Date(form.startTime).toISOString(),
          endTime: new Date(form.endTime).toISOString(),
          notes: form.notes.trim() || undefined,
          createdBy: form.operator.trim(),
        }),
      });
      setForm(INITIAL_FORM);
      setShowCreate(false);
      await loadCalendar();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to add availability entry");
    } finally {
      setCreateLoading(false);
    }
  };

  const operators = Object.keys(calendar).sort();

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Operations</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Operator availability calendar</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            See who is available, on call, or unavailable over the next two weeks,
            and add new availability windows for operators.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
        >
          {showCreate ? "Hide" : "Add availability"}
        </button>
      </header>

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white">Admin token</span>
          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Paste admin API key"
            className="w-full max-w-sm rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
          />
        </label>
      </section>

      {showCreate && (
        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Add availability window</h2>
          <form onSubmit={handleCreate} className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Operator <span aria-hidden>*</span>
              </span>
              <input
                required
                type="text"
                value={form.operator}
                onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
                placeholder="op_alice"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as AvailabilityStatus }))
                }
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              >
                <option value="available">Available</option>
                <option value="on_call">On call</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Start time <span aria-hidden>*</span>
              </span>
              <input
                required
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                End time <span aria-hidden>*</span>
              </span>
              <input
                required
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">Notes</span>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="On PTO / covering for op_bob"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            {createError && (
              <p className="sm:col-span-2 text-sm text-red-300" role="alert">{createError}</p>
            )}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={createLoading}
                className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
              >
                {createLoading ? "Saving…" : "Add availability"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">
          Next 14 days ({rangeStart.toISOString().slice(0, 10)} – {rangeEnd.toISOString().slice(0, 10)})
        </h2>

        {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
        {loading && <p className="text-sm text-stellar-text-secondary">Loading…</p>}

        {!loading && !error && operators.length === 0 && (
          <p className="text-sm text-stellar-text-secondary">
            No availability entries in this window.
          </p>
        )}

        {operators.length > 0 && (
          <div className="space-y-6">
            {operators.map((operator) => (
              <div key={operator}>
                <h3 className="mb-2 text-sm font-semibold text-white">{operator}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-stellar-border text-xs uppercase tracking-wider text-stellar-text-secondary">
                        <th className="py-2 px-3 font-semibold text-white">Status</th>
                        <th className="py-2 px-3 font-semibold text-white">Start</th>
                        <th className="py-2 px-3 font-semibold text-white">End</th>
                        <th className="py-2 px-3 font-semibold text-white">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stellar-border/50">
                      {calendar[operator].map((entry) => {
                        const badge = STATUS_BADGE[entry.status];
                        return (
                          <tr key={entry.id}>
                            <td className="py-2 px-3">
                              <span className={`rounded-full px-3 py-1 text-xs ${badge.bg} ${badge.text}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-stellar-text-secondary">
                              {new Date(entry.start_time).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-stellar-text-secondary">
                              {new Date(entry.end_time).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-stellar-text-secondary">{entry.notes ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
