import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockState } = vi.hoisted(() => ({
  mockState: {
    annotations: null as any,
    audit: null as any,
  },
}));

function createBuilder(result: unknown) {
  const builder: any = {
    then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockResolvedValue(1),
    first: vi.fn().mockResolvedValue(null),
    returning: vi.fn().mockResolvedValue([result]),
  };

  return builder;
}

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => (table: string) => {
    if (table === "service_annotation_audit") return mockState.audit;
    return mockState.annotations;
  },
}));

import { logger } from "../../src/utils/logger.js";
import { ServiceAnnotationService } from "../../src/services/serviceAnnotation.service.js";

describe("ServiceAnnotationService", () => {
  let service: ServiceAnnotationService;

  beforeEach(() => {
    (ServiceAnnotationService as any).instance = undefined;
    service = ServiceAnnotationService.getInstance();
    mockState.annotations = createBuilder(null);
    mockState.audit = createBuilder([]);
    vi.clearAllMocks();
  });

  it("creates an annotation and logs the audit trail", async () => {
    const createdRow = {
      id: "ann-1",
      service_name: "price-service",
      entity_type: "source",
      entity_id: null,
      content: "Test annotation",
      author: "ops",
      start_time: null,
      end_time: null,
      active: true,
      created_at: new Date("2024-01-01T00:00:00.000Z"),
      updated_at: new Date("2024-01-01T00:00:00.000Z"),
    };
    mockState.annotations.returning.mockResolvedValue([createdRow]);

    const annotation = await service.create({
      serviceName: "price-service",
      entityType: "source",
      content: "Test annotation",
      author: "ops",
    });

    expect(annotation.serviceName).toBe("price-service");
    expect(annotation.content).toBe("Test annotation");
    expect(annotation.active).toBe(true);
    expect(logger.info).toHaveBeenCalled();
    expect(mockState.audit.insert).toHaveBeenCalled();
  });

  it("retreives an annotation by id when it exists", async () => {
    const existingRow = {
      id: "ann-2",
      service_name: "monitoring",
      entity_type: "service",
      entity_id: "monitor-1",
      content: "Planned maintenance",
      author: "ops",
      start_time: null,
      end_time: null,
      active: false,
      created_at: new Date("2024-01-02T00:00:00.000Z"),
      updated_at: new Date("2024-01-02T00:00:00.000Z"),
    };
    mockState.annotations.first.mockResolvedValue(existingRow);

    const result = await service.get("ann-2");

    expect(result).toMatchObject({
      id: "ann-2",
      serviceName: "monitoring",
      content: "Planned maintenance",
      entityId: "monitor-1",
      active: false,
    });
  });

  it("returns null when annotation is not found", async () => {
    const result = await service.get("nonexistent");
    expect(result).toBeNull();
  });

  it("updates an existing annotation and records the change", async () => {
    const existingRow = {
      id: "ann-3",
      service_name: "bridge-api",
      entity_type: "service",
      entity_id: null,
      content: "Old note",
      author: "ops",
      start_time: null,
      end_time: null,
      active: true,
      created_at: new Date("2024-01-03T00:00:00.000Z"),
      updated_at: new Date("2024-01-03T00:00:00.000Z"),
    };
    const updatedRow = { ...existingRow, content: "Updated note", active: false };
    mockState.annotations.first.mockResolvedValue(existingRow);
    mockState.annotations.returning.mockResolvedValue([updatedRow]);

    const result = await service.update("ann-3", "reviewer", { content: "Updated note", active: false });

    expect(result).toMatchObject({ content: "Updated note", active: false });
    expect(mockState.audit.insert).toHaveBeenCalled();
  });

  it("deletes an annotation and returns true when it exists", async () => {
    mockState.annotations.delete.mockResolvedValue(1);

    const deleted = await service.delete("ann-4", "ops");

    expect(deleted).toBe(true);
    expect(mockState.audit.insert).toHaveBeenCalled();
  });

  it("returns false when deletion target is missing", async () => {
    mockState.annotations.delete.mockResolvedValue(0);

    const deleted = await service.delete("missing", "ops");

    expect(deleted).toBe(false);
    expect(mockState.audit.insert).not.toHaveBeenCalled();
  });

  it("lists annotations with the requested filters", async () => {
    const rows = [
      {
        id: "ann-5",
        service_name: "price-service",
        entity_type: "source",
        entity_id: null,
        content: "Test",
        author: "ops",
        start_time: null,
        end_time: null,
        active: true,
        created_at: new Date("2024-01-04T00:00:00.000Z"),
        updated_at: new Date("2024-01-04T00:00:00.000Z"),
      },
    ];
    mockState.annotations.then = (resolve: (value: unknown) => void) => Promise.resolve(rows).then(resolve);

    const results = await service.list({ serviceName: "price-service", active: true });

    expect(results).toHaveLength(1);
    expect(results[0].serviceName).toBe("price-service");
    expect(mockState.annotations.orderBy).toHaveBeenCalled();
  });

  it("returns the audit log for an annotation", async () => {
    const auditRows = [
      {
        id: "audit-1",
        annotation_id: "ann-6",
        action: "created",
        actor: "ops",
        changes: JSON.stringify({ content: "Initial note" }),
        created_at: new Date("2024-01-05T00:00:00.000Z"),
      },
    ];
    mockState.audit.orderBy.mockResolvedValue(auditRows);

    const audit = await service.getAuditLog("ann-6");

    expect(audit).toEqual(auditRows);
  });
});
