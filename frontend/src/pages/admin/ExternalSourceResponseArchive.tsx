import { useCallback, useEffect, useState } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

// =============================================================================
// TYPES
// =============================================================================

type ResponseOutcome =
  | "ok"
  | "client_error"
  | "server_error"
  | "timeout"
  | "transport_error";

interface ArchivedResponse {
  id: string;
  sourceKey: string;
  endpoint: string;
  method: string;
  requestParams: Record<string, unknown>;
  outcome: ResponseOutcome;
  statusCode: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  contentType: string | null;
  bodyTruncated: boolean;
  bodyHash: string | null;
  bodyBytes: number | null;
  collectionRunId: string | null;
  subject: string | null;
  collectedAt: string;
  expiresAt: string | null;
}

interface ArchiveBody {
  id: string;
  contentType: string | null;
  bodyTruncated: boolean;
  bodyHash: string | null;
  bodyBytes: number | null;
  responseBody: string | null;
}

const OUTCOME_BADGE: Record<ResponseOutcome, { bg: string; text: string; label: string }> = {
  ok: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "OK" },
  client_error: { bg: "bg-amber-500/15", text: "text-amber-300", label: "Client error" },
  server_error: { bg: "bg-red-500/15", text: "text-red-300", label: "Server error" },
  timeout: { bg: "bg-orange-500/15", text: "text-orange-300", label: "Timeout" },
  transport_error: { bg: "bg-red-500/15", text: "text-red-300", label: "Transport error" },
};

const OUTCOMES = Object.keys(OUTCOME_BADGE) as ResponseOutcome[];

async function apiFetch<T>(path: string, apiKey: string, init?: RequestInit): Promise<T> {
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

export default function ExternalSourceResponseArchive() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );

  const [sourceKey, setSourceKey] = useState("");
  const [subject, setSubject] = useState("");
  const [outcome, setOutcome] = useState<ResponseOutcome | "">("");

  const [items, setItems] = useState<ArchivedResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ArchivedResponse | null>(null);
  const [body, setBody] = useState<ArchiveBody | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sourceKey.trim()) params.set("sourceKey", sourceKey.trim());
      if (subject.trim()) params.set("subject", subject.trim());
      if (outcome) params.set("outcome", outcome);
      const data = await apiFetch<{ items: ArchivedResponse[] }>(
        `/sources/response-archive/?${params.toString()}`,
        adminToken
      );
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load response archive");
    } finally {
      setLoading(false);
    }
  }, [adminToken, sourceKey, subject, outcome]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const inspect = async (record: ArchivedResponse) => {
    setSelected(record);
    setBody(null);
    if (!adminToken) return;
    setBodyLoading(true);
    try {
      const data = await apiFetch<ArchiveBody>(
        `/sources/response-archive/${record.id}/body`,
        adminToken
      );
      setBody(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load response body");
    } finally {
      setBodyLoading(false);
    }
  };

  const setLegalHold = async (record: ArchivedResponse, hold: boolean) => {
    if (!adminToken) return;
    try {
      const updated = await apiFetch<ArchivedResponse>(
        `/sources/response-archive/${record.id}/retention`,
        adminToken,
        {
          method: "PATCH",
          body: JSON.stringify({ retentionDays: hold ? null : 30 }),
        }
      );
      setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setSelected((prev) => (prev && prev.id === updated.id ? updated : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update retention");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stellar-text-primary">
          External Source Response Archive
        </h1>
        <p className="text-sm text-stellar-text-secondary">
          Inspect the raw responses Bridge Watch received from external data sources.
          Use this to trace a disputed price, supply, or attestation value back to
          exactly what the upstream source returned.
        </p>
      </header>

      {!adminToken && (
        <label className="block text-sm text-stellar-text-secondary">
          Admin API key
          <input
            type="password"
            className="mt-1 w-full max-w-md rounded border border-stellar-border bg-stellar-surface px-3 py-2 text-stellar-text-primary"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="x-api-key with archive:read"
          />
        </label>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="text-xs text-stellar-text-secondary">
          Source
          <input
            className="mt-1 block rounded border border-stellar-border bg-stellar-surface px-2 py-1 text-sm text-stellar-text-primary"
            value={sourceKey}
            onChange={(e) => setSourceKey(e.target.value)}
            placeholder="coingecko"
          />
        </label>
        <label className="text-xs text-stellar-text-secondary">
          Subject
          <input
            className="mt-1 block rounded border border-stellar-border bg-stellar-surface px-2 py-1 text-sm text-stellar-text-primary"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="XLM"
          />
        </label>
        <label className="text-xs text-stellar-text-secondary">
          Outcome
          <select
            className="mt-1 block rounded border border-stellar-border bg-stellar-surface px-2 py-1 text-sm text-stellar-text-primary"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as ResponseOutcome | "")}
          >
            <option value="">Any</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_BADGE[o].label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-stellar-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-stellar-border">
        <table className="min-w-full text-sm">
          <thead className="bg-stellar-surface text-left text-xs uppercase text-stellar-text-secondary">
            <tr>
              <th className="px-3 py-2">Collected</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Endpoint</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Latency</th>
              <th className="px-3 py-2">Retention</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-stellar-text-secondary">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-stellar-text-secondary">
                  No archived responses match these filters.
                </td>
              </tr>
            )}
            {items.map((r) => {
              const badge = OUTCOME_BADGE[r.outcome];
              return (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-stellar-border hover:bg-stellar-surface/60"
                  onClick={() => void inspect(r)}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-stellar-text-secondary">
                    {new Date(r.collectedAt).toISOString().replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="px-3 py-2 text-stellar-text-primary">{r.sourceKey}</td>
                  <td className="px-3 py-2 text-stellar-text-secondary">{r.endpoint}</td>
                  <td className="px-3 py-2 text-stellar-text-secondary">{r.subject ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-stellar-text-secondary">{r.statusCode ?? "—"}</td>
                  <td className="px-3 py-2 text-stellar-text-secondary">
                    {r.latencyMs != null ? `${r.latencyMs} ms` : "—"}
                  </td>
                  <td className="px-3 py-2 text-stellar-text-secondary">
                    {r.expiresAt ? new Date(r.expiresAt).toISOString().slice(0, 10) : "Legal hold"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="rounded border border-stellar-border bg-stellar-surface p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-medium text-stellar-text-primary">
                {selected.method} {selected.sourceKey}/{selected.endpoint}
              </h2>
              <p className="text-xs text-stellar-text-secondary">
                {selected.id} · collected {selected.collectedAt}
                {selected.collectionRunId ? ` · run ${selected.collectionRunId}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {selected.expiresAt ? (
                <button
                  className="rounded border border-stellar-border px-2 py-1 text-xs text-stellar-text-primary"
                  onClick={() => void setLegalHold(selected, true)}
                >
                  Place legal hold
                </button>
              ) : (
                <button
                  className="rounded border border-stellar-border px-2 py-1 text-xs text-stellar-text-primary"
                  onClick={() => void setLegalHold(selected, false)}
                >
                  Release hold
                </button>
              )}
              <button
                className="rounded border border-stellar-border px-2 py-1 text-xs text-stellar-text-secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
          </div>

          {selected.errorMessage && (
            <p className="text-sm text-red-300">{selected.errorMessage}</p>
          )}

          <div>
            <h3 className="text-xs uppercase text-stellar-text-secondary">Request params</h3>
            <pre className="mt-1 overflow-x-auto rounded bg-stellar-bg p-2 text-xs text-stellar-text-primary">
              {JSON.stringify(selected.requestParams, null, 2)}
            </pre>
          </div>

          <div>
            <h3 className="text-xs uppercase text-stellar-text-secondary">
              Response body
              {body?.bodyTruncated && (
                <span className="ml-2 text-amber-300">
                  truncated · full size {body.bodyBytes} bytes · sha256 {body.bodyHash?.slice(0, 12)}…
                </span>
              )}
            </h3>
            {bodyLoading ? (
              <p className="text-sm text-stellar-text-secondary">Loading body…</p>
            ) : (
              <pre className="mt-1 max-h-96 overflow-auto rounded bg-stellar-bg p-2 text-xs text-stellar-text-primary">
                {body?.responseBody ?? "(no body archived)"}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
