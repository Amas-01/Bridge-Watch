import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertService,
  createAlertRoutingRule,
  deleteAlertRoutingRule,
  getAlertRoutingAudit,
  listAlertRoutingRules,
  updateAlertRoutingRule,
} from "../services/api";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import type {
  AlertRoutingAuditEntry,
  AlertRoutingChannel,
  AlertRoutingRule,
  AlertRoutingSeverity,
} from "../types";

const ALL_SEVERITIES: AlertRoutingSeverity[] = ["critical", "high", "medium", "low"];
const ALL_CHANNELS: AlertRoutingChannel[] = ["in_app", "webhook", "email"];

interface RuleFormState {
  name: string;
  ownerAddress: string;
  severityLevels: AlertRoutingSeverity[];
  channels: AlertRoutingChannel[];
  fallbackChannels: AlertRoutingChannel[];
  assetCodesText: string;
  sourceTypesText: string;
  suppressionWindowSeconds: number;
  priorityOrder: number;
  isActive: boolean;
}

const INITIAL_FORM: RuleFormState = {
  name: "",
  ownerAddress: "",
  severityLevels: ["critical", "high", "medium", "low"],
  channels: ["in_app"],
  fallbackChannels: ["in_app"],
  assetCodesText: "",
  sourceTypesText: "",
  suppressionWindowSeconds: 0,
  priorityOrder: 100,
  isActive: true,
};

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function AlertRoutingAdmin() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [ownerFilter, setOwnerFilter] = useState("");
  const [rules, setRules] = useState<AlertRoutingRule[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [audit, setAudit] = useState<AlertRoutingAuditEntry[]>([]);
  const [form, setForm] = useState<RuleFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRules = useMemo(() => rules.filter((rule) => rule.isActive).length, [rules]);

  const loadData = async () => {
    if (!adminToken) {
      setRules([]);
      setAudit([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [rulesResponse, auditResponse] = await Promise.all([
        listAlertRoutingRules(adminToken, ownerFilter.trim() || undefined),
        getAlertRoutingAudit(adminToken, {
          ownerAddress: ownerFilter.trim() || undefined,
          limit: 100,
        }),
      ]);
      setRules(rulesResponse.rules);
      setAudit(auditResponse.entries);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load alert routing data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const toggleEnum = <T extends string>(
    values: T[],
    value: T,
    fallback: T
  ): T[] => {
    const set = new Set(values);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    if (set.size === 0) {
      set.add(fallback);
    }
    return Array.from(set);
  };

  const handleCreateRule = async (event: FormEvent) => {
    event.preventDefault();

    if (!adminToken) {
      setError("Enter an admin token first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createAlertRoutingRule(adminToken, {
        name: form.name,
        ownerAddress: form.ownerAddress.trim() || undefined,
        severityLevels: form.severityLevels,
        assetCodes: parseCsv(form.assetCodesText),
        sourceTypes: parseCsv(form.sourceTypesText),
        channels: form.channels,
        fallbackChannels: form.fallbackChannels,
        suppressionWindowSeconds: form.suppressionWindowSeconds,
        priorityOrder: form.priorityOrder,
        isActive: form.isActive,
      });

      setForm(INITIAL_FORM);
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create routing rule");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (rule: AlertRoutingRule) => {
    if (!adminToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await updateAlertRoutingRule(adminToken, rule.id, { isActive: !rule.isActive });
      await loadData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update rule");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!adminToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await deleteAlertRoutingRule(adminToken, id);
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete rule");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectRule = (id: string) => {
    setSelectedRuleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedRuleIds.length === rules.length && rules.length > 0) {
      setSelectedRuleIds([]);
    } else {
      setSelectedRuleIds(rules.map((r) => r.id));
    }
  };

  const handleBulkUpdateActive = async (isActive: boolean) => {
    if (!adminToken || selectedRuleIds.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await AlertService.bulkUpdateRules(adminToken, selectedRuleIds, isActive);
      setSelectedRuleIds([]);
      await loadData();
    } catch (bulkError) {
      setError(
        bulkError instanceof Error
          ? bulkError.message
          : `Failed to bulk ${isActive ? "enable" : "disable"} rules`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Alert routing</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Route alert events by severity, source, and asset with suppression windows,
            fallback channels, and full dispatch audit history.
          </p>
        </div>

        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
            Active rules
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">{activeRules}</p>
          <p className="mt-1 text-sm text-stellar-text-secondary">Total rules: {rules.length}</p>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <form
          onSubmit={handleCreateRule}
          className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6 space-y-6"
        >
          <div>
            <h2 className="text-xl font-semibold text-white">Create routing rule</h2>
            <p className="mt-1 text-sm text-stellar-text-secondary">
              Rules are evaluated in ascending priority order. The first matching rule drives
              channel dispatch.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Admin token</span>
            <input
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Paste admin API key"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Rule name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Critical bridge incidents"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Owner address (optional)
              </span>
              <input
                type="text"
                value={form.ownerAddress}
                onChange={(event) =>
                  setForm((current) => ({ ...current, ownerAddress: event.target.value }))
                }
                placeholder="G..."
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white">Severities</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {ALL_SEVERITIES.map((severity) => {
                const checked = form.severityLevels.includes(severity);
                return (
                  <button
                    key={severity}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        severityLevels: toggleEnum(current.severityLevels, severity, "critical"),
                      }))
                    }
                    className={`rounded-2xl border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-stellar-blue bg-stellar-blue/10 text-white"
                        : "border-stellar-border bg-stellar-dark text-stellar-text-secondary"
                    }`}
                  >
                    {severity}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white">Primary channels</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {ALL_CHANNELS.map((channel) => {
                const checked = form.channels.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        channels: toggleEnum(current.channels, channel, "in_app"),
                      }))
                    }
                    className={`rounded-2xl border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-stellar-blue bg-stellar-blue/10 text-white"
                        : "border-stellar-border bg-stellar-dark text-stellar-text-secondary"
                    }`}
                  >
                    {channel}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white">Fallback channels</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {ALL_CHANNELS.map((channel) => {
                const checked = form.fallbackChannels.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        fallbackChannels: toggleEnum(
                          current.fallbackChannels,
                          channel,
                          "in_app"
                        ),
                      }))
                    }
                    className={`rounded-2xl border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-stellar-blue bg-stellar-blue/10 text-white"
                        : "border-stellar-border bg-stellar-dark text-stellar-text-secondary"
                    }`}
                  >
                    {channel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Asset filter (CSV)
              </span>
              <input
                type="text"
                value={form.assetCodesText}
                onChange={(event) =>
                  setForm((current) => ({ ...current, assetCodesText: event.target.value }))
                }
                placeholder="USDC, EURC"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Source filter (CSV)
              </span>
              <input
                type="text"
                value={form.sourceTypesText}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sourceTypesText: event.target.value }))
                }
                placeholder="bridge_downtime, supply_mismatch"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Suppression (sec)</span>
              <input
                type="number"
                min={0}
                value={form.suppressionWindowSeconds}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    suppressionWindowSeconds: Number(event.target.value),
                  }))
                }
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Priority order</span>
              <input
                type="number"
                min={1}
                value={form.priorityOrder}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priorityOrder: Number(event.target.value),
                  }))
                }
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="flex items-center justify-between rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 mt-6 sm:mt-0">
              <span className="text-sm font-medium text-white">Active</span>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isActive: event.target.checked }))
                }
                className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving..." : "Create rule"}
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-2xl border border-stellar-border px-5 py-3 text-sm font-semibold text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
            >
              Refresh
            </button>
          </div>
        </form>

        <section className="space-y-6">
          <div className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-white">Rules</h2>
                {selectedRuleIds.length > 0 && (
                  <span className="rounded-full bg-stellar-blue/20 px-2.5 py-0.5 text-xs font-medium text-stellar-blue">
                    {selectedRuleIds.length} selected
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedRuleIds.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateActive(true)}
                      disabled={loading}
                      className="rounded-xl bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-600/30 disabled:opacity-50"
                    >
                      Bulk Enable
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdateActive(false)}
                      disabled={loading}
                      className="rounded-xl bg-amber-600/20 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-600/30 disabled:opacity-50"
                    >
                      Bulk Disable
                    </button>
                  </>
                )}

                <input
                  type="text"
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value)}
                  placeholder="Filter owner"
                  className="w-44 rounded-xl border border-stellar-border bg-stellar-dark px-3 py-2 text-xs text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
                />
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {rules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
                  No routing rules found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-stellar-border text-xs uppercase tracking-wider text-stellar-text-secondary">
                        <th className="py-3 px-3 w-10">
                          <input
                            type="checkbox"
                            checked={rules.length > 0 && selectedRuleIds.length === rules.length}
                            onChange={handleToggleSelectAll}
                            className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
                            aria-label="Select all rules"
                          />
                        </th>
                        <th className="py-3 px-3 font-semibold text-white">Rule</th>
                        <th className="py-3 px-3 font-semibold text-white">Order</th>
                        <th className="py-3 px-3 font-semibold text-white">Channels</th>
                        <th className="py-3 px-3 font-semibold text-white">Status</th>
                        <th className="py-3 px-3 font-semibold text-white text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stellar-border/50 text-sm">
                      {rules.map((rule) => {
                        const isSelected = selectedRuleIds.includes(rule.id);
                        return (
                          <tr
                            key={rule.id}
                            className={`transition hover:bg-stellar-dark/50 ${
                              isSelected ? "bg-stellar-blue/5" : ""
                            }`}
                          >
                            <td className="py-3 px-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectRule(rule.id)}
                                className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
                                aria-label={`Select rule ${rule.name}`}
                              />
                            </td>
                            <td className="py-3 px-3">
                              <p className="font-semibold text-white">{rule.name}</p>
                              <p className="text-xs text-stellar-text-secondary">
                                Owner: {rule.ownerAddress ?? "global"}
                              </p>
                            </td>
                            <td className="py-3 px-3 text-xs text-stellar-text-secondary">
                              {rule.priorityOrder}
                            </td>
                            <td className="py-3 px-3 text-xs text-stellar-text-secondary">
                              <span>{rule.channels.join(", ")}</span>
                              {rule.fallbackChannels.length > 0 && (
                                <span className="block text-[11px] opacity-75">
                                  fallback: {rule.fallbackChannels.join(", ")}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                                  rule.isActive
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-red-500/15 text-red-300"
                                }`}
                              >
                                {rule.isActive ? "active" : "inactive"}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleToggleActive(rule)}
                                  className="rounded-full border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
                                >
                                  {rule.isActive ? "Disable" : "Enable"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteRule(rule.id)}
                                  className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/10"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
            <h2 className="text-xl font-semibold text-white">Dispatch audit</h2>
            <p className="mt-1 text-sm text-stellar-text-secondary">
              Latest routing outcomes for suppression, primary dispatch, and fallback behavior.
            </p>

            <div className="mt-4 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
              {audit.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
                  No routing audit entries yet.
                </div>
              ) : (
                audit.map((entry) => (
                  <article key={entry.id} className="rounded-2xl border border-stellar-border bg-stellar-dark/70 p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-white">
                        {entry.assetCode} • {entry.sourceType}
                      </span>
                      <span className="text-stellar-text-secondary">{entry.status}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-stellar-text-secondary">
                      {entry.channel} • {new Date(entry.createdAt).toLocaleString()}
                    </p>
                    {entry.reason && (
                      <p className="mt-1 text-[11px] text-red-300">{entry.reason}</p>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
