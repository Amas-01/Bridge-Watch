import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import IncidentReplayPlayer from "../components/IncidentReplayPlayer";
import IncidentReplay from "./IncidentReplay";
import type { IncidentReplayTimeline } from "../services/api";

const mockTimeline: IncidentReplayTimeline = {
  incidentId: "inc-1",
  incident: {
    id: "inc-1",
    bridgeId: "allbridge",
    assetCode: "USDC",
    severity: "high",
    status: "investigating",
    title: "Supply mismatch detected",
    description: "Reserve drift exceeded threshold",
    occurredAt: "2026-01-01T10:00:00.000Z",
    resolvedAt: null,
  },
  events: [
    {
      id: "e1",
      timestamp: "2026-01-01T10:00:00.000Z",
      eventType: "incident_created",
      title: "Incident detected",
      description: "Supply mismatch detected",
      severity: "high",
      metadata: { bridgeId: "allbridge" },
    },
    {
      id: "e2",
      timestamp: "2026-01-01T10:05:00.000Z",
      eventType: "ingestion",
      title: "Ingestion: webhook",
      description: "Webhook event processed",
      metadata: { sourceType: "webhook" },
    },
  ],
  durationMs: 300_000,
};

vi.mock("../hooks/useIncidentReplay", () => ({
  useIncidentReplay: () => ({
    data: mockTimeline,
    isLoading: false,
    error: null,
  }),
}));

describe("IncidentReplayPlayer", () => {
  it("renders timeline controls and event list", () => {
    render(<IncidentReplayPlayer timeline={mockTimeline} />);

    expect(screen.getByRole("button", { name: "Play replay" })).toBeInTheDocument();
    expect(screen.getByLabelText("Timeline scrubber")).toBeInTheDocument();
    expect(screen.getAllByText("Incident detected").length).toBeGreaterThan(0);
    expect(screen.getByText("Ingestion: webhook")).toBeInTheDocument();
  });

  it("shows event details when an event is selected", () => {
    render(<IncidentReplayPlayer timeline={mockTimeline} />);

    fireEvent.click(screen.getByText("Ingestion: webhook"));
    expect(screen.getByRole("heading", { name: "Event Details" })).toBeInTheDocument();
    expect(screen.getByText(/"sourceType": "webhook"/)).toBeInTheDocument();
  });
});

describe("IncidentReplay page", () => {
  it("renders replay player for incident route", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/incidents/replay/inc-1"]}>
          <Routes>
            <Route path="/incidents/replay/:id" element={<IncidentReplay />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { name: "Incident Replay" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play replay" })).toBeInTheDocument();
  });
});
