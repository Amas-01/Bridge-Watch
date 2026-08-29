/**
 * #1019 — Signed evidence bundles & append-only transparency log.
 *
 * Mounted at /api/v1/evidence.
 *
 *   POST /bundles                       create a signed bundle for a report/export
 *   GET  /bundles                       list bundles (filter by subject)
 *   GET  /bundles/:bundleId             full bundle document (verifies offline)
 *   GET  /bundles/:bundleId/disclose    partial-disclosure view (?sections=a,b&outputs=x)
 *   GET  /bundles/:bundleId/verify      server-side offline verification report
 *   POST /bundles/verify                stateless verification of a supplied document
 *   GET  /log                           transparency-log entries
 *   GET  /log/checkpoint                latest signed tree head
 *   GET  /log/proof/inclusion           ?logIndex=&treeSize=
 *   GET  /log/proof/consistency         ?first=&second=
 *   GET  /log/keys                      signer keys with rotation / revocation
 *   POST /log/keys/rotate               rotate the active bundle signer
 *   POST /log/keys/:keyId/revoke        revoke a signer key
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { evidenceBundleService } from "../../services/evidenceBundle.service.js";
import { verifyEvidenceBundle } from "../../services/transparencyLog/evidenceBundle.js";

const sectionSchema = z.object({
  sectionId: z.string().min(1).max(200),
  mediaType: z.string().max(120).optional(),
  label: z.string().max(200).optional(),
  value: z.unknown(),
  saltHex: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
});

const createBundleSchema = z.object({
  subject: z.object({
    type: z.string().min(1).max(80),
    id: z.string().min(1).max(120),
    reportType: z.string().max(80).optional(),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
  }),
  sections: z.array(sectionSchema).min(1).max(1000),
  finalityMetadata: z
    .object({
      chain: z.string(),
      observedLedger: z.union([z.number(), z.string()]),
      finalizedLedger: z.union([z.number(), z.string()]),
      confirmations: z.number(),
      finalityThreshold: z.number(),
      finalized: z.boolean(),
      observedAt: z.string(),
    })
    .nullish(),
  decoderVersions: z.record(z.string()).optional(),
  codeVersion: z.record(z.unknown()).nullish(),
  configVersion: z.record(z.unknown()).nullish(),
  queryParameters: z.record(z.unknown()).optional(),
  derivedOutputs: z
    .array(
      z.object({
        outputId: z.string().min(1).max(200),
        label: z.string().max(200).optional(),
        mediaType: z.string().max(120).optional(),
        value: z.unknown().optional(),
        outputHash: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
      }),
    )
    .max(500)
    .optional(),
  createdBy: z.string().max(120).optional(),
});

function parseList(v: unknown): string[] | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function evidenceBundleRoutes(server: FastifyInstance) {
  // ── Bundles ────────────────────────────────────────────────────────────

  server.post("/bundles", async (request, reply) => {
    const parsed = createBundleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", details: parsed.error.flatten() });
    }
    try {
      const result = await evidenceBundleService.createBundle(parsed.data as any);
      return reply.status(201).send({ data: result });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  server.get("/bundles", async (request, reply) => {
    const { subjectType, subjectId, limit, offset } = request.query as Record<string, string>;
    const data = await evidenceBundleService.listBundles({
      subjectType,
      subjectId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return reply.send({ data });
  });

  server.get("/bundles/:bundleId", async (request, reply) => {
    const { bundleId } = request.params as { bundleId: string };
    const { treeSize } = request.query as Record<string, string>;
    try {
      const doc = await evidenceBundleService.getBundleDocument(bundleId, {
        treeSize: treeSize ? parseInt(treeSize, 10) : undefined,
      });
      return reply.send({ data: doc, evidenceRoot: doc.evidenceRoot });
    } catch (err: any) {
      return reply.status(404).send({ error: "Not Found", message: err.message });
    }
  });

  server.get("/bundles/:bundleId/disclose", async (request, reply) => {
    const { bundleId } = request.params as { bundleId: string };
    const q = request.query as Record<string, string>;
    const sections = parseList(q.sections) ?? [];
    try {
      const doc = await evidenceBundleService.getBundleDocument(bundleId, {
        discloseSectionIds: sections,
        discloseOutputIds: parseList(q.outputs),
        treeSize: q.treeSize ? parseInt(q.treeSize, 10) : undefined,
      });
      return reply.send({ data: doc, evidenceRoot: doc.evidenceRoot });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  server.get("/bundles/:bundleId/verify", async (request, reply) => {
    const { bundleId } = request.params as { bundleId: string };
    try {
      const result = await evidenceBundleService.verifyBundle(bundleId);
      return reply.status(result.valid ? 200 : 422).send({ data: result });
    } catch (err: any) {
      return reply.status(404).send({ error: "Not Found", message: err.message });
    }
  });

  server.post("/bundles/verify", async (request, reply) => {
    const body = request.body as { document?: unknown; asOf?: string; requireTransparency?: boolean };
    if (!body?.document || typeof body.document !== "object") {
      return reply.status(400).send({ error: "Bad Request", message: "document is required" });
    }
    try {
      const result = verifyEvidenceBundle(body.document as any, {
        asOf: body.asOf,
        requireTransparency: body.requireTransparency,
      });
      return reply.status(result.valid ? 200 : 422).send({ data: result });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  // ── Transparency log ───────────────────────────────────────────────────

  server.get("/log", async (request, reply) => {
    const { entryType, limit, offset } = request.query as Record<string, string>;
    const data = await evidenceBundleService.listLogEntries({
      entryType,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    const treeSize = await evidenceBundleService.getCurrentTreeSize();
    return reply.send({ data, treeSize });
  });

  server.get("/log/checkpoint", async (_request, reply) => {
    const checkpoint = await evidenceBundleService.getLatestCheckpoint();
    if (!checkpoint) return reply.status(404).send({ error: "Not Found", message: "log is empty" });
    return reply.send({ data: checkpoint });
  });

  server.get("/log/proof/inclusion", async (request, reply) => {
    const { logIndex, treeSize } = request.query as Record<string, string>;
    if (logIndex === undefined) {
      return reply.status(400).send({ error: "Bad Request", message: "logIndex is required" });
    }
    try {
      const data = await evidenceBundleService.getInclusionProof(
        parseInt(logIndex, 10),
        treeSize ? parseInt(treeSize, 10) : undefined,
      );
      return reply.send({ data });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  server.get("/log/proof/consistency", async (request, reply) => {
    const { first, second } = request.query as Record<string, string>;
    if (first === undefined) {
      return reply.status(400).send({ error: "Bad Request", message: "first is required" });
    }
    try {
      const data = await evidenceBundleService.getConsistencyProof(
        parseInt(first, 10),
        second ? parseInt(second, 10) : undefined,
      );
      return reply.send({ data });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  // ── Signer keys ────────────────────────────────────────────────────────

  server.get("/log/keys", async (request, reply) => {
    const { purpose } = request.query as Record<string, string>;
    const data = await evidenceBundleService.listSigningKeys(purpose);
    return reply.send({ data });
  });

  server.post("/log/keys/rotate", async (request, reply) => {
    const body = (request.body ?? {}) as { rotatedBy?: string };
    const data = await evidenceBundleService.rotateSigner(body.rotatedBy);
    return reply.status(201).send({ data });
  });

  server.post("/log/keys/:keyId/revoke", async (request, reply) => {
    const { keyId } = request.params as { keyId: string };
    const body = (request.body ?? {}) as { reason?: string; revokedBy?: string };
    try {
      const data = await evidenceBundleService.revokeSigner(keyId, body.reason ?? "unspecified", body.revokedBy);
      return reply.send({ data });
    } catch (err: any) {
      return reply.status(404).send({ error: "Not Found", message: err.message });
    }
  });
}
