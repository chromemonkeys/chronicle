/**
 * Refresh Token Revocation Tests
 * 
 * Tests for P1-AUTH-002 - Refresh token revocation behavior
 */

import { describe, it, expect, beforeEach } from "vitest";

// Import the module - using dynamic import for ESM
// @ts-expect-error - backend/auth-token.mjs has no TypeScript declarations
const authModule = await import("../../backend/auth-token.mjs");

const {
  issueAuthToken,
  verifyAuthToken,
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  cleanupExpiredRefreshTokens,
  getRefreshTokenStats,
} = authModule;

describe("Refresh Token Management", () => {
  beforeEach(() => {
    // Clean up before each test
    cleanupExpiredRefreshTokens();
  });

  describe("Token Issuance", () => {
    it("should issue a refresh token on login", () => {
      const userName = "TestUser";
      const refreshToken = issueRefreshToken(userName);
      
      expect(refreshToken).toBeDefined();
      expect(typeof refreshToken).toBe("string");
      expect(refreshToken).toContain("."); // Has signature
    });

    it("should verify a valid refresh token", () => {
      const userName = "TestUser";
      const refreshToken = issueRefreshToken(userName);
      
      const result = verifyRefreshToken(refreshToken);
      
      expect(result).not.toBeNull();
      expect(result?.userName).toBe(userName);
      expect(result?.id).toBeDefined();
    });

    it("should track issued refresh tokens in stats", () => {
      const before = getRefreshTokenStats();
      
      issueRefreshToken("User1");
      
      const after = getRefreshTokenStats();
      expect(after.active).toBeGreaterThan(before.active);
    });
  });

  describe("Token Verification", () => {
    it("should reject an invalid refresh token", () => {
      const result = verifyRefreshToken("invalid.token");
      expect(result).toBeNull();
    });

    it("should reject a malformed refresh token", () => {
      const result = verifyRefreshToken("not-a-valid-token");
      expect(result).toBeNull();
    });

    it("should reject an empty refresh token", () => {
      const result = verifyRefreshToken("");
      expect(result).toBeNull();
    });

    it("should reject a tampered refresh token", () => {
      const userName = "TestUser";
      const refreshToken = issueRefreshToken(userName);
      
      // Tamper with the token
      const tampered = refreshToken.slice(0, -5) + "XXXXX";
      
      const result = verifyRefreshToken(tampered);
      expect(result).toBeNull();
    });
  });

  describe("Token Revocation", () => {
    it("should revoke a refresh token on logout", () => {
      const userName = "TestUser";
      const refreshToken = issueRefreshToken(userName);
      
      // Verify it works before revocation
      expect(verifyRefreshToken(refreshToken)).not.toBeNull();
      
      // Revoke it
      const revoked = revokeRefreshToken(refreshToken);
      expect(revoked).toBe(true);
      
      // Verify it's now invalid
      expect(verifyRefreshToken(refreshToken)).toBeNull();
    });

    it("should track revoked tokens in stats", () => {
      const refreshToken = issueRefreshToken("TestUser");
      
      const before = getRefreshTokenStats();
      revokeRefreshToken(refreshToken);
      const after = getRefreshTokenStats();
      
      expect(after.revoked).toBeGreaterThan(before.revoked);
    });

    it("should reject revoking an invalid token", () => {
      const result = revokeRefreshToken("invalid.token");
      expect(result).toBe(false);
    });

    it("should reject revoking a malformed token", () => {
      const result = revokeRefreshToken("not.valid");
      expect(result).toBe(false);
    });

    it("should revoke all tokens for a user", () => {
      const userName = "TestUser";
      const token1 = issueRefreshToken(userName);
      const token2 = issueRefreshToken(userName);
      const otherToken = issueRefreshToken("OtherUser");
      
      // Verify all work
      expect(verifyRefreshToken(token1)).not.toBeNull();
      expect(verifyRefreshToken(token2)).not.toBeNull();
      expect(verifyRefreshToken(otherToken)).not.toBeNull();
      
      // Revoke all for TestUser
      revokeAllUserRefreshTokens(userName);
      
      // TestUser tokens should be revoked
      expect(verifyRefreshToken(token1)).toBeNull();
      expect(verifyRefreshToken(token2)).toBeNull();
      
      // OtherUser token should still work
      expect(verifyRefreshToken(otherToken)).not.toBeNull();
    });
  });

  describe("Token Rotation", () => {
    it("should issue new tokens on refresh and revoke old refresh token", () => {
      const userName = "TestUser";
      const oldRefreshToken = issueRefreshToken(userName);
      
      // Simulate refresh: verify old, issue new, revoke old
      const tokenData = verifyRefreshToken(oldRefreshToken);
      expect(tokenData).not.toBeNull();
      
      const newToken = issueAuthToken(userName);
      const newRefreshToken = issueRefreshToken(userName);
      revokeRefreshToken(oldRefreshToken);
      
      // Old token should be revoked
      expect(verifyRefreshToken(oldRefreshToken)).toBeNull();
      
      // New token should work
      expect(verifyRefreshToken(newRefreshToken)).not.toBeNull();
      expect(newToken).toBeDefined();
    });
  });

  describe("Token Expiration and Cleanup", () => {
    it("should clean up expired tokens", () => {
      // Issue a token
      issueRefreshToken("User1");
      
      // Cleanup (none expired yet in test)
      const result = cleanupExpiredRefreshTokens();
      
      // Should return consistent stats
      expect(result.active).toBeGreaterThanOrEqual(0);
      expect(result.cleaned).toBe(0); // None expired in test
    });

    it("should return correct stats", () => {
      const before = getRefreshTokenStats();
      
      issueRefreshToken("User1");
      
      const after = getRefreshTokenStats();
      expect(after.active).toBeGreaterThanOrEqual(before.active);
      expect(after.revoked).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Access Token Revocation", () => {
    it("should issue and verify access tokens", () => {
      const userName = "TestUser";
      const token = issueAuthToken(userName);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      
      const payload = verifyAuthToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.userName).toBe(userName);
    });

    it("should reject an invalid access token", () => {
      const result = verifyAuthToken("invalid.token.here");
      expect(result).toBeNull();
    });

    it("should reject an empty access token", () => {
      const result = verifyAuthToken("");
      expect(result).toBeNull();
    });
  });
});
