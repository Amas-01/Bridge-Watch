/**
 * Database state fixtures for integration testing.
 *
 * Each fixture represents a reproducible, named database state that can be
 * loaded before a test and reset afterwards. Fixtures are deterministic —
 * the same fixture always produces the same rows.
 *
 * Available Fixtures:
 * - HealthyBridge: One healthy bridge with matching supplies
 * - DegradedBridge: Bridge with 15% supply mismatch
 * - MixedBridgeHealth: Two bridges with different health states
 * - PendingReserveCommitment: Bridge with pending reserve commitment
 * - VerifiedReserveCommitment: Bridge with verified reserve commitment
 * - MultiAsset: Multiple assets (XLM, USDC, EURC)
 * - MinimalAsset: Single active asset without bridges
 *
 * Usage:
 *   import { loadFixture, resetFixture, Fixture } from "../fixtures";
 *
 *   beforeEach(() => loadFixture(db, Fixture.HealthyBridge));
 *   afterEach(() => resetFixture(db));
 */

export { Fixture } from "./fixture-registry.js";
export {
  loadFixture,
  resetFixture,
  listLoadedFixtures,
} from "./fixture-manager.js";
