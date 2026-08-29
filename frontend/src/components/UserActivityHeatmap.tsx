import { useState } from "react";
import { useUserActivityHeatmap, type ActivityCell } from "../hooks/useUserActivityHeatmap";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function heatColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "bg-stellar-border/30";
  const ratio = count / max;
  if (ratio >= 0.8) return "bg-blue-500";
  if (ratio >= 0.6) return "bg-blue-400";
  if (ratio >= 0.4) return "bg-blue-300";
  if (ratio >= 0.2) return "bg-blue-200";
  return "bg-blue-100/50";
}

interface CellTooltip {
  actorId: string;
  cell: ActivityCell;
  x: number;
  y: number;
}

export default function UserActivityHeatmap() {
  const [rangeDays, setRangeDays] = useState(7);
  const [filterUser, setFilterUser] = useState("");
  const [tooltip, setTooltip] = useState<CellTooltip | null>(null);

  const { data, isLoading, error } = useUserActivityHeatmap({ days: rangeDays });

  const visibleUsers = (data?.users ?? []).filter((u) =>
    filterUser ? u.actorId.toLowerCase().includes(filterUser.toLowerCase()) : true
  );

  const maxCount = data?.maxCount ?? 1;

  return (
    <section aria-label="User activity heatmap" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">User Activity Heatmap</h2>
          <p className="text-stellar-text-secondary text-sm mt-0.5">
            Operator actions by day and hour — hover cells for details
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Filter by user…"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="bg-stellar-card border border-stellar-border text-white text-sm rounded-lg px-3 py-1.5 placeholder:text-stellar-text-secondary focus:outline-none focus:ring-1 focus:ring-stellar-blue"
          />
          <select
            className="bg-stellar-card border border-stellar-border text-white text-sm rounded-lg px-3 py-1.5"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
            aria-label="Time range"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400 text-sm" role="alert">
          Failed to load user activity data.
        </div>
      )}

      {isLoading && (
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
          <div className="h-4 w-48 bg-stellar-border rounded animate-pulse mb-6" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-2 mb-3">
              <div className="h-6 w-24 bg-stellar-border rounded animate-pulse" />
              <div className="flex-1 h-6 bg-stellar-border/30 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && (
        <div className="bg-stellar-card border border-stellar-border rounded-lg overflow-x-auto">
          {visibleUsers.length === 0 ? (
            <div className="p-10 text-center text-stellar-text-secondary">
              No activity data found for the selected range.
            </div>
          ) : (
            <div className="p-6 relative" onMouseLeave={() => setTooltip(null)}>
              {/* Hour header */}
              <div className="flex mb-2 ml-28">
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="flex-1 text-center text-stellar-text-secondary"
                    style={{ fontSize: 9, minWidth: 20 }}
                  >
                    {h % 6 === 0 ? `${h}h` : ""}
                  </div>
                ))}
              </div>

              {visibleUsers.map((user) => (
                <div key={user.actorId} className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-28 shrink-0 text-right pr-3 text-xs text-stellar-text-secondary truncate"
                    title={user.actorId}
                  >
                    {user.actorId.length > 14 ? `${user.actorId.slice(0, 12)}…` : user.actorId}
                  </div>

                  {/* 7 day groups × 24 hours each */}
                  <div className="flex gap-0.5 flex-wrap" style={{ width: "100%" }}>
                    {DAY_LABELS.map((_, dayIdx) =>
                      Array.from({ length: 24 }, (__, hour) => {
                        const cell = user.cells.find(
                          (c) => c.dayOfWeek === dayIdx && c.hour === hour
                        );
                        const count = cell?.count ?? 0;
                        return (
                          <div
                            key={`${dayIdx}-${hour}`}
                            className={`rounded-sm cursor-pointer transition-transform hover:scale-125 ${heatColor(count, maxCount)}`}
                            style={{ width: 14, height: 14, minWidth: 14 }}
                            onMouseEnter={(e) => {
                              if (cell && count > 0) {
                                setTooltip({
                                  actorId: user.actorId,
                                  cell,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }
                            }}
                            aria-label={`${user.actorId} ${DAY_LABELS[dayIdx]} ${hour}:00 — ${count} action${count !== 1 ? "s" : ""}`}
                          />
                        );
                      })
                    )}
                  </div>

                  <div className="text-xs text-stellar-text-secondary w-10 text-right shrink-0">
                    {user.totalActions}
                  </div>
                </div>
              ))}

              {/* Day labels below */}
              <div className="flex mt-3 ml-28 gap-0.5">
                {DAY_LABELS.map((day) => (
                  <div
                    key={day}
                    className="text-stellar-text-secondary text-center"
                    style={{ fontSize: 9, width: 14 * 24 + 23 * 0.5 / 7, minWidth: 20 }}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 mt-5">
                <span className="text-xs text-stellar-text-secondary">Less</span>
                {["bg-stellar-border/30", "bg-blue-100/50", "bg-blue-200", "bg-blue-300", "bg-blue-400", "bg-blue-500"].map(
                  (cls) => (
                    <div key={cls} className={`w-3 h-3 rounded-sm ${cls}`} />
                  )
                )}
                <span className="text-xs text-stellar-text-secondary">More</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-stellar-card border border-stellar-border rounded-lg p-3 text-xs shadow-xl pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}
        >
          <p className="text-white font-medium mb-1">{tooltip.actorId}</p>
          <p className="text-stellar-text-secondary">
            {DAY_LABELS[tooltip.cell.dayOfWeek]} {tooltip.cell.hour}:00–{tooltip.cell.hour + 1}:00
          </p>
          <p className="text-stellar-blue font-medium">
            {tooltip.cell.count} action{tooltip.cell.count !== 1 ? "s" : ""}
          </p>
          {tooltip.cell.actions.length > 0 && (
            <p className="text-stellar-text-secondary mt-1 truncate max-w-48">
              {tooltip.cell.actions.slice(0, 3).join(", ")}
              {tooltip.cell.actions.length > 3 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
