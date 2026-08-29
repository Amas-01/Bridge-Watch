import { useRef, useState } from "react";
import type { Table } from "@tanstack/react-table";

type ColumnChooserProps<TData> = {
  readonly table: Table<TData>;
  readonly onReset?: () => void;
};

export function ColumnChooser<TData>({ table, onReset }: ColumnChooserProps<TData>) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const hiddenCount = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && !c.getIsVisible()).length;

  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide());

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-md border border-stellar-border px-3 py-2 text-sm text-stellar-text-secondary hover:text-stellar-text-primary transition-colors flex items-center gap-2"
        aria-label="Configure columns"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2m6-2v2M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2m0 0V3m0 2V5m0 10v2m0 0v2" />
        </svg>
        Columns {hiddenCount > 0 && <span className="ml-1 text-xs">{hiddenCount}</span>}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-stellar-border bg-stellar-card shadow-lg"
        >
          <div className="p-4 border-b border-stellar-border flex items-center justify-between">
            <h3 className="font-medium text-stellar-text-primary">Configure Columns</h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-stellar-text-secondary hover:text-stellar-text-primary transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto p-4 space-y-2">
            {columns.length === 0 ? (
              <p className="text-sm text-stellar-text-secondary">No columns available</p>
            ) : (
              columns.map((column) => {
                const headerLabel =
                  typeof column.columnDef.header === "string"
                    ? column.columnDef.header
                    : column.id;

                return (
                  <label
                    key={column.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-stellar-dark/50 cursor-pointer text-sm text-stellar-text-primary transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="accent-stellar-blue"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                      aria-label={`Toggle ${headerLabel}`}
                    />
                    <span>{headerLabel}</span>
                  </label>
                );
              })
            )}
          </div>

          {onReset && (
            <>
              <div className="border-t border-stellar-border" />
              <div className="p-4">
                <button
                  type="button"
                  onClick={() => {
                    onReset();
                    setIsOpen(false);
                  }}
                  className="w-full rounded-md border border-stellar-border px-3 py-2 text-sm text-stellar-text-secondary hover:text-stellar-text-primary transition-colors"
                >
                  Reset to default
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
