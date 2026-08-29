import { describe, it, expect, beforeEach, vi } from "vitest";
import { OperatorHandoffService } from "../operatorHandoff.service.js";

vi.mock("../../database/connection.js", () => {
  const mockRecords: any[] = [];
  const mockDb: any = vi.fn().mockImplementation(() => {
    const builder: any = {
      insert: vi.fn().mockImplementation((data) => {
        const record = { id: "handoff-uuid-1", ...data, created_at: new Date(), updated_at: new Date() };
        mockRecords.push(record);
        return Promise.resolve([record]);
      }),
      select: vi.fn().mockImplementation(() => builder),
      where: vi.fn().mockImplementation(() => builder),
      orWhere: vi.fn().mockImplementation(() => builder),
      orderBy: vi.fn().mockImplementation(() => builder),
      limit: vi.fn().mockImplementation(() => Promise.resolve(mockRecords)),
      first: vi.fn().mockImplementation(() => Promise.resolve(mockRecords[0] ?? null)),
      update: vi.fn().mockImplementation((data) => {
        if (mockRecords[0]) Object.assign(mockRecords[0], data);
        return Promise.resolve(1);
      }),
    };
    return builder;
  });

  return { getDatabase: () => mockDb };
});

describe("OperatorHandoffService", () => {
  let service: OperatorHandoffService;

  beforeEach(() => {
    service = new OperatorHandoffService();
    vi.clearAllMocks();
  });

  it("creates a new operator handoff checklist draft", async () => {
    const handoff = await service.createHandoff({
      shiftName: "Day Shift Alpha",
      outgoingOperator: "op_alice",
      incomingOperator: "op_bob",
    });

    expect(handoff.id).toBe("handoff-uuid-1");
    expect(handoff.status).toBe("draft");
    expect(handoff.outgoing_operator).toBe("op_alice");
    expect(handoff.incoming_operator).toBe("op_bob");
    expect(Array.isArray(handoff.checklist_items)).toBe(true);
  });

  it("fails submission when checklist items are incomplete", async () => {
    await service.createHandoff({
      shiftName: "Day Shift Alpha",
      outgoingOperator: "op_alice",
      incomingOperator: "op_bob",
    });

    await expect(
      service.submitHandoff("handoff-uuid-1", "op_alice", "sig_alice_123")
    ).rejects.toThrow("checklist items are incomplete");
  });

  it("submits handoff when all checklist items are completed", async () => {
    const handoff = await service.createHandoff({
      shiftName: "Day Shift Alpha",
      outgoingOperator: "op_alice",
      incomingOperator: "op_bob",
    });

    const items = (handoff.checklist_items as any[]).map((item) => ({ ...item, completed: true }));

    await service.updateHandoff("handoff-uuid-1", "op_alice", {
      checklistItems: items,
    });

    const submitted = await service.submitHandoff("handoff-uuid-1", "op_alice", "sig_alice_123");
    expect(submitted.status).toBe("submitted");
    expect(submitted.signoff_outgoing_signature).toBe("sig_alice_123");
  });

  it("acknowledges submitted handoff by incoming operator", async () => {
    const handoff = await service.createHandoff({
      shiftName: "Day Shift Alpha",
      outgoingOperator: "op_alice",
      incomingOperator: "op_bob",
    });

    const items = (handoff.checklist_items as any[]).map((item) => ({ ...item, completed: true }));
    await service.updateHandoff("handoff-uuid-1", "op_alice", { checklistItems: items });
    await service.submitHandoff("handoff-uuid-1", "op_alice", "sig_alice_123");

    const ack = await service.acknowledgeHandoff("handoff-uuid-1", "op_bob", "sig_bob_456");
    expect(ack.status).toBe("acknowledged");
    expect(ack.signoff_incoming_signature).toBe("sig_bob_456");
  });
});
