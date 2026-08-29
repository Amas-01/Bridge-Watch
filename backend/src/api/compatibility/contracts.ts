import { createHash } from "node:crypto";

export type ApiVersion = "v1";

export interface ApiContract {
  version: ApiVersion;
  mediaType: string;
  status: "current" | "deprecated";
  releasedAt: string;
  sunsetAt?: string;
  pagination: {
    style: "page-limit";
    defaultLimit: number;
    maximumLimit: number;
    totalType: "integer";
  };
  errors: {
    contentType: string;
    fields: readonly string[];
  };
  timestamps: {
    format: "RFC3339";
    timezone: "UTC";
  };
  numericPrecision: {
    jsonNumbers: "IEEE-754 double";
    exactValues: "decimal strings";
  };
  capabilities: Readonly<Record<string, boolean>>;
}

export const API_CONTRACTS: readonly ApiContract[] = [
  {
    version: "v1",
    mediaType: "application/vnd.bridge-watch.v1+json",
    status: "current",
    releasedAt: "2026-01-01T00:00:00Z",
    pagination: {
      style: "page-limit",
      defaultLimit: 20,
      maximumLimit: 100,
      totalType: "integer",
    },
    errors: {
      contentType: "application/json",
      fields: ["error", "message", "statusCode"],
    },
    timestamps: { format: "RFC3339", timezone: "UTC" },
    numericPrecision: {
      jsonNumbers: "IEEE-754 double",
      exactValues: "decimal strings",
    },
    capabilities: {
      "pagination.pageLimit": true,
      "errors.statusCode": true,
      "timestamps.rfc3339": true,
      "numeric.decimalStrings": true,
      "migration.dualReadWrite": true,
    },
  },
];

export function getContract(version: string | undefined): ApiContract | undefined {
  return API_CONTRACTS.find((contract) => contract.version === version);
}

export function getCurrentContract(): ApiContract {
  return API_CONTRACTS.find((contract) => contract.status === "current") ?? API_CONTRACTS[0];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function getContractFingerprint(contract: ApiContract): string {
  return createHash("sha256").update(stableJson(contract)).digest("hex");
}

export function parseRequestedVersion(headers: {
  "x-api-version"?: string;
  accept?: string;
}): ApiVersion | undefined {
  const explicitVersion = headers["x-api-version"]?.trim();
  if (explicitVersion) return explicitVersion as ApiVersion;

  const mediaVersion = headers.accept?.match(/application\/vnd\.bridge-watch\.(v\d+)\+json/i)?.[1];
  return mediaVersion as ApiVersion | undefined;
}

export function isVendorMediaType(accept: string | undefined, contract: ApiContract): boolean {
  return accept?.split(",").some((value) => value.trim().split(";")[0] === contract.mediaType) ?? false;
}
