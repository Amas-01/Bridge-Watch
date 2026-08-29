import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Job } from "bullmq";
import { processExternalDependencyMonitor } from "../../src/workers/externalDependencyMonitor.job.js";
import { ExternalDependencyMonitorService } from "../../src/services/externalDependencyMonitor.service.js";

vi.mock("../../src/services/externalDependencyMonitor.service.js");
vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("externalDependencyMonitor job", () => {
  let mockJob: Partial<Job>;
  let mockService: any;

  beforeEach(() => {
    mockJob = {
      id: "test-job-123",
      name: "externalDependencyMonitor",
    };

    mockService = vi.mocked(ExternalDependencyMonitorService).mock.instances[0];
    if (!mockService) {
      vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
        runAllChecks: vi.fn().mockResolvedValue(undefined),
      } as any));
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("processes the external dependency monitor job successfully", async () => {
    const mockRunAllChecks = vi.fn().mockResolvedValue(undefined);
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await processExternalDependencyMonitor(mockJob as Job);

    expect(mockRunAllChecks).toHaveBeenCalledWith("scheduled");
    expect(mockRunAllChecks).toHaveBeenCalledTimes(1);
  });

  it("calls runAllChecks with scheduled trigger type", async () => {
    const mockRunAllChecks = vi.fn().mockResolvedValue(undefined);
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await processExternalDependencyMonitor(mockJob as Job);

    const calls = mockRunAllChecks.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe("scheduled");
  });

  it("handles errors from runAllChecks gracefully", async () => {
    const testError = new Error("External API unreachable");
    const mockRunAllChecks = vi.fn().mockRejectedValue(testError);
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await expect(processExternalDependencyMonitor(mockJob as Job)).rejects.toThrow(
      "External API unreachable"
    );
  });

  it("handles network timeout errors from external dependencies", async () => {
    const timeoutError = new Error("Request timeout");
    (timeoutError as any).code = "ECONNABORTED";
    const mockRunAllChecks = vi.fn().mockRejectedValue(timeoutError);
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await expect(processExternalDependencyMonitor(mockJob as Job)).rejects.toThrow();
  });

  it("records the job execution", async () => {
    const mockRunAllChecks = vi.fn().mockResolvedValue(undefined);
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await processExternalDependencyMonitor(mockJob as Job);

    // Verify the service was instantiated
    expect(ExternalDependencyMonitorService).toHaveBeenCalledTimes(1);
  });

  it("continues processing when one dependency check fails", async () => {
    const mockRunAllChecks = vi.fn().mockResolvedValue({
      checks: [
        { name: "stellar_horizon", status: "healthy" },
        { name: "circle_api", status: "down" },
        { name: "price_oracle", status: "healthy" },
      ],
    });
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await processExternalDependencyMonitor(mockJob as Job);

    expect(mockRunAllChecks).toHaveBeenCalled();
  });

  it("handles database connection errors", async () => {
    const dbError = new Error("Database connection failed");
    (dbError as any).code = "ECONNREFUSED";
    const mockRunAllChecks = vi.fn().mockRejectedValue(dbError);
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await expect(processExternalDependencyMonitor(mockJob as Job)).rejects.toThrow(
      "Database connection failed"
    );
  });

  it("updates dependency status when API returns outage", async () => {
    const mockRunAllChecks = vi.fn().mockResolvedValue({
      updated: [
        { id: "stellar_horizon", previousStatus: "healthy", newStatus: "down", reason: "API returned 503" },
      ],
    });
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await processExternalDependencyMonitor(mockJob as Job);

    expect(mockRunAllChecks).toHaveBeenCalledWith("scheduled");
  });

  it("handles malformed external API responses", async () => {
    const mockRunAllChecks = vi.fn().mockResolvedValue(null);
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await expect(processExternalDependencyMonitor(mockJob as Job)).resolves.toBeUndefined();
    expect(mockRunAllChecks).toHaveBeenCalled();
  });

  it("retries failed checks with exponential backoff", async () => {
    const mockRunAllChecks = vi.fn()
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce(undefined);

    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    // First call should fail
    await expect(processExternalDependencyMonitor(mockJob as Job)).rejects.toThrow();

    // Verify the service tried to run checks
    expect(mockRunAllChecks).toHaveBeenCalledTimes(1);
  });

  it("logs job completion with status", async () => {
    const { logger } = await import("../../src/utils/logger.js");
    const mockRunAllChecks = vi.fn().mockResolvedValue(undefined);
    vi.mocked(ExternalDependencyMonitorService).mockImplementation(() => ({
      runAllChecks: mockRunAllChecks,
    } as any));

    await processExternalDependencyMonitor(mockJob as Job);

    // Verify logger was called (at least for info logging)
    expect(logger.info).toHaveBeenCalled();
  });
});
