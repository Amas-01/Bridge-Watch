import { useState } from "react";
import { useExportSchedulerStore } from "../../stores/exportSchedulerStore";
import type { ScheduledExport } from "../../services/api";

function formatNextRun(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function frequencyLabel(s: ScheduledExport): string {
  if (s.frequency === "daily") return `Daily at ${s.timeOfDay}`;
  if (s.frequency === "weekly") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Weekly on ${days[s.dayOfWeek ?? 1]} at ${s.timeOfDay}`;
  }
  return `Monthly on day ${s.dayOfMonth ?? 1} at ${s.timeOfDay}`;
}

interface RowProps {
  schedule: ScheduledExport;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onRunNow: (id: string) => void;
}

function ScheduleRow({ schedule: s, onToggle, onDelete, onRunNow }: RowProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-stellar-border bg-stellar-dark p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-white truncate">{s.name}</p>
          <span
            className={`text-xs rounded-full px-2 py-0.5 font-medium ${
              s.isActive
                ? "bg-green-900/40 text-green-400"
                : "bg-stellar-border text-stellar-text-secondary"
            }`}
          >
            {s.isActive ? "Active" : "Paused"}
          </span>
        </div>
        <p className="text-xs text-stellar-text-secondary mt-0.5">
          {frequencyLabel(s)} · {s.format.toUpperCase()} · {s.dataType.replace("_", " ")} ·{" "}
          {s.timezone}
        </p>
        <p className="text-xs text-stellar-text-secondary mt-0.5">
          Delivery: {s.deliveryMethod === "email" ? `Email → ${s.emailAddress}` : "In-app download"}
        </p>
        <p className="text-xs text-stellar-text-muted mt-1">
          Next run: {formatNextRun(s.nextRunAt)}
          {s.lastRunAt && ` · Last ran: ${formatNextRun(s.lastRunAt)}`}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onRunNow(s.id)}
          className="rounded border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary hover:text-white transition-colors"
          title="Run now"
        >
          Run now
        </button>

        <button
          type="button"
          onClick={() => onToggle(s.id, !s.isActive)}
          className={`rounded border px-3 py-1.5 text-xs transition-colors ${
            s.isActive
              ? "border-stellar-border text-stellar-text-secondary hover:text-yellow-400"
              : "border-green-700 text-green-400 hover:text-green-300"
          }`}
          aria-label={s.isActive ? "Pause schedule" : "Activate schedule"}
        >
          {s.isActive ? "Pause" : "Activate"}
        </button>

        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => onDelete(s.id)}
              className="rounded border border-red-700 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary hover:text-white transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary hover:text-red-400 transition-colors"
            aria-label="Delete schedule"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function ScheduleList() {
  const schedules = useExportSchedulerStore((s) => s.schedules);
  const updateSchedule = useExportSchedulerStore((s) => s.updateSchedule);
  const removeSchedule = useExportSchedulerStore((s) => s.removeSchedule);
  const recordRun = useExportSchedulerStore((s) => s.recordRun);

  const [runFeedback, setRunFeedback] = useState<string | null>(null);

  function handleRunNow(id: string) {
    recordRun(id);
    const name = schedules.find((s) => s.id === id)?.name ?? "Export";
    setRunFeedback(`"${name}" queued for immediate export.`);
    setTimeout(() => setRunFeedback(null), 4000);
  }

  if (schedules.length === 0) {
    return (
      <div className="rounded-lg border border-stellar-border p-8 text-center">
        <svg
          className="w-10 h-10 mx-auto mb-3 text-stellar-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-white font-medium">No schedules yet</p>
        <p className="text-stellar-text-secondary text-sm mt-1">
          Create your first scheduled export using the form above.
        </p>
      </div>
    );
  }

  const active = schedules.filter((s) => s.isActive);
  const paused = schedules.filter((s) => !s.isActive);

  return (
    <div className="space-y-4">
      {runFeedback && (
        <div role="status" className="rounded-lg border border-green-700 bg-green-900/20 px-4 py-3 text-green-400 text-sm">
          {runFeedback}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-stellar-text-secondary">
          {schedules.length} schedule{schedules.length !== 1 ? "s" : ""} ·{" "}
          <span className="text-green-400">{active.length} active</span>
          {paused.length > 0 && ` · ${paused.length} paused`}
        </p>
      </div>

      <div className="space-y-2">
        {schedules.map((s) => (
          <ScheduleRow
            key={s.id}
            schedule={s}
            onToggle={(id, isActive) => updateSchedule(id, { isActive })}
            onDelete={removeSchedule}
            onRunNow={handleRunNow}
          />
        ))}
      </div>
    </div>
  );
}
