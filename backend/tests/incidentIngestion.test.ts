import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Knex } from "knex";
import { IncidentIngestionService } from "../src/services/incidentIngestion.service.js";
import { IncidentIngestionModel } from "../src/database/models/IncidentIngestion.js";

const createMockDb = (): Knex => {
  const data = {
    third_party_incidents: [] as any[],
    incident_ingestion_sources: [] as any[],
  };

  const mockDb: any = (table: string) => {
    return {
      insert: (record: any) => ({
        returning: () => {
          const id = Math.random().toString();
          const newRecord = {
            ...record,
            id,
            created_at: new Date(),
            updated_at: new Date(),
          };
          data[table as keyof typeof data].push(newRecord);
          return Promise.resolve([newRecord]);
        },
      }),
      where: (criteria: any) => ({
        first: () => {
          const records = data[table as keyof typeof data];
          return Promise.resolve(
            records.find((r: any) =>
              Object.keys(criteria).every((key) => r[key] === criteria[key]),
            ),
          );
        },
        update: (updates: any) => ({
          returning: () => {
            const records = data[table as keyof typeof data];
            const record = records.find((r: any) =>
              Object.keys(criteria).every((key) => r[key] === criteria[key]),
            );
            if (record) {
              Object.assign(record, updates);
            }
            return Promise.resolve([record]);
          },
        }),
        orderBy: () => ({
          desc: () => Promise.resolve(data[table as keyof typeof data]),
        }),
      }),
      whereNot: (criteria: any) => ({
        orderBy: () => ({
          desc: () =>
            Promise.resolve(
              data[table as keyof typeof data].filter(
                (r: any) =>
                  !Object.keys(criteria).every(
                    (key) => r[key] === criteria[key],
                  ),
              ),
            ),
        }),
      }),
    };
  };

  return mockDb as any;
};

describe("Incident Ingestion Service", () => {
  let service: IncidentIngestionService;
  let db: Knex;

  beforeEach(() => {
    db = createMockDb();
    service = new IncidentIngestionService(db);
  });

  it("should ingest a new incident", async () => {
    const externalIncident = {
      id: "ext-123",
      title: "Service Outage",
      description: "API is down",
      status: "investigating",
      impact: "critical",
      started_at: new Date().toISOString(),
    };

    const result = await service.ingestIncident("statuspage", externalIncident);

    expect(result).toBeDefined();
    expect(result.external_id).toBe("ext-123");
    expect(result.title).toBe("Service Outage");
    expect(result.severity).toBe("critical");
  });

  it("should normalize incident status correctly", async () => {
    const externalIncident = {
      id: "ext-456",
      title: "Issue Fixed",
      status: "resolved",
      impact: "minor",
      started_at: new Date().toISOString(),
    };

    const result = await service.ingestIncident("pagerduty", externalIncident);

    expect(result.status).toBe("resolved");
    expect(result.severity).toBe("minor");
  });

  it("should get active incidents", async () => {
    await service.ingestIncident("statuspage", {
      id: "ext-1",
      title: "Active Issue 1",
      status: "investigating",
      impact: "major",
      started_at: new Date().toISOString(),
    });

    await service.ingestIncident("statuspage", {
      id: "ext-2",
      title: "Resolved Issue",
      status: "resolved",
      impact: "minor",
      started_at: new Date().toISOString(),
    });

    const active = await service.getActiveIncidents();

    expect(active.length).toBeGreaterThan(0);
    expect(active.every((i) => i.status !== "resolved")).toBe(true);
  });
});
