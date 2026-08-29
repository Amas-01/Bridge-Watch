import * as jwt from "jsonwebtoken";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export interface TokenPayload {
  sub: string;
  client_id: string;
  scope: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
}

interface OAuth2Config {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  tokenTtlSeconds: number;
}

function getOAuth2Config(): OAuth2Config {
  return {
    jwtSecret: config.JWT_SECRET || randomBytes(32).toString("hex"),
    jwtIssuer: config.JWT_ISSUER || "bridge-watch-api",
    jwtAudience: config.JWT_AUDIENCE || "bridge-watch-api",
    tokenTtlSeconds: Number(config.JWT_TTL_SECONDS) || 3600,
  };
}

export class OAuth2Service {
  private config: OAuth2Config;

  constructor() {
    this.config = getOAuth2Config();
    
    if (!config.JWT_SECRET) {
      logger.warn(
        "JWT_SECRET not configured. Using randomly generated secret (tokens will not survive restarts)"
      );
    }
  }

  generateClientCredentials(): { clientId: string; clientSecret: string } {
    const clientId = `bw_${randomBytes(16).toString("hex")}`;
    const clientSecret = `bws_${randomBytes(32).toString("hex")}`;
    return { clientId, clientSecret };
  }

  hashClientSecret(clientSecret: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(clientSecret, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  verifyClientSecret(clientSecret: string, storedHash: string): boolean {
    try {
      const [salt, hash] = storedHash.split(":");
      if (!salt || !hash) {
        return false;
      }

      const attemptedHash = scryptSync(clientSecret, salt, 64).toString("hex");
      const hashBuffer = Buffer.from(hash, "hex");
      const attemptedBuffer = Buffer.from(attemptedHash, "hex");

      if (hashBuffer.length !== attemptedBuffer.length) {
        return false;
      }

      return timingSafeEqual(hashBuffer, attemptedBuffer);
    } catch (error) {
      logger.error({ error }, "Error verifying client secret");
      return false;
    }
  }

  issueToken(
    clientId: string,
    apiKeyId: string,
    scopes: string[]
  ): { accessToken: string; expiresIn: number; tokenType: string } {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.config.tokenTtlSeconds;

    const payload: TokenPayload = {
      sub: apiKeyId,
      client_id: clientId,
      scope: scopes.join(" "),
      iat: now,
      exp,
      iss: this.config.jwtIssuer,
      aud: this.config.jwtAudience,
    };

    const accessToken = jwt.sign(payload, this.config.jwtSecret, {
      algorithm: "HS256",
    });

    return {
      accessToken,
      expiresIn: this.config.tokenTtlSeconds,
      tokenType: "Bearer",
    };
  }

  verifyToken(token: string): TokenValidationResult {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ["HS256"],
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
      }) as TokenPayload;

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid token";
      return {
        valid: false,
        error: message,
      };
    }
  }

  extractScopesFromToken(payload: TokenPayload): string[] {
    return payload.scope ? payload.scope.split(" ").filter(Boolean) : [];
  }
}
