/** Sum an array of numbers, returning null if the array is empty. */
export function sumColumn(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}

/** Average an array of numbers, returning null if the array is empty. */
export function avgColumn(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Format a number as a compact USD string (1.2M, 340K, etc.) */
export function formatCompact(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) >= 1_000_000_000)
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000)
    return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000)
    return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}
