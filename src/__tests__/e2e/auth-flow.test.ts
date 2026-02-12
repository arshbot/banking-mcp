/**
 * E2E Test: Complete Authentication Flow
 *
 * Tests the full authentication lifecycle with real API calls:
 * 1. Login with credentials → JWT token
 * 2. Use JWT to create API key
 * 3. Use API key for subsequent requests
 * 4. List API keys
 * 5. Delete API key
 * 6. Logout
 * 7. Verify JWT still works (stateless tokens)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  rawRequest,
  getJwtToken,
  DEV_EMAIL,
  DEV_PASSWORD,
  DEV_API_KEY,
} from "../helpers.js";
import { cleanupTestResources, sleep } from "./test-utils.js";
import { MagnoliaClient } from "../../magnolia-client.js";

describe("E2E: Authentication Flow", () => {
  const createdApiKeyIds: string[] = [];
  let testJwtToken: string;
  let client: MagnoliaClient;

  beforeAll(async () => {
    client = new MagnoliaClient(
      DEV_API_KEY,
      "https://api.dev.magfi.dev"
    );
  });

  afterAll(async () => {
    // Cleanup any API keys we created
    for (const keyId of createdApiKeyIds) {
      try {
        const token = await getJwtToken();
        await rawRequest(`/auth/api-key/${keyId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.log(`Failed to cleanup API key ${keyId}:`, e);
      }
    }

    // Run general cleanup
    const cleanup = await cleanupTestResources(client);
    console.log("Cleanup results:", cleanup);
  });

  describe("Step 1: Login Flow", () => {
    it("should login with valid email/password and receive JWT token", async () => {
      const { status, data } = await rawRequest("/auth/login", {
        method: "POST",
        body: { email: DEV_EMAIL, password: DEV_PASSWORD },
      });

      expect(status).toBe(200);
      const response = data as Record<string, unknown>;
      expect(response).toHaveProperty("token");
      expect(typeof response.token).toBe("string");

      const token = response.token as string;
      expect(token.length).toBeGreaterThan(50); // JWTs are long
      expect(token.split(".").length).toBe(3); // JWT format: header.payload.signature

      // Save for later tests
      testJwtToken = token;
    });

    it("should reject login with invalid password", async () => {
      const { status, data } = await rawRequest("/auth/login", {
        method: "POST",
        body: { email: DEV_EMAIL, password: "wrong-password-123" },
      });

      expect(status).not.toBe(200);
      expect([400, 401, 403]).toContain(status);
    });

    it("should reject login with missing credentials", async () => {
      const { status: noEmail } = await rawRequest("/auth/login", {
        method: "POST",
        body: { password: DEV_PASSWORD },
      });
      expect(noEmail).not.toBe(200);

      const { status: noPassword } = await rawRequest("/auth/login", {
        method: "POST",
        body: { email: DEV_EMAIL },
      });
      expect(noPassword).not.toBe(200);
    });

    it("should include User-Agent header (Cloudflare requirement)", async () => {
      // This test verifies that our test helpers include User-Agent
      const { status } = await rawRequest("/auth/login", {
        method: "POST",
        body: { email: DEV_EMAIL, password: DEV_PASSWORD },
      });

      // Should succeed (not 403 from Cloudflare)
      expect(status).toBe(200);
    });
  });

  describe("Step 2: Create API Key with JWT", () => {
    it("should create API key using JWT token", async () => {
      const token = await getJwtToken();

      const { status, data } = await rawRequest("/auth/api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(status).toBe(201);
      const response = data as Record<string, unknown>;
      expect(response).toHaveProperty("apiKey");
      expect(response).toHaveProperty("id");

      const apiKey = response.apiKey as string;
      expect(apiKey.startsWith("magfi_")).toBe(true);
      expect(apiKey.length).toBeGreaterThan(30);

      // Track for cleanup
      createdApiKeyIds.push(response.id as string);
    });

    it("should reject API key creation without auth header", async () => {
      const { status } = await rawRequest("/auth/api-key", {
        method: "POST",
      });

      expect(status).not.toBe(201);
      expect([401, 403]).toContain(status);
    });

    it("should reject API key creation with invalid JWT", async () => {
      const { status } = await rawRequest("/auth/api-key", {
        method: "POST",
        headers: { Authorization: "Bearer invalid-jwt-token-here" },
      });

      expect(status).not.toBe(201);
      expect([401, 403]).toContain(status);
    });
  });

  describe("Step 3: Use API Key for Authenticated Requests", () => {
    let newApiKey: string;
    let newApiKeyId: string;

    beforeAll(async () => {
      // Create a fresh API key for these tests
      const token = await getJwtToken();
      const { data } = await rawRequest("/auth/api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const response = data as Record<string, unknown>;
      newApiKey = response.apiKey as string;
      newApiKeyId = response.id as string;
      createdApiKeyIds.push(newApiKeyId);
    });

    it("should use API key to access protected endpoints", async () => {
      // Test with /api/v2/enterprise (requires auth)
      const { status, data } = await rawRequest("/api/v2/enterprise", {
        method: "GET",
        headers: { Authorization: `Bearer ${newApiKey}` },
      });

      expect(status).toBe(200);
      expect(data).toBeDefined();
    });

    it("should use API key to create another API key", async () => {
      // API keys can create other API keys (confirmed behavior)
      const { status, data } = await rawRequest("/auth/api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${newApiKey}` },
      });

      expect(status).toBe(201);
      const response = data as Record<string, unknown>;
      expect(response).toHaveProperty("apiKey");

      // Cleanup the nested key
      createdApiKeyIds.push(response.id as string);
    });
  });

  describe("Step 4: List API Keys", () => {
    it("should list all API keys for the user", async () => {
      const token = await getJwtToken();

      const { status, data } = await rawRequest("/auth/api-key", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      const keys = data as Array<Record<string, unknown>>;
      expect(keys.length).toBeGreaterThan(0);

      // Verify at least one of our created keys is in the list
      const createdKeyInList = keys.some((k) =>
        createdApiKeyIds.includes(k.id as string)
      );
      expect(createdKeyInList).toBe(true);
    });

    it("should include key metadata in list", async () => {
      const token = await getJwtToken();
      const { data } = await rawRequest("/auth/api-key", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const keys = data as Array<Record<string, unknown>>;
      const firstKey = keys[0];

      expect(firstKey).toHaveProperty("id");
      // May have other fields like: name, created, lastUsed, etc.
    });
  });

  describe("Step 5: Delete API Key", () => {
    it("should delete an API key by ID", async () => {
      // Create a key to delete
      const token = await getJwtToken();
      const { data: createData } = await rawRequest("/auth/api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const keyId = (createData as Record<string, unknown>).id as string;

      // Delete it
      const { status } = await rawRequest(`/auth/api-key/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(status).toBe(200);
    });

    it("should no longer list deleted API key", async () => {
      // Create and immediately delete a key
      const token = await getJwtToken();
      const { data: createData } = await rawRequest("/auth/api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const keyId = (createData as Record<string, unknown>).id as string;

      await rawRequest(`/auth/api-key/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      // List keys and verify it's gone
      await sleep(1000); // Small delay for eventual consistency
      const { data: listData } = await rawRequest("/auth/api-key", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const keys = listData as Array<Record<string, unknown>>;
      const deletedKeyStillPresent = keys.some((k) => k.id === keyId);
      expect(deletedKeyStillPresent).toBe(false);
    });

    it("should not be able to use deleted API key", async () => {
      // Create a key
      const token = await getJwtToken();
      const { data: createData } = await rawRequest("/auth/api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const apiKey = (createData as Record<string, unknown>).apiKey as string;
      const keyId = (createData as Record<string, unknown>).id as string;

      // Verify it works
      const { status: beforeDelete } = await rawRequest("/api/v2/enterprise", {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      expect(beforeDelete).toBe(200);

      // Delete it
      await rawRequest(`/auth/api-key/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      // Try to use it (should fail)
      await sleep(1000); // Small delay for eventual consistency
      const { status: afterDelete } = await rawRequest("/api/v2/enterprise", {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(afterDelete).not.toBe(200);
      expect([401, 403]).toContain(afterDelete);
    });
  });

  describe("Step 6: Logout", () => {
    it("should logout successfully", async () => {
      const token = await getJwtToken();

      const { status } = await rawRequest("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect([200, 204]).toContain(status);
    });

    it("should still accept JWT after logout (stateless tokens)", async () => {
      // Get fresh token
      const token = await getJwtToken();

      // Logout
      const { status: logoutStatus } = await rawRequest("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect([200, 204]).toContain(logoutStatus);

      // Try to use the token again
      await sleep(500);
      const { status: afterLogout } = await rawRequest("/auth/api-key", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      // Tokens are stateless JWTs - they remain valid until expiry
      // Server doesn't revoke them on logout
      expect(afterLogout).toBe(200);
    });
  });

  describe("Step 7: Concurrent Authentication", () => {
    it("should handle multiple simultaneous logins", async () => {
      // Create 5 login requests in parallel
      const loginPromises = Array.from({ length: 5 }, () =>
        rawRequest("/auth/login", {
          method: "POST",
          body: { email: DEV_EMAIL, password: DEV_PASSWORD },
        })
      );

      const results = await Promise.all(loginPromises);

      // All should succeed
      results.forEach((result) => {
        expect(result.status).toBe(200);
        const data = result.data as Record<string, unknown>;
        expect(data).toHaveProperty("token");
      });

      // All tokens should be different
      const tokens = results.map(
        (r) => (r.data as Record<string, unknown>).token as string
      );
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(5);
    });

    it("should handle multiple simultaneous API key creations", async () => {
      const token = await getJwtToken();

      // Create 5 API keys in parallel
      const createPromises = Array.from({ length: 5 }, () =>
        rawRequest("/auth/api-key", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
      );

      const results = await Promise.all(createPromises);

      // All should succeed
      results.forEach((result) => {
        expect(result.status).toBe(201);
        const data = result.data as Record<string, unknown>;
        expect(data).toHaveProperty("apiKey");

        // Track for cleanup
        createdApiKeyIds.push(data.id as string);
      });

      // All API keys should be unique
      const apiKeys = results.map(
        (r) => (r.data as Record<string, unknown>).apiKey as string
      );
      const uniqueKeys = new Set(apiKeys);
      expect(uniqueKeys.size).toBe(5);
    });
  });

  describe("Step 8: Error Conditions & Edge Cases", () => {
    it("should handle malformed JSON in login request", async () => {
      const res = await fetch("https://api.dev.magfi.dev/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ClawBot-Test/1.0",
        },
        body: "{ invalid json here }",
      });

      expect(res.status).not.toBe(200);
      expect([400, 422]).toContain(res.status);
    });

    it("should handle empty authorization header", async () => {
      const { status } = await rawRequest("/auth/api-key", {
        method: "POST",
        headers: { Authorization: "" },
      });

      expect(status).not.toBe(201);
      expect([401, 403]).toContain(status);
    });

    it("should handle non-existent API key deletion", async () => {
      const token = await getJwtToken();

      const { status } = await rawRequest(
        "/auth/api-key/nonexistent-key-id-123",
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Should be 404 or 400
      expect(status).not.toBe(200);
      expect([400, 404]).toContain(status);
    });
  });
});
