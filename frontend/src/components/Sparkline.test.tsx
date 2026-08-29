import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "../test/mocks/server";
import Sparkline from "./Sparkline";

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

class MockResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

const HEALTH_POINTS = Array.from({ length: 10 }, (_, i) => ({
  timestamp: new Date(Date.now() - (9 - i) * 3_600_000).toISOString(),
  score: 80 + i,
}));

function renderSparkline() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Sparkline symbol="XLM" metric="health" lazy={false} />
    </QueryClientProvider>
  );
}

describe("Sparkline loading skeleton", () => {
  it("reserves a fixed-height placeholder while data is loading, preventing layout shift", async () => {
    server.use(
      http.get("/api/v1/assets/XLM/health/history", async () => {
        await delay(50);
        return HttpResponse.json({ symbol: "XLM", period: "7d", points: HEALTH_POINTS });
      })
    );

    renderSparkline();

    const skeleton = screen.getByRole("status", { name: /loading sparkline/i });
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveStyle({ height: "32px" });

    await waitFor(() =>
      expect(screen.queryByRole("status", { name: /loading sparkline/i })).not.toBeInTheDocument()
    );
  });
});
