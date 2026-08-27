import { describe, it, expect, beforeEach, vi } from "vitest";
import { IncidentOwnershipTransferService } from "../../src/services/incidentOwnershipTransfer.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const state = vi.hoisted(() => ({
  incidents: [] as any[],
  transfers: [] as any[],
}));

vi.mock("../../src/database/connection.js", () => {
  const mockDb: any = vi.fn().mockImplementation((table: string) => {
    if (table === "incidents") {
      const builder: any = {
        where: vi.fn().mockImplementation((clause: any) => {
          builder.__id = clause.id;
          return builder;
        }),
        first: vi.fn().mockImplementation(() =>
          Promise.resolve(state.incidents.find((i) => i.id === builder.__id))
        ),
        update: vi.fn().mockImplementation((data: any) => {
          const incident = state.incidents.find((i) => i.id === builder.__id);
          if (incident) Object.assign(incident, data);
          return Promise.resolve(1);
        }),
      };
      return builder;
    }

    if (table === "incident_ownership_transfers") {
      const builder: any = {
        insert: vi.fn().mockImplementation((data: any) => {
          state.transfers.push(data);
          return Promise.resolve([data]);
        }),
        where: vi.fn().mockImplementation((clause: any) => {
          builder.__incidentId = clause.incident_id;
          return builder;
        }),
        orderBy: vi.fn().mockImplementation(() => builder),
        limit: vi.fn().mockImplementation(() => builder),
        then: (resolve: any) =>
          Promise.resolve(
            state.transfers.filter((t) =>
              builder.__incidentId ? t.incident_id === builder.__incidentId : true
            )
          ).then(resolve),
      };
      return builder;
    }

    throw new Error(`Unexpected table access in mock: ${table}`);
  });

  return { getDatabase: () => mockDb };
});

describe("IncidentOwnershipTransferService", () => {
  let service: IncidentOwnershipTransferService;

  beforeEach(() => {
    vi.clearAllMocks();
    state.incidents = [
      { id: "incident-1", title: "Bridge stalled", assigned_to: "op_alice", updated_at: new Date() },
    ];
    state.transfers = [];
    service = new IncidentOwnershipTransferService();
  });

  it("transfers ownership and records an audit entry", async () => {
    const result = await service.transferOwnership({
      incidentId: "incident-1",
      toOperator: "op_bob",
      initiatedBy: "op_alice",
      reason: "Going off shift",
    });

    expect(result.transfer.from_operator).toBe("op_alice");
    expect(result.transfer.to_operator).toBe("op_bob");
    expect(result.incident.assigned_to).toBe("op_bob");
  });

  it("throws when the incident does not exist", async () => {
    await expect(
      service.transferOwnership({
        incidentId: "missing-incident",
        toOperator: "op_bob",
        initiatedBy: "op_alice",
      })
    ).rejects.toThrow("Incident not found");
  });

  it("throws when transferring to the current owner", async () => {
    await expect(
      service.transferOwnership({
        incidentId: "incident-1",
        toOperator: "op_alice",
        initiatedBy: "op_alice",
      })
    ).rejects.toThrow("already owned by the target operator");
  });

  it("records transfer history for an incident", async () => {
    await service.transferOwnership({
      incidentId: "incident-1",
      toOperator: "op_bob",
      initiatedBy: "op_alice",
    });

    const history = await service.getTransferHistory("incident-1");
    expect(history).toHaveLength(1);
    expect(history[0].to_operator).toBe("op_bob");
  });
});
