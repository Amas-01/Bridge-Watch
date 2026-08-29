import { useState, type FormEvent } from "react";
import { useExportSchedulerStore } from "../../stores/exportSchedulerStore";
import type { CreateScheduledExportRequest } from "../../services/api";

const FREQUENCIES = [
  { id: "daily" as const, label: "Daily" },
  { id: "weekly" as const, label: "Weekly" },
  { id: "monthly" as const, label: "Monthly" },
];

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const DATA_TYPES = [
  { id: "analytics" as const, label: "Analytics" },
  { id: "transactions" as const, label: "Transactions" },
  { id: "health_metrics" as const, label: "Health Metrics" },
];

const FORMATS = [
  { id: "csv" as const, label: "CSV" },
  { id: "json" as const, label: "JSON" },
];

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney"];
  }
})();

interface Props {
  onCreated?: () => void;
}

const DEFAULT_FORM: CreateScheduledExportRequest = {
  name: "",
  format: "csv",
  dataType: "analytics",
  frequency: "daily",
  dayOfWeek: 1,
  dayOfMonth: 1,
  timeOfDay: "08:00",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  deliveryMethod: "download",
  emailAddress: "",
  filters: {
    startDate: "",
    endDate: "",
    assetCodes: [],
    bridgeIds: [],
  },
};

export default function ScheduleForm({ onCreated }: Props) {
  const addSchedule = useExportSchedulerStore((s) => s.addSchedule);
  const [form, setForm] = useState<CreateScheduledExportRequest>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required.";
    if (form.deliveryMethod === "email" && !form.emailAddress?.trim()) {
      errs.emailAddress = "Email address is required for email delivery.";
    }
    if (
      form.deliveryMethod === "email" &&
      form.emailAddress &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.emailAddress)
    ) {
      errs.emailAddress = "Enter a valid email address.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    addSchedule(form);
    setForm(DEFAULT_FORM);
    setErrors({});
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    onCreated?.();
  }

  function set<K extends keyof CreateScheduledExportRequest>(
    key: K,
    value: CreateScheduledExportRequest[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-label="Create export schedule">
      {submitted && (
        <div role="status" className="rounded-lg border border-green-700 bg-green-900/20 px-4 py-3 text-green-400 text-sm">
          Schedule created successfully.
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="sched-name" className="block text-sm font-medium text-stellar-text-secondary mb-1">
          Schedule Name
        </label>
        <input
          id="sched-name"
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Weekly analytics export"
          className="w-full rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white placeholder:text-stellar-text-muted focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "sched-name-err" : undefined}
        />
        {errors.name && (
          <p id="sched-name-err" className="mt-1 text-xs text-red-400" role="alert">{errors.name}</p>
        )}
      </div>

      {/* Format + Data type row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="sched-format" className="block text-sm font-medium text-stellar-text-secondary mb-1">
            Format
          </label>
          <select
            id="sched-format"
            value={form.format}
            onChange={(e) => set("format", e.target.value as "csv" | "json")}
            className="w-full rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          >
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sched-data-type" className="block text-sm font-medium text-stellar-text-secondary mb-1">
            Data Type
          </label>
          <select
            id="sched-data-type"
            value={form.dataType}
            onChange={(e) => set("dataType", e.target.value as typeof form.dataType)}
            className="w-full rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          >
            {DATA_TYPES.map((dt) => (
              <option key={dt.id} value={dt.id}>{dt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Frequency */}
      <div>
        <p className="text-sm font-medium text-stellar-text-secondary mb-2">Frequency</p>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Frequency">
          {FREQUENCIES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => set("frequency", f.id)}
              aria-pressed={form.frequency === f.id}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                form.frequency === f.id
                  ? "bg-stellar-blue text-white"
                  : "border border-stellar-border text-stellar-text-secondary hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conditional day selectors */}
      {form.frequency === "weekly" && (
        <div>
          <label htmlFor="sched-dow" className="block text-sm font-medium text-stellar-text-secondary mb-1">
            Day of Week
          </label>
          <select
            id="sched-dow"
            value={form.dayOfWeek}
            onChange={(e) => set("dayOfWeek", Number(e.target.value))}
            className="w-full max-w-xs rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          >
            {DAYS_OF_WEEK.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      )}

      {form.frequency === "monthly" && (
        <div>
          <label htmlFor="sched-dom" className="block text-sm font-medium text-stellar-text-secondary mb-1">
            Day of Month
          </label>
          <input
            id="sched-dom"
            type="number"
            min={1}
            max={28}
            value={form.dayOfMonth}
            onChange={(e) => set("dayOfMonth", Math.min(28, Math.max(1, Number(e.target.value))))}
            className="w-24 rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          />
          <p className="mt-1 text-xs text-stellar-text-muted">1–28 (safe for all months)</p>
        </div>
      )}

      {/* Time + Timezone row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="sched-time" className="block text-sm font-medium text-stellar-text-secondary mb-1">
            Time of Day
          </label>
          <input
            id="sched-time"
            type="time"
            value={form.timeOfDay}
            onChange={(e) => set("timeOfDay", e.target.value)}
            className="w-full rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          />
        </div>

        <div>
          <label htmlFor="sched-tz" className="block text-sm font-medium text-stellar-text-secondary mb-1">
            Timezone
          </label>
          <select
            id="sched-tz"
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            className="w-full rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          >
            {TIMEZONES.slice(0, 100).map((tz: string) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Delivery method */}
      <div>
        <p className="text-sm font-medium text-stellar-text-secondary mb-2">Delivery</p>
        <div className="flex gap-2">
          {(["download", "email"] as const).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => set("deliveryMethod", method)}
              aria-pressed={form.deliveryMethod === method}
              className={`rounded px-4 py-2 text-sm font-medium capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                form.deliveryMethod === method
                  ? "bg-stellar-blue text-white"
                  : "border border-stellar-border text-stellar-text-secondary hover:text-white"
              }`}
            >
              {method === "download" ? "In-app Download" : "Email"}
            </button>
          ))}
        </div>
      </div>

      {form.deliveryMethod === "email" && (
        <div>
          <label htmlFor="sched-email" className="block text-sm font-medium text-stellar-text-secondary mb-1">
            Email Address
          </label>
          <input
            id="sched-email"
            type="email"
            value={form.emailAddress ?? ""}
            onChange={(e) => set("emailAddress", e.target.value)}
            placeholder="analyst@example.com"
            className="w-full max-w-md rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white placeholder:text-stellar-text-muted focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            aria-required="true"
            aria-invalid={!!errors.emailAddress}
            aria-describedby={errors.emailAddress ? "sched-email-err" : undefined}
          />
          {errors.emailAddress && (
            <p id="sched-email-err" className="mt-1 text-xs text-red-400" role="alert">
              {errors.emailAddress}
            </p>
          )}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          className="rounded-lg bg-stellar-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-stellar-blue/90 transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          Create Schedule
        </button>
      </div>
    </form>
  );
}
