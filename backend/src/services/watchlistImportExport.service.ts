/**
 * Watchlist Import and Export Service
 * Issue #1147
 */

export interface WatchlistItem {
  assetAddress: string;
  chain: string;
  label: string;
  alertOnInflowSpike: boolean;
  alertOnOutflowSpike: boolean;
}

export interface WatchlistData {
  id: string;
  name: string;
  description: string;
  items: WatchlistItem[];
  exportedAt: string;
}

export class WatchlistImportExportService {
  public exportToJson(watchlist: WatchlistData): string {
    return JSON.stringify(watchlist, null, 2);
  }

  public exportToCsv(watchlist: WatchlistData): string {
    const header = "assetAddress,chain,label,alertOnInflowSpike,alertOnOutflowSpike\n";
    const rows = watchlist.items
      .map(
        (i) =>
          `"${i.assetAddress}","${i.chain}","${i.label}",${i.alertOnInflowSpike},${i.alertOnOutflowSpike}`,
      )
      .join("\n");
    return header + rows;
  }

  public importFromJson(jsonString: string): WatchlistData {
    try {
      const parsed = JSON.parse(jsonString) as WatchlistData;
      if (!parsed.name || !Array.isArray(parsed.items)) {
        throw new Error("Invalid watchlist format: missing name or items");
      }
      return parsed;
    } catch (err) {
      throw new Error(`JSON parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  public importFromCsv(csvString: string, name: string): WatchlistData {
    const lines = csvString.trim().split("\n");
    if (lines.length < 2) {
      throw new Error("CSV must have a header and at least one item row");
    }

    const items: WatchlistItem[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(",").map((p) => p.replace(/^"|"$/g, "").trim());
      if (parts.length >= 3) {
        items.push({
          assetAddress: parts[0],
          chain: parts[1],
          label: parts[2],
          alertOnInflowSpike: parts[3] === "true",
          alertOnOutflowSpike: parts[4] === "true",
        });
      }
    }

    return {
      id: `wlist_${Date.now()}`,
      name,
      description: `Imported from CSV on ${new Date().toLocaleDateString()}`,
      items,
      exportedAt: new Date().toISOString(),
    };
  }
}

export const watchlistImportExportService = new WatchlistImportExportService();
