import { describe, it, expect } from "vitest";
import {
  ApiError,
  isApiError,
  codeFromStatus,
  parseApiErrorCode,
  isInternalRouteError,
  mapErrorMessage,
} from "./client";
import type { ApiErrorCode } from "./client";

// ============================================================================
// codeFromStatus
// ============================================================================

describe("codeFromStatus", () => {
  it("returns AUTH_REQUIRED for 401", () => {
    expect(codeFromStatus(401)).toBe("AUTH_REQUIRED");
  });

  it("returns FORBIDDEN for 403", () => {
    expect(codeFromStatus(403)).toBe("FORBIDDEN");
  });

  it("returns NOT_FOUND for 404", () => {
    expect(codeFromStatus(404)).toBe("NOT_FOUND");
  });

  it("returns VALIDATION_ERROR for 422", () => {
    expect(codeFromStatus(422)).toBe("VALIDATION_ERROR");
  });

  it("returns SERVER_ERROR for 500", () => {
    expect(codeFromStatus(500)).toBe("SERVER_ERROR");
  });

  it("returns SERVER_ERROR for 502", () => {
    expect(codeFromStatus(502)).toBe("SERVER_ERROR");
  });

  it("returns SERVER_ERROR for 503", () => {
    expect(codeFromStatus(503)).toBe("SERVER_ERROR");
  });

  it("returns REQUEST_FAILED for 400", () => {
    expect(codeFromStatus(400)).toBe("REQUEST_FAILED");
  });

  it("returns REQUEST_FAILED for 409", () => {
    expect(codeFromStatus(409)).toBe("REQUEST_FAILED");
  });

  it("returns REQUEST_FAILED for 429", () => {
    expect(codeFromStatus(429)).toBe("REQUEST_FAILED");
  });
});

// ============================================================================
// parseApiErrorCode
// ============================================================================

describe("parseApiErrorCode", () => {
  const validCodes: ApiErrorCode[] = [
    "AUTH_REQUIRED",
    "FORBIDDEN",
    "NOT_FOUND",
    "VALIDATION_ERROR",
    "APPROVAL_ORDER_BLOCKED",
    "MERGE_GATE_BLOCKED",
    "INVALID_BODY",
    "NETWORK_ERROR",
    "SERVER_ERROR",
    "REQUEST_FAILED",
  ];

  for (const code of validCodes) {
    it(`returns "${code}" for valid code string`, () => {
      expect(parseApiErrorCode(code)).toBe(code);
    });
  }

  it("returns null for unknown string", () => {
    expect(parseApiErrorCode("UNKNOWN_CODE")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseApiErrorCode("")).toBeNull();
  });

  it("returns null for number", () => {
    expect(parseApiErrorCode(42)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseApiErrorCode(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseApiErrorCode(undefined)).toBeNull();
  });

  it("returns null for object", () => {
    expect(parseApiErrorCode({ code: "AUTH_REQUIRED" })).toBeNull();
  });

  it("does not accept EXPORT_ERROR (not in switch)", () => {
    expect(parseApiErrorCode("EXPORT_ERROR")).toBeNull();
  });
});

// ============================================================================
// isApiError
// ============================================================================

describe("isApiError", () => {
  it("returns true for ApiError instance", () => {
    const err = new ApiError("test", "NOT_FOUND", 404);
    expect(isApiError(err)).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isApiError(new Error("test"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isApiError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isApiError(undefined)).toBe(false);
  });

  it("returns false for plain object with matching shape", () => {
    expect(
      isApiError({ name: "ApiError", code: "NOT_FOUND", status: 404, message: "test" })
    ).toBe(false);
  });

  it("returns false for string", () => {
    expect(isApiError("ApiError")).toBe(false);
  });
});

// ============================================================================
// ApiError class
// ============================================================================

describe("ApiError", () => {
  it("sets name to 'ApiError'", () => {
    const err = new ApiError("msg", "NOT_FOUND");
    expect(err.name).toBe("ApiError");
  });

  it("sets message, code, status, details", () => {
    const err = new ApiError("not found", "NOT_FOUND", 404, { id: "123" });
    expect(err.message).toBe("not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(err.details).toEqual({ id: "123" });
  });

  it("defaults status to null", () => {
    const err = new ApiError("msg", "SERVER_ERROR");
    expect(err.status).toBeNull();
  });

  it("defaults details to null", () => {
    const err = new ApiError("msg", "SERVER_ERROR", 500);
    expect(err.details).toBeNull();
  });

  it("is an instance of Error", () => {
    const err = new ApiError("msg", "FORBIDDEN");
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of ApiError", () => {
    const err = new ApiError("msg", "FORBIDDEN");
    expect(err).toBeInstanceOf(ApiError);
  });
});

// ============================================================================
// isInternalRouteError
// ============================================================================

describe("isInternalRouteError", () => {
  it("returns true for 'Unhandled mocked API route' message", () => {
    expect(isInternalRouteError("Unhandled mocked API route: GET /foo")).toBe(true);
  });

  it("is case insensitive for 'unhandled mocked api route'", () => {
    expect(isInternalRouteError("unhandled mocked api route")).toBe(true);
  });

  it("returns true for messages containing '/api/'", () => {
    expect(isInternalRouteError("Error at /api/documents")).toBe(true);
  });

  it("returns false for generic error messages", () => {
    expect(isInternalRouteError("Something went wrong")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isInternalRouteError("")).toBe(false);
  });
});

// ============================================================================
// mapErrorMessage
// ============================================================================

describe("mapErrorMessage", () => {
  it("maps AUTH_REQUIRED to session expired message", () => {
    expect(mapErrorMessage("AUTH_REQUIRED", "fallback", "/api/any")).toBe(
      "Your session expired. Please sign in again."
    );
  });

  it("maps NETWORK_ERROR to backend unreachable message", () => {
    expect(mapErrorMessage("NETWORK_ERROR", "fallback", "/api/any")).toBe(
      "Cannot reach Chronicle API. Check that backend is running."
    );
  });

  it("maps SERVER_ERROR to API unavailable message", () => {
    expect(mapErrorMessage("SERVER_ERROR", "fallback", "/api/any")).toBe(
      "Chronicle API is unavailable right now. Please retry."
    );
  });

  it("maps APPROVAL_ORDER_BLOCKED to approval message", () => {
    expect(mapErrorMessage("APPROVAL_ORDER_BLOCKED", "fallback", "/api/any")).toBe(
      "Approval is blocked by required prior stages."
    );
  });

  it("maps MERGE_GATE_BLOCKED to merge message", () => {
    expect(mapErrorMessage("MERGE_GATE_BLOCKED", "fallback", "/api/any")).toBe(
      "Merge is blocked until approvals and thread resolution are complete."
    );
  });

  it("returns space-specific message for internal route error on /api/spaces", () => {
    expect(
      mapErrorMessage("REQUEST_FAILED", "Unhandled mocked API route", "/api/spaces")
    ).toBe("Could not create space. Please retry or cancel.");
  });

  it("returns generic retry for internal route errors on other paths", () => {
    expect(
      mapErrorMessage("REQUEST_FAILED", "Unhandled mocked API route", "/api/documents")
    ).toBe("Request failed. Please retry.");
  });

  it("returns fallback for unknown codes without internal route pattern", () => {
    expect(mapErrorMessage("NOT_FOUND", "Document not found", "/api/docs/1")).toBe(
      "Document not found"
    );
  });

  it("returns fallback for FORBIDDEN code", () => {
    expect(mapErrorMessage("FORBIDDEN", "Access denied", "/api/docs")).toBe(
      "Access denied"
    );
  });
});
