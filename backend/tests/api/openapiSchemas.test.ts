import { describe, expect, it } from "vitest";
import {
  AlertHistoryRouteQuerySchema,
  AssetDetailsResponseSchema,
  toOpenApiSchema,
} from "../../src/api/schemas/openapiSchemas.js";

function properties(schema: Record<string, unknown>): Record<string, unknown> {
  return schema.properties as Record<string, unknown>;
}

describe("route OpenAPI schemas", () => {
  it("documents nullable asset bridge metadata from the Zod response schema", () => {
    const schema = toOpenApiSchema(AssetDetailsResponseSchema);
    const details = properties(schema).details as Record<string, unknown>;
    const detailSchema = (details.allOf as Record<string, unknown>[] | undefined)?.[0] ?? details;
    const metadata = properties(detailSchema);

    expect(JSON.stringify(metadata.bridge_provider)).toContain('"nullable":true');
    expect(JSON.stringify(metadata.source_chain)).toContain('"nullable":true');
    expect(JSON.stringify(metadata.issuer)).toContain('"nullable":true');
  });

  it("uses the live alert-history query names instead of stale aliases", () => {
    const queryProperties = properties(toOpenApiSchema(AlertHistoryRouteQuerySchema));

    expect(Object.keys(queryProperties)).toEqual(
      expect.arrayContaining([
        "from",
        "to",
        "severity",
        "source",
        "alertType",
        "q",
        "page",
        "pageSize",
      ]),
    );
    expect(queryProperties).not.toHaveProperty("assetCode");
    expect(queryProperties).not.toHaveProperty("startDate");
    expect(queryProperties).not.toHaveProperty("limit");
  });

  it("rejects malformed alert-history dates and page sizes", () => {
    expect(
      AlertHistoryRouteQuerySchema.safeParse({ from: "not-a-date", pageSize: "many" }).success,
    ).toBe(false);
    expect(
      AlertHistoryRouteQuerySchema.safeParse({
        from: "2026-01-01T00:00:00.000Z",
        pageSize: "50",
      }).success,
    ).toBe(true);
  });
});
