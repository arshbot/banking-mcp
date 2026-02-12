/**
 * Integration tests for Magnolia Auth endpoints.
 *
 * Tests the full auth flow: login, JWT validation, API key creation/listing/deletion.
 */

import { describe, it, expect } from "vitest";
import {
  rawRequest,
  getJwtToken,
  DEV_EMAIL,
  DEV_PASSWORD,
  DEV_API_KEY,
} from "./helpers.js";

describe("Auth: Login", () => {
  it("should login with valid credentials and return a JWT token", async () => {
    const { status, data } = await rawRequest("/auth/login", {
      method: "POST",
      body: { email: DEV_EMAIL, password: DEV_PASSWORD },
    });

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d).toHaveProperty("token");
    expect(typeof d.token).toBe("string");
    expect((d.token as string).length).toBeGreaterThan(10);
  });

  it("should reject login with wrong password", async () => {
    const { status } = await rawRequest("/auth/login", {
      method: "POST",
      body: { email: DEV_EMAIL, password: "wrong-password" },
    });

    // Could be 401 or 400 — just not 200
    expect(status).not.toBe(200);
  });

  it("should reject login with missing email", async () => {
    const { status } = await rawRequest("/auth/login", {
      method: "POST",
      body: { password: DEV_PASSWORD },
    });

    expect(status).not.toBe(200);
  });

  it("should reject login with missing password", async () => {
    const { status } = await rawRequest("/auth/login", {
      method: "POST",
      body: { email: DEV_EMAIL },
    });

    expect(status).not.toBe(200);
  });

  it("should reject login with empty body", async () => {
    const { status } = await rawRequest("/auth/login", {
      method: "POST",
      body: {},
    });

    expect(status).not.toBe(200);
  });

  it("should return 200 or 403 without User-Agent header (Bug #1)", async () => {
    // Bug #1: Cloudflare blocks requests without User-Agent
    const res = await fetch("https://api.dev.magfi.dev/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      }),
    });

    // Either 200 (bug fixed) or 403 (Bug #1 still present)
    expect([200, 403]).toContain(res.status);
  });
});

describe("Auth: API Key", () => {
  it("should create an API key with a valid JWT", async () => {
    const token = await getJwtToken();

    const { status, data } = await rawRequest("/auth/api-key", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    // API returns 201 Created for new API key
    expect(status).toBe(201);
    const d = data as Record<string, unknown>;
    expect(d).toHaveProperty("apiKey");
    expect(typeof d.apiKey).toBe("string");
    expect((d.apiKey as string).startsWith("magfi_")).toBe(true);
  });

  it("should list API keys with a valid JWT", async () => {
    const token = await getJwtToken();

    const { status, data } = await rawRequest("/auth/api-key", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Could be 200 with array or some other structure
    expect(status).toBe(200);
    // Should be an array or object with keys
    expect(data).toBeDefined();
  });

  it("should reject API key creation without auth", async () => {
    const { status } = await rawRequest("/auth/api-key", {
      method: "POST",
    });

    expect(status).not.toBe(200);
  });

  it("should reject API key creation with invalid token", async () => {
    const { status } = await rawRequest("/auth/api-key", {
      method: "POST",
      headers: { Authorization: "Bearer invalid-token-here" },
    });

    expect(status).not.toBe(200);
  });

  it("should accept API key for creating new API keys (auth endpoints accept API keys)", async () => {
    // API keys are accepted by /auth/* endpoints — this is confirmed behavior
    const { status, data } = await rawRequest("/auth/api-key", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEV_API_KEY}`,
      },
    });

    // API key auth works for /auth/* endpoints (returns 201)
    expect(status).toBe(201);
    const d = data as Record<string, unknown>;
    expect(d).toHaveProperty("apiKey");

    // Clean up: delete the key we just created
    if (d.id) {
      const token = await getJwtToken();
      await rawRequest(`/auth/api-key/${d.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  it("should delete an API key", async () => {
    const token = await getJwtToken();

    // First create one to delete
    const { data: createData } = await rawRequest("/auth/api-key", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const keyId = (createData as Record<string, unknown>).id as string;
    expect(keyId).toBeDefined();

    // Now delete it
    const { status } = await rawRequest(`/auth/api-key/${keyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(status).toBe(200);
  });
});

describe("Auth: Logout", () => {
  it("should logout successfully", async () => {
    const token = await getJwtToken();

    const { status } = await rawRequest("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    // 200 or 204 are both fine
    expect([200, 204]).toContain(status);
  });

  it("should still accept token after logout (tokens are stateless JWTs)", async () => {
    const token = await getJwtToken();

    // Logout
    const { status: logoutStatus } = await rawRequest("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 204]).toContain(logoutStatus);

    // Try to use the token — stateless JWTs remain valid until expiry
    const { status } = await rawRequest("/auth/api-key", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Token still works because JWTs are stateless (no server-side revocation)
    expect(status).toBe(200);
  });
});
