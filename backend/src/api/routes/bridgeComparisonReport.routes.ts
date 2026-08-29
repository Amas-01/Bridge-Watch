import type { FastifyInstance } from "fastify";
import { bridgeComparisonReportService } from "../../services/bridgeComparisonReport.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Bridge comparison report routes (#1149).
 *
 * Registered at prefix: /api/v1/bridge-comparison-report
 */
export async function bridgeComparisonReportRoutes(server: FastifyInstance) {
  server.get<{
    Querystring: {
      bridges?: string;
      startDate?: string;
      endDate?: string;
      format?: "json" | "csv";
    };
  }>("/", async (request, reply) => {
    try {
      const { bridges, startDate, endDate, format } = request.query;
      const bridgeNames = bridges
        ? bridges
            .split(",")
            .map((b) => b.trim())
            .filter(Boolean)
        : undefined;

      const dateRange = startDate || endDate ? { startDate, endDate } : undefined;
      const report = await bridgeComparisonReportService.generateReport(bridgeNames, dateRange);

      if (format === "csv") {
        reply.header("Content-Type", "text/csv");
        reply.header("Content-Disposition", "attachment; filename=bridge-comparison-report.csv");
        return reply.code(200).send(bridgeComparisonReportService.toCsv(report));
      }

      return reply.code(200).send(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Failed to generate bridge comparison report");
      return reply.code(500).send({ error: message });
    }
  });
}
