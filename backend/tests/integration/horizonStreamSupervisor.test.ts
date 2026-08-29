import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HorizonStreamSupervisor,
  type HorizonStreamConfig,
} from "../../src/services/horizonStreamSupervisor.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/services/metrics.service.js", () => ({
  getMetricsService: vi.fn(() => null),
}));

vi.mock("../../src/services/ingestionQueueManager.service.js", () => ({
  ingestionQueueManager: { detectReorgAndRollback: vi.fn().mockResolvedValue([]) },
}));

type ReaderStep = { value?: string; error?: Error };

function createSseReader(steps: ReaderStep[]) {
  let i = 0;
  return {
    read: vi.fn(async () => {
      const step = steps[i++];
      if (!step) return { done: true, value: undefined };
      if (step.error) throw step.error;
      return { done: false, value: new TextEncoder().encode(step.value) };
    }),
  };
}

function okResponse(steps: ReaderStep[]) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: { getReader: () => createSseReader(steps) },
  } as unknown as Response;
}

async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function baseConfig(overrides: Partial<HorizonStreamConfig> = {}): HorizonStreamConfig {
  return {
    streamId: "test-stream",
    url: "https://horizon.stellar.org/transactions",
    baseBackoffMs: 5,
    maxBackoffMs: 20,
    gapThresholdMs: 100_000,
    timeoutMs: 5_000,
    ...overrides,
  };
}

describe("HorizonStreamSupervisor reconnect (integration)", () => {
  let supervisor: HorizonStreamSupervisor | null = null;

  afterEach(() => {
    supervisor?.stop();
    supervisor = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reconnects and resets reconnectCount after a stream error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(okResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    supervisor = new HorizonStreamSupervisor(baseConfig());
    supervisor.start();

    await waitUntil(() => fetchMock.mock.calls.length >= 2);
    await waitUntil(() => supervisor!.getHealthMetrics().status === "connected");

    expect(supervisor.getHealthMetrics().reconnectCount).toBe(0);
  });

  it("resumes from the last checkpointed cursor after reconnecting", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okResponse([
          { value: 'data: {"id":"cursor-100","ledger":"5"}\n\n' },
          { error: new Error("stream broken") },
        ])
      )
      .mockResolvedValueOnce(okResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    supervisor = new HorizonStreamSupervisor(baseConfig());
    supervisor.start();

    await waitUntil(() => fetchMock.mock.calls.length >= 2);

    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain("cursor=cursor-100");
    expect(supervisor.getCheckpoint().lastCursor).toBe("cursor-100");
  });

  it("emits an outage event after exceeding maxReconnectAttempts", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    supervisor = new HorizonStreamSupervisor(
      baseConfig({ maxReconnectAttempts: 2, baseBackoffMs: 5, maxBackoffMs: 10 })
    );

    const outage = vi.fn();
    supervisor.on("outage", outage);
    supervisor.start();

    await waitUntil(() => outage.mock.calls.length >= 1);

    expect(outage).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: "test-stream", reconnectCount: 2 })
    );
  });

  it("stops scheduling reconnects once stop() is called", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    supervisor = new HorizonStreamSupervisor(baseConfig({ maxReconnectAttempts: 20 }));
    supervisor.start();

    await waitUntil(() => fetchMock.mock.calls.length >= 1);
    supervisor.stop();
    const callsAtStop = fetchMock.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock.mock.calls.length).toBe(callsAtStop);
    expect(supervisor.getHealthMetrics().status).toBe("closed");
  });
});
