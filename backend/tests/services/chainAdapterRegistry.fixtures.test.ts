import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

vi.mock("../../src/database/db.js", () => ({
  db: { query: vi.fn(), connect: vi.fn() },
}));

import {
  SUPPORTED_CHAINS,
  buildRegistryVersion,
  computeAbiHash,
  decodeLogWithAbi,
  resolveEpochForBlock,
} from "../../src/services/chainAdapterRegistry.service.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("../../src/services/chainAdapters/fixtures/", import.meta.url)
);

interface Sample {
  description: string;
  blockNumber: number;
  rawLog: { topics: string[]; data: string };
  expected: { eventName: string; args: Record<string, unknown> };
}
interface Fixture {
  chainId: string;
  contractIdentity: string;
  epoch: number;
  registryVersion: string;
  decimals: number;
  deploymentFromBlock: number;
  abi: string[];
  samples: Sample[];
}

function loadFixture(chain: string): Fixture {
  const file = `${FIXTURE_DIR}${chain}.json`;
  return JSON.parse(readFileSync(file, "utf8")) as Fixture;
}

describe("chain-adapter fixtures — every supported chain", () => {
  it("ships a fixture file for each supported chain", () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(existsSync(`${FIXTURE_DIR}${chain}.json`), `missing fixture: ${chain}.json`).toBe(true);
    }
  });

  for (const chain of SUPPORTED_CHAINS) {
    describe(chain, () => {
      const fx = loadFixture(chain);

      it("fixture metadata is internally consistent", () => {
        expect(fx.chainId).toBe(chain);
        expect(fx.registryVersion).toBe(
          buildRegistryVersion(fx.chainId, fx.contractIdentity, fx.epoch)
        );
        expect(computeAbiHash(fx.abi)).toMatch(/^[0-9a-f]{64}$/);
        expect(fx.samples.length).toBeGreaterThan(0);
      });

      it("every sample decodes to its expected event and args", () => {
        for (const sample of fx.samples) {
          const decoded = decodeLogWithAbi(fx.abi, sample.rawLog);
          expect(decoded.eventName, sample.description).toBe(sample.expected.eventName);
          expect(decoded.args, sample.description).toEqual(sample.expected.args);
        }
      });

      it("decoding is reproducible from the same ABI + raw log", () => {
        for (const sample of fx.samples) {
          const a = decodeLogWithAbi(fx.abi, sample.rawLog);
          const b = decodeLogWithAbi(fx.abi, sample.rawLog);
          expect(a).toEqual(b);
        }
      });

      it("every sample block sits inside the adapter deployment range", () => {
        const epochs = [{ deploymentFromBlock: fx.deploymentFromBlock, deploymentToBlock: null }];
        for (const sample of fx.samples) {
          expect(resolveEpochForBlock(epochs, sample.blockNumber), sample.description).not.toBeNull();
        }
      });
    });
  }
});
