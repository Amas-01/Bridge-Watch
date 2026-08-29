export type ApiVersion = "v1";

export interface ApiContractSummary {
  version: ApiVersion;
  mediaType: string;
  status: "current" | "deprecated";
  fingerprint: string;
  sunsetAt: string | null;
}

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
  errors: { contentType: string; fields: readonly string[] };
  timestamps: { format: "RFC3339"; timezone: "UTC" };
  numericPrecision: { jsonNumbers: "IEEE-754 double"; exactValues: "decimal strings" };
  capabilities: Readonly<Record<string, boolean>>;
  fingerprint: string;
}

export interface ApiCapabilities {
  version: ApiVersion;
  fingerprint: string;
  capabilities: Record<string, boolean>;
}

export function compatibilityHeaders(version: ApiVersion = "v1"): Headers {
  const headers = new Headers();
  headers.set("X-API-Version", version);
  headers.set("Accept", `application/vnd.bridge-watch.${version}+json`);
  return headers;
}
