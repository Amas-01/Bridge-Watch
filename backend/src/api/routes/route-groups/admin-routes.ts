import type { FastifyInstance } from "fastify";
import { apiKeysRoutes } from "../apiKeys.js";
import { rateLimitAdminRoutes } from "../rateLimitAdmin.js";
import { tracingAdminRoutes } from "../tracingAdmin.js";
import { validationAdminRoutes } from "../validationAdmin.js";
import { auditRoutes } from "../audit.js";
import { adminRotationRoutes } from "../adminRotation.js";
import { accessOverviewRoutes } from "../accessOverview.routes.js";
import { operationalAccessAuditRoutes } from "../operationalAccessAudit.js";
import { providerAllowlistAdminRoutes } from "../providerAllowlistAdmin.routes.js";
import { eventSourceKeyRoutes } from "../eventSourceKeys.routes.js";
import { operatorHandoffRoutes } from "../operatorHandoff.routes.js";
import { operatorAvailabilityRoutes } from "../operatorAvailability.routes.js";
// #1058 — Request Sampling Controls
import { samplingRulesRoutes } from "../samplingRules.js";
// #1059 — Structured Error Catalog
import { errorCatalogAdminRoutes, errorCatalogPublicRoutes } from "../errorCatalog.js";
// #1060 — Operational Change Approval Workflow
import { changeRequestsRoutes } from "../changeRequests.js";
// #1061 — Config Rollback Preview
import { configVersionsRoutes } from "../configVersions.js";

export async function registerAdminRoutes(server: FastifyInstance): Promise<void> {
  server.register(apiKeysRoutes, { prefix: "/api/v1/admin/api-keys" });
  server.register(rateLimitAdminRoutes, { prefix: "/api/v1/admin/rate-limit" });
  server.register(tracingAdminRoutes, { prefix: "/api/v1/admin/tracing" });
  server.register(validationAdminRoutes, {
    prefix: "/api/v1/admin/validation",
  });
  server.register(auditRoutes, { prefix: "/api/v1/admin/audit" });
  server.register(adminRotationRoutes, { prefix: "/api/v1/admin/rotation" });
  server.register(accessOverviewRoutes, {
    prefix: "/api/v1/admin/access-overview",
  });
  server.register(operationalAccessAuditRoutes, {
    prefix: "/api/v1/admin/access-audit",
  });
  server.register(providerAllowlistAdminRoutes, {
    prefix: "/api/v1/admin/providers/allowlist",
  });
  server.register(eventSourceKeyRoutes, {
    prefix: "/api/v1/admin/event-source-keys",
  });
  server.register(operatorHandoffRoutes, {
    prefix: "/api/v1/operator",
  });
  server.register(operatorAvailabilityRoutes, {
    prefix: "/api/v1/operator",
  });

  // #1058 — Request Sampling Controls
  server.register(samplingRulesRoutes, {
    prefix: "/api/v1/admin/sampling-rules",
  });

  // #1059 — Error Catalog (admin CRUD)
  server.register(errorCatalogAdminRoutes, {
    prefix: "/api/v1/admin/error-catalog",
  });

  // #1059 — Error Catalog (authenticated public lookup)
  server.register(errorCatalogPublicRoutes, {
    prefix: "/api/v1/error-catalog",
  });

  // #1060 — Operational Change Approval Workflow
  server.register(changeRequestsRoutes, {
    prefix: "/api/v1/admin/change-requests",
  });

  // #1061 — Config Version History & Rollback Preview
  server.register(configVersionsRoutes, {
    prefix: "/api/v1/admin/config-versions",
  });
}

