/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { MetricCard } from "../components/ops/MetricCard";
import { ActionShortcutButton } from "../components/ops/ActionShortcutButton";
import { ConfirmationModal } from "../components/ops/ConfirmationModal";
import { MockAuthProvider, useAuth } from "../context/AuthContext";

const mockMetrics = () => ({
  bridgeStatus: "ONLINE",
  totalVolumeUsd: "$12,345,678",
  txSuccessRate: "99.2%",
  activeOraclePeers: 8,
});

const ACTIONS = [
  {
    id: "pause-bridge",
    label: "Pause Bridge Contract",
    description: "Trigger an emergency pause on the bridge contract",
    requiredRole: "SuperAdmin",
    destructive: true,
    confirmationPhrase: "CONFIRM HALT",
  },
  {
    id: "force-sync-ledger",
    label: "Force Sync Ledger",
    description: "Enqueue a re-sync job for ledger data",
    requiredRole: "Operator",
    destructive: false,
  },
  {
    id: "rotate-oracle-keys",
    label: "Rotate Oracle Keys",
    description: "Rotate keys used by oracle ingestion providers",
    requiredRole: "Operator",
    destructive: true,
    confirmationPhrase: "ROTATE KEYS",
  },
  {
    id: "clear-error-cache",
    label: "Clear Error Cache",
    description: "Purge transient error cache used by workers",
    requiredRole: "Operator",
    destructive: false,
  },
];

function usePollingMetrics(pollMs = 3000) {
  const [metrics, setMetrics] = React.useState(() => mockMetrics());
  const [live, setLive] = React.useState(true);

  React.useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => {
      setMetrics(mockMetrics());
    }, pollMs);
    return () => clearInterval(iv);
  }, [live, pollMs]);

  return { metrics, live, setLive } as const;
}

export default function OperationsConsolePage() {
  // Wrap page in MockAuthProvider for local dev; in app, real provider will be used.
  return (
    <MockAuthProvider>
      <OperationsConsole />
    </MockAuthProvider>
  );
}

function OperationsConsole() {
  const { metrics, live, setLive } = usePollingMetrics();
  const { user } = useAuth();

  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState<null | { actionId: string; phrase?: string }>(null);
  const [activityLog, setActivityLog] = React.useState<string[]>([]);

  const filtered = ACTIONS.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()) || (a.description ?? "").toLowerCase().includes(query.toLowerCase()));

  const handleExecute = async (action: any) => {
    if (action.destructive && action.confirmationPhrase) {
      setModal({ actionId: action.id, phrase: action.confirmationPhrase });
      return;
    }

    // Mock execution
    setActivityLog((s) => [`[${new Date().toISOString()}] Executed ${action.label} by ${user?.name ?? "unknown"}`, ...s]);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 800));
  };

  const confirmAndExecute = async (actionId: string) => {
    const action = ACTIONS.find((a) => a.id === actionId);
    if (!action) return;
    setModal(null);
    setActivityLog((s) => [`[${new Date().toISOString()}] Confirmed ${action.label} by ${user?.name ?? "unknown"}`, ...s]);
    await new Promise((r) => setTimeout(r, 1000));
  };

  return (
    <div className="min-h-screen p-6 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Operations Console</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-600 dark:text-slate-300">{user?.name} • {user?.roles.join(", ")}</div>
            <button
              onClick={() => setLive((v) => !v)}
              className={`px-3 py-1 rounded ${live ? 'bg-green-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
              {live ? 'Live' : 'Paused'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="col-span-3 hidden md:block">
            <nav className="space-y-2">
              <div className="p-3 rounded bg-white dark:bg-slate-800">Navigation</div>
              <div className="p-3 rounded bg-white dark:bg-slate-800">Shortcuts</div>
            </nav>
          </aside>

          {/* Main */}
          <main className="col-span-12 md:col-span-6">
            <section className="grid grid-cols-2 gap-4 mb-6">
              <MetricCard title="Bridge Status" value={metrics.bridgeStatus} subtitle="Operational state" accent="bg-green-500" />
              <MetricCard title="Total Volume (USD)" value={metrics.totalVolumeUsd} subtitle="24h" />
              <MetricCard title="TX Success Rate" value={metrics.txSuccessRate} subtitle="last 24h" accent="bg-emerald-500" />
              <MetricCard title="Active Oracle Peers" value={metrics.activeOraclePeers} subtitle="connected" accent="bg-indigo-500" />
            </section>

            <section className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-medium">Admin Actions</h2>
                <div className="w-80">
                  <input
                    placeholder="Cmd+K to search actions"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map((action) => (
                  <ActionWrapper key={action.id} action={action} onExecute={handleExecute} />
                ))}
                {filtered.length === 0 && <div className="p-4 bg-white dark:bg-slate-800 rounded">No actions match</div>}
              </div>
            </section>
          </main>

          {/* Activity Feed */}
          <aside className="col-span-12 md:col-span-3">
            <div className="p-4 rounded bg-white dark:bg-slate-800">
              <h3 className="text-sm font-medium mb-2">Activity Log</h3>
              <div className="space-y-2 max-h-96 overflow-auto">
                {activityLog.length === 0 ? (
                  <div className="text-sm text-slate-500">No recent actions</div>
                ) : (
                  activityLog.map((a, i) => (
                    <div key={i} className="text-xs text-slate-600 dark:text-slate-300">{a}</div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <ConfirmationModal
        open={modal !== null}
        title={modal ? `Confirm ${modal.actionId}` : "Confirm"}
        description={modal ? `This action is destructive. Type the confirmation phrase to proceed.` : undefined}
        confirmationPhrase={modal?.phrase}
        onCancel={() => setModal(null)}
        onConfirm={() => modal && confirmAndExecute(modal.actionId)}
      />
    </div>
  );
}

function ActionWrapper({ action, onExecute }: any) {
  return (
    <ActionShortcutButton action={action} onExecute={onExecute} />
  );
}
