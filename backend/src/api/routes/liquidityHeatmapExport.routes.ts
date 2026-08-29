import type { FastifyInstance } from "fastify";
import {
  liquidityHeatmapExportService,
  type HeatmapInterval,
} from "../../services/liquidityHeatmapExport.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Historical liquidity heatmap export routes (#1150).
 *
 * Registered at prefix: /api/v1/liquidity-heatmap
 */
export async function liquidityHeatmapExportRoutes(server: FastifyInstance) {
  server.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      symbols?: string;
      interval?: HeatmapInterval;
      format?: "json" | "csv";
    };
  }>("/export", async (request, reply) => {
    try {
      const { startDate, endDate, symbols, interval, format } = request.query;

      if (!startDate || !endDate) {
        return reply.code(400).send({ error: "startDate and endDate query parameters are required" });
      }
      if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
        return reply.code(400).send({ error: "startDate must be before endDate" });
      }
      if (interval && interval !== "hour" && interval !== "day") {
        return reply.code(400).send({ error: "interval must be 'hour' or 'day'" });
      }

      const symbolList = symbols
        ? symbols
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        : undefined;

      const heatmap = await liquidityHeatmapExportService.exportHeatmap({
        startDate,
        endDate,
        symbols: symbolList,
        interval,
      });

      if (format === "csv") {
        reply.header("Content-Type", "text/csv");
        reply.header("Content-Disposition", "attachment; filename=liquidity-heatmap.csv");
        return reply.code(200).send(liquidityHeatmapExportService.toCsv(heatmap));
      }

      return reply.code(200).send(heatmap);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Failed to export liquidity heatmap");
      return reply.code(500).send({ error: message });
    }
  });
}
