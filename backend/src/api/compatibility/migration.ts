export function dualRead<T>(source: Record<string, unknown>, legacyField: string, currentField: string): T | undefined {
  return (source[currentField] ?? source[legacyField]) as T | undefined;
}

export function dualWrite<T>(target: Record<string, unknown>, value: T, legacyField: string, currentField: string): void {
  target[legacyField] = value;
  target[currentField] = value;
}
