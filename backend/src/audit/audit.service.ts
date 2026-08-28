import crypto from "crypto";
import { auditRepository } from "./audit.repository.js";
import { AuditEvent } from "./audit.types.js";
import { logger } from "../utils/logger.js";
import { getTenantContext } from "../multi-tenant/tenantContext.js";

export class AuditService {
  async log(params: Omit<AuditEvent, "id" | "createdAt" | "checksum" | "previousChecksum" | "tenantId">): Promise<AuditEvent> {
    const previousChecksum = await auditRepository.getLatestChecksum();
    
    const id = crypto.randomUUID();
    const createdAt = new Date();

    const ctx = getTenantContext();
    const tenantId = ctx?.tenantId;
    
    // Create draft to be serialized for checksum calculation exactly as described
    const eventDraft = {
      id,
      actorId: params.actorId,
      actorType: params.actorType,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: params.metadata,
      createdAt,
      tenantId,
    };

    // Immutability protection: checksum = sha256(previousChecksum + JSON.stringify(event))
    const checksumInput = (previousChecksum || "") + JSON.stringify(eventDraft);
    const checksum = crypto.createHash("sha256").update(checksumInput).digest("hex");

    const event: AuditEvent = {
      ...eventDraft,
      checksum,
      previousChecksum: previousChecksum || undefined,
      tenantId,
    };

    await auditRepository.insertEvent(event);

    // Structured logging requirement
    logger.info({
      event: "audit_created",
      actor: event.actorId,
      action: event.action,
      resource: event.resourceId,
    });

    return event;
  }
}

export const auditService = new AuditService();
