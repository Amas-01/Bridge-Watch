import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ScheduledExport, CreateScheduledExportRequest } from "../services/api";

function generateId() {
  return `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function computeNextRun(
  frequency: "daily" | "weekly" | "monthly",
  timeOfDay: string,
  timezone: string,
  dayOfWeek?: number,
  dayOfMonth?: number
): string {
  try {
    const [hours, minutes] = timeOfDay.split(":").map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);

    if (frequency === "daily") {
      if (next <= now) next.setDate(next.getDate() + 1);
    } else if (frequency === "weekly") {
      const targetDay = dayOfWeek ?? 1;
      const diff = (targetDay - now.getDay() + 7) % 7 || 7;
      next.setDate(now.getDate() + diff);
    } else {
      const targetDay = dayOfMonth ?? 1;
      next.setDate(targetDay);
      if (next <= now) next.setMonth(next.getMonth() + 1, targetDay);
    }

    void timezone;
    return next.toISOString();
  } catch {
    return new Date(Date.now() + 86400000).toISOString();
  }
}

interface ExportSchedulerState {
  schedules: ScheduledExport[];
  addSchedule: (req: CreateScheduledExportRequest) => ScheduledExport;
  updateSchedule: (
    id: string,
    updates: Partial<CreateScheduledExportRequest> & { isActive?: boolean }
  ) => void;
  removeSchedule: (id: string) => void;
  recordRun: (id: string) => void;
}

export const useExportSchedulerStore = create<ExportSchedulerState>()(
  persist(
    (set) => ({
      schedules: [],

      addSchedule(req) {
        const now = new Date().toISOString();
        const schedule: ScheduledExport = {
          ...req,
          id: generateId(),
          isActive: true,
          lastRunAt: null,
          nextRunAt: computeNextRun(
            req.frequency,
            req.timeOfDay,
            req.timezone,
            req.dayOfWeek,
            req.dayOfMonth
          ),
          createdAt: now,
        };
        set((s) => ({ schedules: [schedule, ...s.schedules] }));
        return schedule;
      },

      updateSchedule(id, updates) {
        set((s) => ({
          schedules: s.schedules.map((sched) => {
            if (sched.id !== id) return sched;
            const merged = { ...sched, ...updates };
            return {
              ...merged,
              nextRunAt: computeNextRun(
                merged.frequency,
                merged.timeOfDay,
                merged.timezone,
                merged.dayOfWeek,
                merged.dayOfMonth
              ),
            };
          }),
        }));
      },

      removeSchedule(id) {
        set((s) => ({
          schedules: s.schedules.filter((sched) => sched.id !== id),
        }));
      },

      recordRun(id) {
        const now = new Date().toISOString();
        set((s) => ({
          schedules: s.schedules.map((sched) => {
            if (sched.id !== id) return sched;
            return {
              ...sched,
              lastRunAt: now,
              nextRunAt: computeNextRun(
                sched.frequency,
                sched.timeOfDay,
                sched.timezone,
                sched.dayOfWeek,
                sched.dayOfMonth
              ),
            };
          }),
        }));
      },
    }),
    {
      name: "bridge-watch:export-schedules",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export function selectSchedules(s: ExportSchedulerState) {
  return s.schedules;
}
