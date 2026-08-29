const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

/**
 * Shared fetch helper for the DEX liquidity pages (#1157-#1160).
 *
 * The four pages all talk to `/api/v1/liquidity/*` and all surface backend
 * errors the same way, so the unwrapping lives here rather than four times over.
 */
export async function liquidityApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1/liquidity${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      /* body was not JSON — keep the status line */
    }
    throw new Error(message);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const usd = (value: number): string =>
  value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(2)}M`
    : value >= 1_000
      ? `$${(value / 1_000).toFixed(1)}k`
      : `$${value.toFixed(2)}`;

export const pct = (value: number, digits = 2): string => `${value.toFixed(digits)}%`;
