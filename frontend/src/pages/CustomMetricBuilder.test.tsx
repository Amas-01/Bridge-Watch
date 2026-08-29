import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CustomMetricBuilder from "./CustomMetricBuilder";

vi.mock("../hooks/useSavedMetrics", () => ({
  useSavedMetrics: () => ({
    data: [
      {
        id: "m1",
        name: "Bridge uptime",
        description: "Weekly verification counts",
        formula: "SELECT 1",
        isShared: true,
        createdBy: "user-1",
        cacheTtl: 600,
        metadata: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    isLoading: false,
  }),
  useValidateMetricFormula: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    data: null,
  }),
  useCreateSavedMetric: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteSavedMetric: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

describe("CustomMetricBuilder", () => {
  it("renders formula editor and saved metrics list", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <CustomMetricBuilder />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Custom Metric Builder" })).toBeInTheDocument();
    expect(screen.getByLabelText("Formula (SQL SELECT)")).toBeInTheDocument();
    expect(screen.getByText("Bridge uptime")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validate & preview" })).toBeInTheDocument();
  });
});
