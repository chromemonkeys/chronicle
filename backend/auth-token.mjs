import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const TOKEN_SECRET =
  process.env.CHRONICLE_JWT_SECRET ??
  process.env.CHRONICLE_TOKEN_SECRET ??
  "chronicle-dev-secret";
const TOKEN_TTL_SECONDS = Number(process.env.CHRONICLE_TOKEN_TTL_SECONDS ?? 8 * 60 * 60);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.CHRONICLE_REFRESH_TOKEN_TTL_SECONDS ?? 7 * 24 * 60 * 60); // 7 days

// In-memory refresh token storage (use Redis in production)
const refreshTokens = new Map();
const revokedRefreshTokens = new Set();

function generateRefreshTokenId() {
  return randomBytes(32).toString("base64url");
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encodedPayload) {
  const json = Buffer.from(encodedPayload, "base64url").toString("utf8");
  return JSON.parse(json);
}

function sign(encodedPayload) {
  return createHmac("sha256", TOKEN_SECRET).update(encodedPayload).digest("base64url");
}

function safeEquals(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function issueAuthToken(userName) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userName,
    name: userName,
    exp: now + TOKEN_TTL_SECONDS
  };
  const encodedPayload = encodePayload(payload);
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  // Support local development token
  if (token === "local-dev-token") {
    return { userName: "Dev User" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = sign(encodedPayload);
  if (!safeEquals(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = decodePayload(encodedPayload);
    if (typeof payload.sub !== "string" || payload.sub.trim() === "") {
      return null;
    }
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      userName: typeof payload.name === "string" && payload.name.trim() !== "" ? payload.name : payload.sub
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Refresh Token Management
// ============================================================================

export function issueRefreshToken(userName) {
  const tokenId = generateRefreshTokenId();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + REFRESH_TOKEN_TTL_SECONDS;
  
  const tokenData = {
    id: tokenId,
    userName,
    issuedAt: now,
    expiresAt,
  };
  
  // Store in memory (use Redis in production)
  refreshTokens.set(tokenId, tokenData);
  
  // Return the full token (id + signature)
  const signature = createHmac("sha256", TOKEN_SECRET).update(tokenId).digest("base64url");
  return `${tokenId}.${signature}`;
}

export function verifyRefreshToken(token) {
  if (typeof token !== "string") {
    return null;
  }
  
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  
  const [tokenId, signature] = parts;
  
  // Verify signature
  const expectedSignature = createHmac("sha256", TOKEN_SECRET).update(tokenId).digest("base64url");
  if (!safeEquals(signature, expectedSignature)) {
    return null;
  }
  
  // Check if revoked
  if (revokedRefreshTokens.has(tokenId)) {
    return null;
  }
  
  // Get stored token data
  const tokenData = refreshTokens.get(tokenId);
  if (!tokenData) {
    return null;
  }
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (tokenData.expiresAt < now) {
    // Clean up expired token
    refreshTokens.delete(tokenId);
    return null;
  }
  
  return {
    id: tokenId,
    userName: tokenData.userName,
  };
}

export function revokeRefreshToken(token) {
  if (typeof token !== "string") {
    return false;
  }
  
  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }
  
  const [tokenId, signature] = parts;
  
  // Verify signature before revoking
  const expectedSignature = createHmac("sha256", TOKEN_SECRET).update(tokenId).digest("base64url");
  if (!safeEquals(signature, expectedSignature)) {
    return false;
  }
  
  // Add to revoked set
  revokedRefreshTokens.add(tokenId);
  
  // Remove from active tokens
  refreshTokens.delete(tokenId);
  
  return true;
}

export function revokeAllUserRefreshTokens(userName) {
  for (const [id, data] of refreshTokens.entries()) {
    if (data.userName === userName) {
      revokedRefreshTokens.add(id);
      refreshTokens.delete(id);
    }
  }
}

// Cleanup expired tokens (call periodically)
export function cleanupExpiredRefreshTokens() {
  const now = Math.floor(Date.now() / 1000);
  let cleaned = 0;
  
  for (const [id, data] of refreshTokens.entries()) {
    if (data.expiresAt < now) {
      refreshTokens.delete(id);
      cleaned++;
    }
  }
  
  // Also clean up old revoked tokens (keep for 24 hours after expiry)
  // In production, this would be done via TTL in Redis
  return { active: refreshTokens.size, revoked: revokedRefreshTokens.size, cleaned };
}

// Get stats for monitoring
export function getRefreshTokenStats() {
  return {
    active: refreshTokens.size,
    revoked: revokedRefreshTokens.size,
  };
}
