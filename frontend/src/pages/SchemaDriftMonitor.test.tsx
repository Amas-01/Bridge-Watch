import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SchemaDriftMonitor from "./SchemaDriftMonitor";

const mockIncidents = [
  {
    id: "1",
    source_name: "stellar-horizon",
    drift_type: "REMOVAL" as const,
    field_path: "ledger.base_fee",
    expected_type: "number",
    actual_type: null,
    is_breaking: true,
    detected_at: new Date(Date.now() - 5000).toISOString(),
    is_resolved: false,
  },
  {
    id: "2",
    source_name: "circle-usdc",
    drift_type: "ADDITION" as const,
    field_path: "metadata.extra",
    expected_type: null,
    actual_type: "string",
    is_breaking: false,
    detected_at: new Date(Date.now() - 120000).toISOString(),
    is_resolved: false,
  },
  {
    id: "3",
    source_name: "stellar-horizon",
    drift_type: "TYPE_CHANGE" as const,
    field_path: "ledger.sequence",
    expected_type: "number",
    actual_type: "string",
    is_breaking: true,
    detected_at: new Date(Date.now() - 60000).toISOString(),
    is_resolved: false,
  },
];

vi.mock("../hooks/useSchemaDrift", () => ({
  useSchemaDrift: () => ({
    summary: [
      { source_name: "stellar-horizon", incident_count: 2, last_detected: new Date().toISOString() },
      { source_name: "circle-usdc", incident_count: 1, last_detected: new Date().toISOString() },
    ],
    recentIncidents: mockIncidents,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe("SchemaDriftMonitor", () => {
  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SchemaDriftMonitor />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("renders the page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Schema Drift Monitor" })).toBeInTheDocument();
  });

  it("shows summary stat cards", () => {
    renderPage();
    expect(screen.getByText("Total Incidents")).toBeInTheDocument();
    expect(screen.getAllByText("Breaking").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Non-breaking").length).toBeGreaterThanOrEqual(1);
  });

  it("shows source summary table", () => {
    renderPage();
    expect(screen.getByText("Source Summary")).toBeInTheDocument();
    expect(screen.getAllByText("stellar-horizon").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("circle-usdc").length).toBeGreaterThanOrEqual(1);
  });

  it("renders a row per drift incident", () => {
    renderPage();
    expect(screen.getByText("ledger.base_fee")).toBeInTheDocument();
    expect(screen.getByText("metadata.extra")).toBeInTheDocument();
    expect(screen.getByText("ledger.sequence")).toBeInTheDocument();
  });

  it("shows breaking and non-breaking severity badges", () => {
    renderPage();
    expect(screen.getAllByText("Breaking").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Non-breaking").length).toBeGreaterThanOrEqual(1);
  });

  it("shows drift type badges", () => {
    renderPage();
    expect(screen.getByText("REMOVAL")).toBeInTheDocument();
    expect(screen.getByText("ADDITION")).toBeInTheDocument();
    expect(screen.getByText("TYPE_CHANGE")).toBeInTheDocument();
  });

  it("filters incidents by source", async () => {
    renderPage();
    const select = screen.getByRole("combobox", { name: /filter by source/i });
    fireEvent.change(select, { target: { value: "circle-usdc" } });
    expect(screen.getByText("metadata.extra")).toBeInTheDocument();
    expect(screen.queryByText("ledger.base_fee")).not.toBeInTheDocument();
  });

  it("filters incidents by drift type", async () => {
    renderPage();
    const select = screen.getByRole("combobox", { name: /filter by drift type/i });
    fireEvent.change(select, { target: { value: "ADDITION" } });
    expect(screen.getByText("metadata.extra")).toBeInTheDocument();
    expect(screen.queryByText("ledger.base_fee")).not.toBeInTheDocument();
  });
});
