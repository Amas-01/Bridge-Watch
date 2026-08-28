import { useState, type FormEvent } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

// =============================================================================
// TYPES
// =============================================================================

interface OwnershipTransfer {
  id: string;
  incident_id: string;
  from_operator: string | null;
  to_operator: string;
  initiated_by: string;
  reason: string | null;
  transferred_at: string;
}

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

// =============================================================================
// COMPONENT
// =============================================================================

export default function IncidentOwnershipTransfer() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );

  const [incidentId, setIncidentId] = useState("");
  const [toOperator, setToOperator] = useState("");
  const [initiatedBy, setInitiatedBy] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [lookupIncidentId, setLookupIncidentId] = useState("");
  const [history, setHistory] = useState<OwnershipTransfer[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken || !lookupIncidentId.trim()) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await apiFetch<{ data: OwnershipTransfer[] }>(
        `/incidents/${encodeURIComponent(lookupIncidentId.trim())}/ownership-transfers`,
        adminToken
      );
      setHistory(data.data);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed to load transfer history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleTransfer = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!incidentId.trim() || !toOperator.trim() || !initiatedBy.trim() || !adminToken) {
      setError("Incident ID, new owner, and initiated by are required.");
      return;
    }

    setLoading(true);
    try {
      await apiFetch(
        `/incidents/${encodeURIComponent(incidentId.trim())}/transfer-ownership`,
        adminToken,
        {
          method: "POST",
          body: JSON.stringify({
            toOperator: toOperator.trim(),
            initiatedBy: initiatedBy.trim(),
            reason: reason.trim() || undefined,
          }),
        }
      );
      setSuccessMessage(`Ownership of incident ${incidentId.trim()} transferred to ${toOperator.trim()}.`);
      setToOperator("");
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to transfer incident ownership");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Incidents</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Incident ownership transfer</h1>
        <p className="mt-2 max-w-2xl text-stellar-text-secondary">
          Reassign an open incident to a different operator, with a recorded
          audit trail of who handed it off, who took it on, and why.
        </p>
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

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">Transfer ownership</h2>
        <form onSubmit={handleTransfer} className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">
              Incident ID <span aria-hidden>*</span>
            </span>
            <input
              required
              type="text"
              value={incidentId}
              onChange={(e) => setIncidentId(e.target.value)}
              placeholder="incident-123"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">
              New owner <span aria-hidden>*</span>
            </span>
            <input
              required
              type="text"
              value={toOperator}
              onChange={(e) => setToOperator(e.target.value)}
              placeholder="op_bob"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">
              Initiated by <span aria-hidden>*</span>
            </span>
            <input
              required
              type="text"
              value={initiatedBy}
              onChange={(e) => setInitiatedBy(e.target.value)}
              placeholder="op_alice"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Reason</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Going off shift"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          {error && <p className="sm:col-span-2 text-sm text-red-300" role="alert">{error}</p>}
          {successMessage && (
            <p className="sm:col-span-2 text-sm text-emerald-300">{successMessage}</p>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={loading || !adminToken}
              className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {loading ? "Transferring…" : "Transfer ownership"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">Transfer history</h2>
        <form onSubmit={loadHistory} className="flex flex-wrap items-end gap-4">
          <label className="block flex-1">
            <span className="mb-2 block text-sm font-medium text-white">Incident ID</span>
            <input
              type="text"
              value={lookupIncidentId}
              onChange={(e) => setLookupIncidentId(e.target.value)}
              placeholder="incident-123"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <button
            type="submit"
            disabled={!adminToken || !lookupIncidentId.trim()}
            className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            Load history
          </button>
        </form>

        {historyError && <p className="mt-3 text-sm text-red-300" role="alert">{historyError}</p>}
        {historyLoading && <p className="mt-4 text-sm text-stellar-text-secondary">Loading…</p>}

        {history.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-stellar-border text-xs uppercase tracking-wider text-stellar-text-secondary">
                  <th className="py-3 px-3 font-semibold text-white">From</th>
                  <th className="py-3 px-3 font-semibold text-white">To</th>
                  <th className="py-3 px-3 font-semibold text-white">Initiated by</th>
                  <th className="py-3 px-3 font-semibold text-white">Reason</th>
                  <th className="py-3 px-3 font-semibold text-white">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border/50">
                {history.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3 px-3 text-stellar-text-secondary">{t.from_operator ?? "Unassigned"}</td>
                    <td className="py-3 px-3 text-white">{t.to_operator}</td>
                    <td className="py-3 px-3 text-stellar-text-secondary">{t.initiated_by}</td>
                    <td className="py-3 px-3 text-stellar-text-secondary">{t.reason ?? "—"}</td>
                    <td className="py-3 px-3 text-stellar-text-secondary">
                      {new Date(t.transferred_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
