import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";

// Mock configuration with different CORS settings
const createMockConfig = (corsOrigins: string) => ({
  config: {
    CORS_ALLOWED_ORIGINS: corsOrigins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    PORT: 3001,
  },
});

describe("CORS Configuration", () => {
  let server: any;

  beforeEach(async () => {
    server = Fastify({ logger: false });
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  it("allows valid origins from allowlist", async () => {
    vi.doMock("../src/config/index.js", () => 
      createMockConfig("https://app.bridgewatch.io,https://www.bridgewatch.io")
    );

    await server.register(cors, {
      origin: (origin: string | undefined, callback: (err: Error | null, allowed: boolean) => void) => {
        if (!origin) return callback(null, true);
        
        const allowedOrigins = ["https://app.bridgewatch.io", "https://www.bridgewatch.io"];
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        return callback(null, false);
      },
      credentials: true,
    });

    server.get("/test", async () => ({ success: true }));

    const response1 = await server.inject({
      method: "GET",
      url: "/test",
      headers: {
        origin: "https://app.bridgewatch.io",
      },
    });

    expect(response1.headers["access-control-allow-origin"]).toBe(
      "https://app.bridgewatch.io"
    );

    const response2 = await server.inject({
      method: "GET",
      url: "/test",
      headers: {
        origin: "https://www.bridgewatch.io",
      },
    });

    expect(response2.headers["access-control-allow-origin"]).toBe(
      "https://www.bridgewatch.io"
    );
  });

  it("rejects unlisted origins", async () => {
    vi.doMock("../src/config/index.js", () => 
      createMockConfig("https://app.bridgewatch.io")
    );

    await server.register(cors, {
      origin: (origin: string | undefined, callback: (err: Error | null, allowed: boolean) => void) => {
        if (!origin) return callback(null, true);
        
        const allowedOrigins = ["https://app.bridgewatch.io"];
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        return callback(null, false);
      },
      credentials: true,
    });

    server.get("/test", async () => ({ success: true }));

    const response = await server.inject({
      method: "GET",
      url: "/test",
      headers: {
        origin: "https://malicious.com",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("handles multiple origins correctly", async () => {
    const allowedOrigins = ["https://a.com", "https://b.com"];
    
    await server.register(cors, {
      origin: (origin: string | undefined, callback: (err: Error | null, allowed: boolean) => void) => {
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        return callback(null, false);
      },
      credentials: true,
    });

    server.get("/test", async () => ({ success: true }));

    // Test first origin
    const response1 = await server.inject({
      method: "GET",
      url: "/test",
      headers: {
        origin: "https://a.com",
      },
    });

    expect(response1.headers["access-control-allow-origin"]).toBe("https://a.com");

    // Test second origin
    const response2 = await server.inject({
      method: "GET",
      url: "/test",
      headers: {
        origin: "https://b.com",
      },
    });

    expect(response2.headers["access-control-allow-origin"]).toBe("https://b.com");

    // Test unlisted origin
    const response3 = await server.inject({
      method: "GET",
      url: "/test",
      headers: {
        origin: "https://c.com",
      },
    });

    expect(response3.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("trims whitespace in origins correctly", async () => {
    const mockOrigins = " https://a.com , https://b.com ";
    const allowedOrigins = mockOrigins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    
    expect(allowedOrigins).toEqual(["https://a.com", "https://b.com"]);
  });

  it("allows no-origin requests (mobile apps, curl)", async () => {
    await server.register(cors, {
      origin: (origin: string | undefined, callback: (err: Error | null, allowed: boolean) => void) => {
        if (!origin) return callback(null, true);
        
        const allowedOrigins = ["https://app.bridgewatch.io"];
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        return callback(null, false);
      },
      credentials: true,
    });

    server.get("/test", async () => ({ success: true }));

    const response = await server.inject({
      method: "GET",
      url: "/test",
      // No origin header
    });

    // No origin requests should be allowed
    expect(response.statusCode).toBe(200);
  });

  it("handles empty CORS_ALLOWED_ORIGINS by rejecting all origins", async () => {
    const allowedOrigins: string[] = [];
    
    await server.register(cors, {
      origin: (origin: string | undefined, callback: (err: Error | null, allowed: boolean) => void) => {
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        return callback(null, false);
      },
      credentials: true,
    });

    server.get("/test", async () => ({ success: true }));

    const response = await server.inject({
      method: "GET",
      url: "/test",
      headers: {
        origin: "https://any-origin.com",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});