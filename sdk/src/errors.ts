export class BridgeWatchSdkError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = "SDK_ERROR", details?: unknown) {
    super(message);
    this.name = "BridgeWatchSdkError";
    this.code = code;
    this.details = details;
  }
}

export class BridgeWatchConnectionError extends BridgeWatchSdkError {
  constructor(message: string, details?: unknown) {
    super(message, "CONNECTION_ERROR", details);
    this.name = "BridgeWatchConnectionError";
  }
}

export class BridgeWatchTransactionError extends BridgeWatchSdkError {
  constructor(message: string, details?: unknown) {
    super(message, "TRANSACTION_ERROR", details);
    this.name = "BridgeWatchTransactionError";
  }
}

export class BridgeWatchQueryError extends BridgeWatchSdkError {
  constructor(message: string, details?: unknown) {
    super(message, "QUERY_ERROR", details);
    this.name = "BridgeWatchQueryError";
  }
}
