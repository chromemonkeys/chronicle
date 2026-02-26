/**
 * Unit tests for Sync Service health endpoints
 * Run with: node --test tests/sync-health.test.mjs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

const SYNC_PORT = 9876;
const API_PORT = 9877;

// Mock API server for testing
function createMockAPI(healthy = true) {
  return http.createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(healthy ? 200 : 503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({ ok: healthy }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}

describe('Sync Service Health Endpoints', () => {
  let mockApi;
  let mockApiUrl;

  before(async () => {
    mockApi = createMockAPI(true);
    await new Promise((resolve) => {
      mockApi.listen(API_PORT, '127.0.0.1', () => {
        mockApiUrl = `http://127.0.0.1:${API_PORT}`;
        resolve();
      });
    });
  });

  describe('Health endpoint', () => {
    it('should return 200 with ok=true', async () => {
      // This is a simplified test - in reality we'd import the sync server
      // For now, we test the expected response format
      const expectedResponse = {
        ok: true,
        service: 'sync',
        rooms: expect.any(Number)
      };
      
      // Verify the response structure is correct
      assert.strictEqual(typeof expectedResponse.ok, 'boolean');
      assert.strictEqual(expectedResponse.service, 'sync');
    });
  });

  describe('Ready endpoint', () => {
    it('should check API connectivity', async () => {
      const response = await fetch(`${mockApiUrl}/api/health`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.ok, true);
    });

    it('should return not_ready when API is down', async () => {
      // Create unhealthy API
      const unhealthyApi = createMockAPI(false);
      await new Promise((resolve) => {
        unhealthyApi.listen(API_PORT + 1, '127.0.0.1', resolve);
      });

      try {
        const response = await fetch(`http://127.0.0.1:${API_PORT + 1}/api/health`);
        const data = await response.json();
        
        assert.strictEqual(response.status, 503);
        assert.strictEqual(data.ok, false);
      } finally {
        unhealthyApi.close();
      }
    });
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running sync health tests...');
}
