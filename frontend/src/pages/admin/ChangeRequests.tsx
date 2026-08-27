import { useEffect, useState, type FormEvent } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

// =============================================================================
// TYPES
// =============================================================================

type ChangeRequestStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "applied"
  | "cancelled";

type ChangeType =
  | "config_update"
  | "rule_change"
  | "sampling_update"
  | "other";

interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  changeType: ChangeType;
  payload: Record<string, unknown>;
  status: ChangeRequestStatus;
  submittedBy: string;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CHANGE_TYPES: ChangeType[] = [
  "config_update",
  "rule_change",
  "sampling_update",
  "other",
];

const STATUS_TABS: { label: string; value: ChangeRequestStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending_approval" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Applied", value: "applied" },
];

const STATUS_BADGE: Record<
  ChangeRequestStatus,
  { bg: string; text: string; label: string }
> = {
  draft: { bg: "bg-stellar-border/40", text: "text-stellar-text-secondary", label: "Draft" },
  pending_approval: {
    bg: "bg-yellow-500/15",
    text: "text-yellow-300",
    label: "Pending approval",
  },
  approved: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Approved" },
  rejected: { bg: "bg-red-500/15", text: "text-red-300", label: "Rejected" },
  applied: { bg: "bg-blue-500/15", text: "text-blue-300", label: "Applied" },
  cancelled: {
    bg: "bg-stellar-border/40",
    text: "text-stellar-text-secondary",
    label: "Cancelled",
  },
};

const INITIAL_FORM = {
  title: "",
  description: "",
  changeType: "config_update" as ChangeType,
  payloadText: "{}",
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
  if (res.status === 204) return {} as T;
  return res.json();
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ChangeRequests() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ChangeRequestStatus | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [payloadError, setPayloadError] = useState<string | null>(null);

  // Review panel state
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");

  const loadRequests = async () => {
    if (!adminToken) {
      setRequests([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeTab !== "all") params.set("status", activeTab);
      const qs = params.toString();
      const data = await apiFetch<{ requests: ChangeRequest[] }>(
        `/admin/change-requests${qs ? `?${qs}` : ""}`,
        adminToken
      );
      setRequests(data.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load change requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken, activeTab]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken) {
      setError("Enter an admin token first.");
      return;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(form.payloadText) as Record<string, unknown>;
      setPayloadError(null);
    } catch {
      setPayloadError("Payload must be valid JSON.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiFetch("/admin/change-requests", adminToken, {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          changeType: form.changeType,
          payload,
        }),
      });
      setForm(INITIAL_FORM);
      setShowForm(false);
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create request");
    } finally {
      setLoading(false);
    }
  };

  const handleTransition = async (
    id: string,
    action: "submit" | "approve" | "reject" | "apply" | "cancel",
    comment?: string
  ) => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (comment !== undefined) body.comment = comment;
      await apiFetch(`/admin/change-requests/${id}/${action}`, adminToken, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setReviewingId(null);
      setReviewComment("");
      await loadRequests();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : `Failed to ${action} change request`
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredRequests =
    activeTab === "all"
      ? requests
      : requests.filter((r) => r.status === activeTab);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            Change approval workflow
          </h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Gate operational configuration changes behind a two-person review
            process. The approver must be a different person from the submitter
            (four-eyes principle).
          </p>
        </div>
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
            Pending review
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {requests.filter((r) => r.status === "pending_approval").length}
          </p>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            Total: {requests.length}
          </p>
        </div>
      </header>

      {/* Admin token */}
      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white">
            Admin token
          </span>
          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Paste admin API key"
            className="w-full max-w-sm rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
          />
        </label>
      </section>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {/* Tab bar + new button */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              activeTab === tab.value
                ? "border-stellar-blue bg-stellar-blue/10 text-white"
                : "border-stellar-border text-stellar-text-secondary hover:border-stellar-blue hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
        >
          {showForm ? "Hide form" : "New request"}
        </button>
        <button
          type="button"
          onClick={() => void loadRequests()}
          className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
        >
          Refresh
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            New change request
          </h2>
          <form onSubmit={handleCreate} className="grid gap-5 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">
                Title <span aria-hidden>*</span>
              </span>
              <input
                required
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="Increase rate limit threshold for USDC bridge"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">
                Description <span aria-hidden>*</span>
              </span>
              <textarea
                required
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Describe the change and the reason for it"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue resize-none"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Change type
              </span>
              <select
                value={form.changeType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    changeType: e.target.value as ChangeType,
                  }))
                }
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none focus:border-stellar-blue"
              >
                {CHANGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">
                Payload (JSON)
              </span>
              <textarea
                rows={4}
                value={form.payloadText}
                onChange={(e) => {
                  setForm((f) => ({ ...f, payloadText: e.target.value }));
                  setPayloadError(null);
                }}
                spellCheck={false}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 font-mono text-xs text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue resize-none"
              />
              {payloadError && (
                <p className="mt-1 text-xs text-red-300">{payloadError}</p>
              )}
            </label>

            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating…" : "Create draft"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(INITIAL_FORM);
                }}
                className="rounded-2xl border border-stellar-border px-5 py-3 text-sm font-semibold text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Request list */}
      <section className="space-y-4">
        {loading && filteredRequests.length === 0 ? (
          <div className="py-10 text-center text-sm text-stellar-text-secondary">
            Loading…
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-10 text-center text-sm text-stellar-text-secondary">
            {adminToken
              ? "No change requests found for this filter."
              : "Add an admin token to load change requests."}
          </div>
        ) : (
          filteredRequests.map((req) => (
            <article
              key={req.id}
              className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">
                      {req.title}
                    </h3>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${STATUS_BADGE[req.status].bg} ${STATUS_BADGE[req.status].text}`}
                    >
                      {STATUS_BADGE[req.status].label}
                    </span>
                    <span className="text-xs text-stellar-text-secondary rounded-full border border-stellar-border px-2 py-0.5">
                      {req.changeType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm text-stellar-text-secondary mb-2">
                    {req.description}
                  </p>
                  <p className="text-xs text-stellar-text-secondary">
                    Submitted by: <span className="text-white">{req.submittedBy}</span>
                    {req.submittedAt && (
                      <> · {new Date(req.submittedAt).toLocaleString()}</>
                    )}
                  </p>
                  {req.reviewedBy && (
                    <p className="text-xs text-stellar-text-secondary mt-1">
                      Reviewed by: <span className="text-white">{req.reviewedBy}</span>
                      {req.reviewComment && (
                        <> · <span className="italic">{req.reviewComment}</span></>
                      )}
                    </p>
                  )}

                  {/* Payload preview */}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-stellar-text-secondary hover:text-white">
                      Show payload
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-2xl border border-stellar-border bg-stellar-dark p-3 text-xs text-white">
                      {JSON.stringify(req.payload, null, 2)}
                    </pre>
                  </details>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  {req.status === "draft" && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleTransition(req.id, "submit")}
                        className="rounded-full bg-stellar-blue/20 border border-stellar-blue/40 px-3 py-1.5 text-xs font-semibold text-stellar-blue transition hover:bg-stellar-blue/30"
                      >
                        Submit for review
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTransition(req.id, "cancel")}
                        className="rounded-full border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary transition hover:border-red-500/40 hover:text-red-300"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {req.status === "pending_approval" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setReviewingId(reviewingId === req.id ? null : req.id)}
                        className="rounded-full bg-emerald-500/15 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTransition(req.id, "cancel")}
                        className="rounded-full border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary transition hover:border-red-500/40 hover:text-red-300"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {req.status === "approved" && (
                    <button
                      type="button"
                      onClick={() => void handleTransition(req.id, "apply")}
                      className="rounded-full bg-blue-500/15 border border-blue-500/40 px-3 py-1.5 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/25"
                    >
                      Apply change
                    </button>
                  )}
                </div>
              </div>

              {/* Inline review panel */}
              {reviewingId === req.id && req.status === "pending_approval" && (
                <div className="mt-4 rounded-2xl border border-stellar-border bg-stellar-dark/50 p-4 space-y-3">
                  <p className="text-sm font-medium text-white">Review comment</p>
                  <textarea
                    rows={2}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Optional for approval, required for rejection"
                    className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white text-sm outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue resize-none"
                    aria-label="Review comment"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleTransition(req.id, "approve", reviewComment)
                      }
                      className="rounded-full bg-emerald-500/15 border border-emerald-500/40 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!reviewComment.trim()) {
                          setError(
                            "A review comment is required when rejecting."
                          );
                          return;
                        }
                        void handleTransition(req.id, "reject", reviewComment);
                      }}
                      className="rounded-full bg-red-500/15 border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/25"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewingId(null);
                        setReviewComment("");
                      }}
                      className="rounded-full border border-stellar-border px-4 py-2 text-xs text-stellar-text-secondary transition hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
