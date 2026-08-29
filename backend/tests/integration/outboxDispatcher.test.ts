import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Knex } from "knex";
import knex from "knex";
import { OutboxDispatcher, DEFAULT_DISPATCHER_CONFIG } from "../../src/outbox/eventDispatcher.js";
import { OutboxProducer } from "../../src/outbox/eventProducer.js";

// Mock Redis for BullMQ
vi.mock("ioredis", () => {
  return {
    default: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    })),
  };
});

vi.mock("bullmq", () => {
  const mockJobs: any[] = [];
  
  return {
    Queue: vi.fn(() => ({
      add: vi.fn((name, data, opts) => {
        mockJobs.push({ name, data, opts });
        return Promise.resolve({ id: `job-${Date.now()}` });
      }),
      addBulk: vi.fn((jobs) => {
        mockJobs.push(...jobs);
        return Promise.resolve(jobs.map((_, i) => ({ id: `job-${Date.now()}-${i}` })));
      }),
      close: vi.fn(),
      getWaiting: vi.fn(() => Promise.resolve([])),
      getActive: vi.fn(() => Promise.resolve([])),
    })),
    Worker: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
    })),
    Job: vi.fn(),
  };
});

describe("OutboxDispatcher Integration Tests", () => {
  let db: Knex;
  let producer: OutboxProducer;
  let dispatcher: OutboxDispatcher;

  beforeAll(async () => {
    db = knex({
      client: "sqlite3",
      connection: ":memory:",
      useNullAsDefault: true,
    });
    await createTestSchema(db);
    producer = new OutboxProducer(db);
    dispatcher = new OutboxDispatcher(db, {
      ...DEFAULT_DISPATCHER_CONFIG,
      pollIntervalMs: 100, // Faster polling for test
      queueName: "test-dispatcher-queue",
    });
  });

  afterAll(async () => {
    await dispatcher.stop();
    await db.destroy();
  });

  beforeEach(async () => {
    await db("dead_letter_events").del();
    await db("outbox_events").del();
    await db("outbox_events_sequence").del();
  });

  it("should process pending events successfully", async () => {
    await producer.publish({
      aggregateType: "Test",
      aggregateId: "test-pending",
      eventType: "test.event" as any,
      payload: { data: "test" },
    });

    const pendingBefore = await producer.getPendingEvents(10);
    expect(pendingBefore.length).toBe(1);

    // Call internal polling method to simulate tick
    await (dispatcher as any).pollAndDispatch();

    // Since BullMQ is mocked, we need to simulate the worker processing the job
    const mockJobs = (require("bullmq").Queue as any).mock.results[0].value.addBulk.mock.calls[0][0];
    for (const job of mockJobs) {
      await (dispatcher as any).processDispatchJob({ data: job.data });
    }

    const pendingAfter = await producer.getPendingEvents(10);
    expect(pendingAfter.length).toBe(0);

    const [event] = await db("outbox_events").select("*").where({ aggregate_id: "test-pending" });
    expect(event.status).toBe("delivered");
  });

  it("should handle retry counting for failed events", async () => {
    await producer.publish({
      aggregateType: "Test",
      aggregateId: "test-retry",
      eventType: "test.event" as any,
      payload: { data: "test" },
    });

    // Mock dispatchEvent to throw error
    vi.spyOn(dispatcher as any, "dispatchEvent").mockImplementationOnce(() => {
      throw new Error("Simulated failure");
    });

    await (dispatcher as any).pollAndDispatch();
    
    // Get the job added to the mocked queue
    const mockQueue = (require("bullmq").Queue as any).mock.results[0].value;
    const mockJobs = mockQueue.addBulk.mock.calls[mockQueue.addBulk.mock.calls.length - 1][0];
    
    for (const job of mockJobs) {
      await (dispatcher as any).processDispatchJob({ data: job.data });
    }

    const [event] = await db("outbox_events").select("*").where({ aggregate_id: "test-retry" });
    expect(event.status).toBe("pending");
    expect(event.retry_count).toBe(1);
    
    vi.restoreAllMocks();
  });

  it("should route to dead-letter queue after max retries", async () => {
    await producer.publish({
      aggregateType: "Test",
      aggregateId: "test-dlq",
      eventType: "test.event" as any,
      payload: { data: "test" },
    });
    
    const [inserted] = await db("outbox_events").select("*").where({ aggregate_id: "test-dlq" });
    
    // Simulate multiple failures up to max retries
    const maxRetries = DEFAULT_DISPATCHER_CONFIG.maxRetries;
    
    for(let i = 0; i <= maxRetries; i++) {
      vi.spyOn(dispatcher as any, "dispatchEvent").mockImplementationOnce(() => {
        throw new Error("Simulated failure");
      });
      // process job directly
      await (dispatcher as any).processDispatchJob({ data: { eventId: inserted.id } });
    }

    const [event] = await db("outbox_events").select("*").where({ aggregate_id: "test-dlq" });
    expect(event.status).toBe("failed");
    
    const [dlqEvent] = await db("dead_letter_events").select("*").where({ outbox_id: inserted.id });
    expect(dlqEvent).toBeDefined();
    expect(dlqEvent.error_count).toBeGreaterThan(0);
    
    vi.restoreAllMocks();
  });
  
  // Helper to create test schema
  async function createTestSchema(db: Knex): Promise<void> {
    await db.schema.createTable("outbox_events_sequence", (table) => {
      table.string("aggregate_type").notNullable();
      table.string("aggregate_id").notNullable();
      table.bigInteger("seq").notNullable().defaultTo(0);
      table.primary(["aggregate_type", "aggregate_id"]);
    });

    await db.schema.createTable("outbox_events", (table) => {
      table.increments("id").primary();
      table.string("aggregate_type").notNullable();
      table.string("aggregate_id").notNullable();
      table.bigInteger("sequence_no").notNullable();
      table.string("event_type").notNullable();
      table.text("payload").notNullable();
      table.text("metadata").notNullable().defaultTo("{}");
      table.string("status").notNullable().defaultTo("pending");
      table.integer("retry_count").notNullable().defaultTo(0);
      table.timestamp("retry_after").notNullable().defaultTo(db.fn.now());
      table.timestamp("delivered_at").nullable();
      table.text("error_message").nullable();
      table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
      table.unique(["aggregate_type", "aggregate_id", "sequence_no"]);
    });

    await db.schema.createTable("dead_letter_events", (table) => {
      table.string("id").primary();
      table.integer("outbox_id").notNullable();
      table.string("event_type").notNullable();
      table.string("aggregate_id").notNullable();
      table.text("payload").notNullable();
      table.integer("error_count").notNullable().defaultTo(1);
      table.text("last_error").notNullable();
      table.timestamp("last_attempt").notNullable().defaultTo(db.fn.now());
      table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    });

    vi.spyOn(db, "raw").mockImplementation((async (sql: string, bindings?: any[]) => {
      if (sql.includes("get_next_outbox_sequence")) {
        const [aggregateType, aggregateId] = bindings || [];
        const existing = await db("outbox_events_sequence")
          .where({ aggregate_type: aggregateType, aggregate_id: aggregateId })
          .first();
  
        let newSeq = 1;
        if (existing) {
          newSeq = existing.seq + 1;
          await db("outbox_events_sequence")
            .where({ aggregate_type: aggregateType, aggregate_id: aggregateId })
            .update({ seq: newSeq });
        } else {
          await db("outbox_events_sequence").insert({
            aggregate_type: aggregateType,
            aggregate_id: aggregateId,
            seq: 1,
          });
        }
        return [{ get_next_outbox_sequence: newSeq }];
      }
      return [];
    }) as any);
  }
});
