import { describe, it, expect, beforeEach } from "vitest";
import { WatchlistImportExportService } from "../watchlistImportExport.service.js";

describe("WatchlistImportExportService (#1147)", () => {
  let service: WatchlistImportExportService;

  beforeEach(() => {
    service = new WatchlistImportExportService();
  });

  const sampleWatchlist = {
    id: "wlist_1",
    name: "High Liquidity Bridges",
    description: "Core bridge assets",
    items: [
      {
        assetAddress: "0xUSDC",
        chain: "stellar",
        label: "USDC Token",
        alertOnInflowSpike: true,
        alertOnOutflowSpike: false,
      },
    ],
    exportedAt: new Date().toISOString(),
  };

  it("should export and import JSON watchlist without loss", () => {
    const jsonStr = service.exportToJson(sampleWatchlist);
    const imported = service.importFromJson(jsonStr);

    expect(imported.name).toBe(sampleWatchlist.name);
    expect(imported.items.length).toBe(1);
    expect(imported.items[0].assetAddress).toBe("0xUSDC");
  });

  it("should export and import CSV watchlist", () => {
    const csvStr = service.exportToCsv(sampleWatchlist);
    expect(csvStr).toContain("assetAddress,chain,label");

    const imported = service.importFromCsv(csvStr, "CSV Imported List");
    expect(imported.name).toBe("CSV Imported List");
    expect(imported.items.length).toBe(1);
    expect(imported.items[0].chain).toBe("stellar");
  });
});
