import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AlertPlaybookViewer from "./AlertPlaybookViewer";

vi.mock("../hooks/useAlertPlaybooks", () => ({
  useAlertPlaybooks: () => ({
    data: {
      playbooks: [
        {
          id: "supply-mismatch",
          alertType: "supply_mismatch",
          title: "Supply Mismatch",
          severity: ["critical", "high"],
          summary: "Reserve drift detected",
          steps: [
            { order: 1, title: "Verify the Alert", body: "Check supply endpoints." },
          ],
          tags: ["supply_mismatch"],
        },
      ],
      total: 1,
    },
    isLoading: false,
  }),
  useAlertPlaybook: () => ({
    data: {
      id: "supply-mismatch",
      alertType: "supply_mismatch",
      title: "Supply Mismatch",
      severity: ["critical", "high"],
      summary: "Reserve drift detected",
      steps: [{ order: 1, title: "Verify the Alert", body: "Check supply endpoints." }],
      tags: ["supply_mismatch"],
    },
    isLoading: false,
  }),
}));

describe("AlertPlaybookViewer", () => {
  it("renders search controls and playbook steps", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AlertPlaybookViewer />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Alert Playbooks" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search playbooks")).toBeInTheDocument();
    expect(screen.getByText("Step 1: Verify the Alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print playbook" })).toBeInTheDocument();
  });
});
