import { useState } from "react";
import { ScheduleForm, ScheduleList } from "../components/ExportScheduler";
import { useExportSchedulerStore } from "../stores/exportSchedulerStore";
import type { ScheduledExport } from "../services/api";

// ── Calendar helpers ──────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function getScheduledDaysForMonth(
  schedules: ScheduledExport[],
  year: number,
  month: number
): Map<number, ScheduledExport[]> {
  const map = new Map<number, ScheduledExport[]>();
  const daysInMonth = getDaysInMonth(year, month);

  for (const s of schedules) {
    if (!s.isActive) continue;

    if (s.frequency === "daily") {
      for (let d = 1; d <= daysInMonth; d++) {
        const list = map.get(d) ?? [];
        list.push(s);
        map.set(d, list);
      }
    } else if (s.frequency === "weekly" && s.dayOfWeek !== undefined) {
      for (let d = 1; d <= daysInMonth; d++) {
        if (new Date(year, month, d).getDay() === s.dayOfWeek) {
          const list = map.get(d) ?? [];
          list.push(s);
          map.set(d, list);
        }
      }
    } else if (s.frequency === "monthly") {
      const day = s.dayOfMonth ?? 1;
      if (day <= daysInMonth) {
        const list = map.get(day) ?? [];
        list.push(s);
        map.set(day, list);
      }
    }
  }

  return map;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Calendar component ────────────────────────────────────────────────────────

function ScheduleCalendar({ schedules }: { schedules: ScheduledExport[] }) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const scheduledDays = getScheduledDaysForMonth(schedules, calYear, calMonth);
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDow = getFirstDayOfWeek(calYear, calMonth);

  function prevMonth() {
    if (calMonth === 0) {
      setCalYear((y) => y - 1);
      setCalMonth(11);
    } else {
      setCalMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalYear((y) => y + 1);
      setCalMonth(0);
    } else {
      setCalMonth((m) => m + 1);
    }
  }

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const isToday = (d: number) =>
    d === today.getDate() &&
    calMonth === today.getMonth() &&
    calYear === today.getFullYear();

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-5">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1.5 rounded hover:bg-stellar-border transition-colors text-stellar-text-secondary hover:text-white"
          aria-label="Previous month"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-white font-semibold text-sm">
          {MONTH_NAMES[calMonth]} {calYear}
        </h3>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1.5 rounded hover:bg-stellar-border transition-colors text-stellar-text-secondary hover:text-white"
          aria-label="Next month"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((h) => (
          <div
            key={h}
            className="text-center text-xs font-medium text-stellar-text-muted py-1"
          >
            {h}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-stellar-border rounded overflow-hidden">
        {cells.map((cell, idx) => {
          const scheduled = cell.day !== null ? (scheduledDays.get(cell.day) ?? []) : [];
          return (
            <div
              key={idx}
              className={`min-h-[56px] p-1 flex flex-col bg-stellar-dark ${
                cell.day === null ? "opacity-0 pointer-events-none" : ""
              }`}
            >
              {cell.day !== null && (
                <>
                  <span
                    className={`text-xs font-medium self-end w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday(cell.day)
                        ? "bg-stellar-blue text-white"
                        : "text-stellar-text-secondary"
                    }`}
                  >
                    {cell.day}
                  </span>
                  <div className="mt-0.5 space-y-0.5 overflow-hidden">
                    {scheduled.slice(0, 2).map((s) => (
                      <div
                        key={s.id}
                        title={`${s.name} · ${s.timeOfDay}`}
                        className="text-[10px] leading-tight bg-stellar-blue/20 text-stellar-blue rounded px-1 truncate"
                      >
                        {s.name}
                      </div>
                    ))}
                    {scheduled.length > 2 && (
                      <div className="text-[10px] text-stellar-text-muted px-1">
                        +{scheduled.length - 2} more
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {schedules.filter((s) => s.isActive).length === 0 && (
        <p className="text-center text-sm text-stellar-text-muted mt-4">
          No active schedules to display.
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExportScheduler() {
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const schedules = useExportSchedulerStore((s) => s.schedules);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Export Scheduler</h1>
          <p className="mt-2 text-stellar-text-secondary">
            Schedule recurring report exports for delivery to email or in-app download.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-stellar-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-stellar-blue/90 transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          aria-expanded={showForm}
        >
          {showForm ? "Cancel" : "+ New Schedule"}
        </button>
      </header>

      {showForm && (
        <section
          className="bg-stellar-card border border-stellar-border rounded-lg p-6"
          aria-label="New schedule form"
        >
          <h2 className="text-lg font-semibold text-white mb-5">Create Schedule</h2>
          <ScheduleForm onCreated={() => setShowForm(false)} />
        </section>
      )}

      <section aria-label="Scheduled exports">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">Scheduled Exports</h2>

          {/* View toggle */}
          <div
            className="flex items-center rounded-lg border border-stellar-border overflow-hidden text-sm"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                view === "list"
                  ? "bg-stellar-blue text-white"
                  : "text-stellar-text-secondary hover:text-white"
              }`}
              aria-pressed={view === "list"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              List
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                view === "calendar"
                  ? "bg-stellar-blue text-white"
                  : "text-stellar-text-secondary hover:text-white"
              }`}
              aria-pressed={view === "calendar"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Calendar
            </button>
          </div>
        </div>

        {view === "list" ? (
          <ScheduleList />
        ) : (
          <ScheduleCalendar schedules={schedules} />
        )}
      </section>

      {/* Info panel */}
      <section className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-3">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-4 text-sm text-stellar-text-secondary">
          {[
            {
              icon: (
                <svg className="w-5 h-5 text-stellar-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ),
              title: "Set frequency",
              body: "Choose daily, weekly, or monthly runs. Specify the exact time and timezone.",
            },
            {
              icon: (
                <svg className="w-5 h-5 text-stellar-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              ),
              title: "Choose delivery",
              body: "Send to an email address or keep it available as an in-app download.",
            },
            {
              icon: (
                <svg className="w-5 h-5 text-stellar-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              ),
              title: "Manage jobs",
              body: "Pause, activate, run on demand, or delete any scheduled job at any time.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5">{item.icon}</div>
              <div>
                <p className="text-white font-medium">{item.title}</p>
                <p className="mt-0.5">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
