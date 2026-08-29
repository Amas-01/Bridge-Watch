import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { triggerBackup, triggerRestoreValidation } from "../../../src/services/backupService.js";

jest.mock("node:child_process", () => ({
  spawn: jest.fn(),
}));

jest.mock("../../../src/utils/logger.js", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

function mockSpawnBehaviour(): FakeChildProcess {
  const fake = new FakeChildProcess();
  mockedSpawn.mockReturnValue(fake as unknown as ReturnType<typeof spawn>);
  return fake;
}

describe("backupService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("triggerBackup", () => {
    it("resolves with success=true when the script exits 0", async () => {
      const fake = mockSpawnBehaviour();

      const resultPromise = triggerBackup();
      fake.stdout.emit("data", Buffer.from("[pg_backup] Backup job finished successfully.\n"));
      fake.emit("close", 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("Backup job finished successfully");
      expect(result.stderr).toBe("");
    });

    it("resolves with success=false and captures stderr when the script exits non-zero", async () => {
      const fake = mockSpawnBehaviour();

      const resultPromise = triggerBackup();
      fake.stderr.emit("data", Buffer.from("[pg_backup] ERROR: BACKUP_S3_BUCKET is required\n"));
      fake.emit("close", 1);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("BACKUP_S3_BUCKET is required");
    });

    it("resolves with success=false when the script fails to spawn", async () => {
      const fake = mockSpawnBehaviour();

      const resultPromise = triggerBackup();
      fake.emit("error", new Error("bash not found"));

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("bash not found");
    });

    it("merges caller-provided env vars into the spawned process env", async () => {
      const fake = mockSpawnBehaviour();

      const resultPromise = triggerBackup({ BACKUP_S3_BUCKET: "test-bucket" });
      fake.emit("close", 0);
      await resultPromise;

      const spawnCallArgs = mockedSpawn.mock.calls[0];
      const options = spawnCallArgs[2] as { env: Record<string, string> };
      expect(options.env.BACKUP_S3_BUCKET).toBe("test-bucket");
    });

    it("invokes pg_backup.sh via bash", async () => {
      const fake = mockSpawnBehaviour();

      const resultPromise = triggerBackup();
      fake.emit("close", 0);
      await resultPromise;

      const [command, args] = mockedSpawn.mock.calls[0];
      expect(command).toBe("bash");
      expect((args as string[])[0]).toContain("pg_backup.sh");
    });
  });

  describe("triggerRestoreValidation", () => {
    it("invokes restore_validate.sh via bash and resolves success on exit 0", async () => {
      const fake = mockSpawnBehaviour();

      const resultPromise = triggerRestoreValidation();
      fake.emit("close", 0);
      const result = await resultPromise;

      const [command, args] = mockedSpawn.mock.calls[0];
      expect(command).toBe("bash");
      expect((args as string[])[0]).toContain("restore_validate.sh");
      expect(result.success).toBe(true);
    });

    it("propagates failure when validation fails (e.g. checksum mismatch)", async () => {
      const fake = mockSpawnBehaviour();

      const resultPromise = triggerRestoreValidation();
      fake.stderr.emit(
        "data",
        Buffer.from("[restore_validate] ERROR: Checksum mismatch — backup file may be corrupted\n"),
      );
      fake.emit("close", 1);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("Checksum mismatch");
    });
  });
});