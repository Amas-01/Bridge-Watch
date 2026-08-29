# DataTable

## Usage

```tsx
import type { DataTableColumnDef } from "./components/DataTable";
import { DataTable } from "./components/DataTable";

type Row = { id: string; name: string; price: number; updatedAt: string };

const columns: Array<DataTableColumnDef<Row>> = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    filterType: "text",
  },
  {
    id: "price",
    accessorKey: "price",
    header: "Price",
    filterType: "numberRange",
    cell: (ctx) => `$${Number(ctx.getValue()).toFixed(2)}`,
  },
  {
    id: "updatedAt",
    accessorKey: "updatedAt",
    header: "Updated",
    filterType: "dateRange",
  },
];

export function Example({ data, isLoading }: { data: Row[]; isLoading: boolean }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      isLoading={isLoading}
      title="Assets"
      description="Sortable, filterable, selectable assets"
      pageSizeOptions={[10, 20, 50]}
      filenameBase="assets"
      storageKey="assets-table"
      rowActions={{
        items: [
          {
            id: "view",
            label: "View",
            onSelect: (row) => console.log("view", row.id),
          },
        ],
      }}
    />
  );
}
```

## Advanced Sorting

- Click a header to toggle ascending, descending, and cleared states.
- Hold `Shift` while clicking to add another column to the sort order.
- Pass a stable `storageKey` when you want the current sort preference to survive reloads.
- Use the toolbar `Clear sort` action to reset a complex sort back to the table's natural row order.

The active sort order stays visible in the toolbar, which gives mobile users a simple fallback when the headers are harder to scan.
