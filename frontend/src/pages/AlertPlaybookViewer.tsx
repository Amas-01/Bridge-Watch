import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAlertPlaybook, useAlertPlaybooks } from "../hooks/useAlertPlaybooks";

export default function AlertPlaybookViewer() {
  const [searchParams] = useSearchParams();
  const initialAlertType = searchParams.get("alertType") ?? "";
  const [query, setQuery] = useState("");
  const [alertType, setAlertType] = useState(initialAlertType);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: searchResults, isLoading } = useAlertPlaybooks(query, alertType || undefined);
  const playbooks = searchResults?.playbooks ?? [];

  // Client-side filtering for title, alert type, and resolution steps
  const filteredPlaybooks = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    return playbooks.filter((pb) => {
      const matchesTitle = pb.title.toLowerCase().includes(lowerQuery);
      const matchesAlertType = pb.alertType.toLowerCase().includes(lowerQuery);
      const matchesSteps = pb.steps?.some((step) =>
        step.title.toLowerCase().includes(lowerQuery) ||
        step.body.toLowerCase().includes(lowerQuery)
      );
      return matchesTitle || matchesAlertType || matchesSteps;
    });
  }, [playbooks, query]);

  const activeId = selectedId ?? filteredPlaybooks[0]?.id ?? null;
  const { data: selectedPlaybook } = useAlertPlaybook(activeId ?? undefined);

  const contextLabel = useMemo(() => {
    if (alertType) return `Context: ${alertType}`;
    return "All alert types";
  }, [alertType]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-stellar-text-primary">Alert Playbooks</h1>
          <p className="mt-2 text-stellar-text-secondary">
            Runbooks and remediation steps for triggered alerts.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-stellar-border px-4 py-2 text-sm text-white"
          onClick={handlePrint}
        >
          Print playbook
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] print:block">
        <aside className="space-y-4 rounded-xl border border-stellar-border bg-stellar-card p-4 print:hidden">
          <div>
            <label htmlFor="playbook-search" className="text-sm text-stellar-text-secondary">
              Search playbooks
            </label>
            <input
              id="playbook-search"
              className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="supply mismatch, bridge downtime..."
            />
          </div>
          <div>
            <label htmlFor="alert-type-filter" className="text-sm text-stellar-text-secondary">
              Alert type
            </label>
            <input
              id="alert-type-filter"
              className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white"
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              placeholder="supply_mismatch"
            />
          </div>
          <p className="text-xs text-stellar-text-secondary">{contextLabel}</p>

          {isLoading ? (
            <p className="text-sm text-stellar-text-secondary">Loading playbooks...</p>
          ) : filteredPlaybooks.length === 0 ? (
            <p className="text-sm text-stellar-text-secondary">No playbooks match your search.</p>
          ) : (
            <ul className="space-y-2">
              {filteredPlaybooks.map((playbook) => (
                <li key={playbook.id}>
                  <button
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      playbook.id === activeId
                        ? "border-stellar-blue bg-stellar-blue/10 text-white"
                        : "border-stellar-border text-stellar-text-secondary hover:text-white"
                    }`}
                    onClick={() => setSelectedId(playbook.id)}
                  >
                    <span className="font-medium">{playbook.title}</span>
                    <span className="mt-1 block text-xs">{playbook.alertType}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-xl border border-stellar-border bg-stellar-card p-6 print:border-none print:p-0">
          {selectedPlaybook ? (
            <article>
              <header className="border-b border-stellar-border pb-4 print:border-black">
                <p className="text-sm uppercase tracking-wide text-stellar-text-secondary print:text-black">
                  {selectedPlaybook.alertType}
                  {selectedPlaybook.severity.length > 0 &&
                    ` · ${selectedPlaybook.severity.join(" / ")}`}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-white print:text-black">
                  {selectedPlaybook.title}
                </h2>
                <p className="mt-2 text-stellar-text-secondary print:text-black">
                  {selectedPlaybook.summary}
                </p>
              </header>

              <ol className="mt-6 space-y-4">
                {selectedPlaybook.steps.map((step) => (
                  <li key={step.order} className="rounded-md border border-stellar-border p-4 print:break-inside-avoid">
                    <p className="font-medium text-white print:text-black">
                      Step {step.order}: {step.title}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-stellar-text-secondary print:text-black">
                      {step.body.trim()}
                    </p>
                  </li>
                ))}
              </ol>
            </article>
          ) : (
            <p className="text-stellar-text-secondary">Select a playbook to view remediation steps.</p>
          )}
        </section>
      </div>
    </div>
  );
}
