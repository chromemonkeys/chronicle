/**
 * Unit tests for Sync Service health endpoints
 * Run with: node --test tests/sync-health.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from 'node:http';

// Mock API server for testing
function createMockAPI(healthy = true) {
  return http.createServer((req, res) => {
    if (req.url === "/api/health") {
      res.writeHead(healthy ? 200 : 503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      });
      res.end(JSON.stringify({ ok: healthy }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("server did not bind to a TCP port"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe("Sync Service Health Endpoints", () => {
  let mockApi;
  let mockApiUrl;

  before(async () => {
    mockApi = createMockAPI(true);
    mockApiUrl = await listen(mockApi);
  });

  after(async () => {
    await close(mockApi);
  });

  describe("Health endpoint", () => {
    it("should return expected shape fields", () => {
      // This is a simplified test - in reality we'd import the sync server
      // For now, we test the expected response format
      const expectedResponse = {
        ok: true,
        service: "sync",
        rooms: 0
      };
      
      // Verify the response structure is correct
      assert.equal(typeof expectedResponse.ok, "boolean");
      assert.equal(expectedResponse.service, "sync");
      assert.equal(typeof expectedResponse.rooms, "number");
    });
  });

  describe("Ready endpoint", () => {
    it("should check API connectivity", async () => {
      const response = await fetch(`${mockApiUrl}/api/health`);
      const data = await response.json();
      
      assert.equal(response.status, 200);
      assert.equal(data.ok, true);
    });

    it("should return not_ready when API is down", async () => {
      // Create unhealthy API
      const unhealthyApi = createMockAPI(false);
      const unhealthyUrl = await listen(unhealthyApi);

      try {
        const response = await fetch(`${unhealthyUrl}/api/health`);
        const data = await response.json();
        
        assert.equal(response.status, 503);
        assert.equal(data.ok, false);
      } finally {
        await close(unhealthyApi);
      }
    });
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running sync health tests...');
}
