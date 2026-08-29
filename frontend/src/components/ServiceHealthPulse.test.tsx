import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { axe } from "vitest-axe";
import ServiceHealthPulse from "./ServiceHealthPulse";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("ServiceHealthPulse", () => {
  it("renders loading state initially", () => {
    render(<ServiceHealthPulse />, { wrapper: createWrapper() });

    expect(screen.getByRole("article", { name: /loading service health/i })).toBeInTheDocument();
  });

  it("renders healthy status with all services operational", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "healthy",
            },
            {
              providerKey: "circle",
              displayName: "Circle API",
              category: "price",
              status: "healthy",
            },
          ],
          summary: {
            healthy: 2,
            degraded: 0,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    render(<ServiceHealthPulse />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("All systems operational")).toBeInTheDocument();
    });

    expect(screen.getByText("2 services")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /overall status: all systems operational/i })).toBeInTheDocument();
  });

  it("renders degraded status when any service is degraded", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "healthy",
            },
            {
              providerKey: "circle",
              displayName: "Circle API",
              category: "price",
              status: "degraded",
            },
          ],
          summary: {
            healthy: 1,
            degraded: 1,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    render(<ServiceHealthPulse />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Degraded performance")).toBeInTheDocument();
    });
  });

  it("renders down status when any service is down", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "circle",
              displayName: "Circle API",
              category: "price",
              status: "down",
            },
          ],
          summary: {
            healthy: 0,
            degraded: 0,
            down: 1,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    render(<ServiceHealthPulse />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Service disruption")).toBeInTheDocument();
    });
  });

  it("renders maintenance status", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "maintenance",
            },
          ],
          summary: {
            healthy: 0,
            degraded: 0,
            down: 0,
            maintenance: 1,
            unknown: 0,
          },
        });
      })
    );

    render(<ServiceHealthPulse />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Scheduled maintenance")).toBeInTheDocument();
    });
  });

  it("expands to show service breakdown when toggle is clicked", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "healthy",
            },
            {
              providerKey: "circle",
              displayName: "Circle API",
              category: "price",
              status: "degraded",
            },
          ],
          summary: {
            healthy: 1,
            degraded: 1,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    render(<ServiceHealthPulse compact={true} />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Degraded performance")).toBeInTheDocument();
    });

    // Initially collapsed
    const expandButton = screen.getByRole("button", { name: /expand service details/i });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");

    // Click expand button
    fireEvent.click(expandButton);

    // Services should now be visible
    await waitFor(() => {
      expect(screen.getByText("Horizon API")).toBeVisible();
      expect(screen.getByText("Circle API")).toBeVisible();
    });

    // Button should update aria-expanded
    expect(expandButton).toHaveAttribute("aria-expanded", "true");
  });

  it("does not render per-service breakdown in compact mode when collapsed", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "healthy",
            },
          ],
          summary: {
            healthy: 1,
            degraded: 0,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    render(<ServiceHealthPulse compact={true} />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("All systems operational")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /expand service details/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("renders error state when fetch fails", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      })
    );

    render(<ServiceHealthPulse />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Unable to load service health")).toBeInTheDocument();
    });
  });

  it("handles empty service list", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [],
          summary: {
            healthy: 0,
            degraded: 0,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    render(<ServiceHealthPulse />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("All systems operational")).toBeInTheDocument();
      expect(screen.getByText("0 services")).toBeInTheDocument();
    });

    // No expand button when there are no services
    expect(screen.queryByRole("button", { name: /expand service details/i })).not.toBeInTheDocument();
  });

  it("is accessible with no color-only status indicators", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "healthy",
            },
            {
              providerKey: "circle",
              displayName: "Circle API",
              category: "price",
              status: "degraded",
            },
          ],
          summary: {
            healthy: 1,
            degraded: 1,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    const { container } = render(<ServiceHealthPulse compact={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("Degraded performance")).toBeInTheDocument();
    });

    // Expand to show services
    const expandButton = screen.getByRole("button", { name: /collapse service details/i });
    expect(expandButton).toBeInTheDocument();

    // Check for text labels alongside status indicators
    expect(screen.getByText("Horizon API")).toBeInTheDocument();
    expect(screen.getByText("Circle API")).toBeInTheDocument();
    expect(screen.getByText("healthy")).toBeInTheDocument();
    expect(screen.getByText("degraded")).toBeInTheDocument();

    // Run axe accessibility tests
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("applies custom className", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [],
          summary: {
            healthy: 0,
            degraded: 0,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    const { container } = render(<ServiceHealthPulse className="custom-class" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("All systems operational")).toBeInTheDocument();
    });

    expect(container.querySelector(".custom-class")).toBeInTheDocument();
  });
});
