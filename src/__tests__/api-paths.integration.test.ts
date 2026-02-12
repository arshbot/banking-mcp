/**
 * API Path Correctness Tests
 *
 * Verifies that:
 * 1. All documented API paths return a response (not 404) — path exists
 * 2. The old /trade/* paths are confirmed 404 (not in Magnolia API)
 * 3. Endpoints return expected statuses now that auth bugs #658/#660 are fixed
 */

import { describe, it, expect } from "vitest";
import { rawRequest, getJwtToken, DEV_API_KEY } from "./helpers.js";

// ============================================================
// Test DOCUMENTED paths with API key auth
// Auth bugs #658/#660 are now fixed — endpoints accept API key/JWT
// ============================================================

describe("Documented API Paths — API Key Auth", () => {
  const authHeader = { Authorization: `Bearer ${DEV_API_KEY}` };

  // --- Bank Accounts ---

  it("GET /api/v2/bankaccounts — returns 200 with bank accounts list", async () => {
    const { status, data } = await rawRequest("/api/v2/bankaccounts", {
      headers: authHeader,
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("bankAccounts");
  });

  it("GET /api/v2/bankaccounts/list — treated as bank account ID lookup, returns 404", async () => {
    const { status } = await rawRequest(
      "/api/v2/bankaccounts/list",
      { headers: authHeader }
    );
    // "list" is not a valid bank account ID — server treats it as a lookup
    expect(status).toBe(404);
  });

  // --- Wallets ---

  it("GET /api/v2/btc/wallet — returns 400 CoinUnsupported on testnet (not 404)", async () => {
    const { status, data } = await rawRequest("/api/v2/btc/wallet", {
      headers: authHeader,
    });
    // btc is not supported on testnet — returns 400, not 404
    expect(status).toBe(400);
    expect((data as Record<string, unknown>).name).toBe("CoinUnsupported");
  });

  it("GET /api/v2/eth/wallet — returns 400 CoinUnsupported on testnet (not 404)", async () => {
    const { status, data } = await rawRequest("/api/v2/eth/wallet", {
      headers: authHeader,
    });
    expect(status).toBe(400);
    expect((data as Record<string, unknown>).name).toBe("CoinUnsupported");
  });

  it("GET /api/v2/tbtc/wallet — returns 200 with wallet list", async () => {
    const { status, data } = await rawRequest("/api/v2/tbtc/wallet", {
      headers: authHeader,
    });
    expect(status).toBe(200);
    const wallets = data as { wallets: unknown[]; coin: string };
    expect(wallets.coin).toBe("tbtc");
    expect(Array.isArray(wallets.wallets)).toBe(true);
  });

  // --- Enterprise ---

  it("GET /api/v2/enterprise — returns 200 with enterprise data", async () => {
    const { status, data } = await rawRequest("/api/v2/enterprise", {
      headers: authHeader,
    });
    expect(status).toBe(200);
    const enterprise = data as Record<string, unknown>;
    expect(enterprise).toHaveProperty("id");
    expect(enterprise).toHaveProperty("name");
  });

  // --- Deposits ---

  it("GET /api/v2/bankaccounts/deposit/info — returns 400 (requires query params)", async () => {
    const { status } = await rawRequest(
      "/api/v2/bankaccounts/deposit/info",
      { headers: authHeader }
    );
    // Needs currency and goAccountId query params
    expect(status).toBe(400);
  });
});

// ============================================================
// Test DOCUMENTED paths with JWT auth
// Auth bugs #658 fixed — JWT now accepted by all services
// ============================================================

describe("Documented API Paths — JWT Auth", () => {
  let token: string;

  it("should login first", async () => {
    token = await getJwtToken();
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(10);
  });

  it("GET /api/v2/bankaccounts — returns 200 with JWT", async () => {
    const { status, data } = await rawRequest("/api/v2/bankaccounts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("bankAccounts");
  });

  it("GET /api/v2/enterprise — returns 200 with JWT", async () => {
    const { status, data } = await rawRequest("/api/v2/enterprise", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(status).toBe(200);
    const enterprise = data as Record<string, unknown>;
    expect(enterprise).toHaveProperty("id");
  });

  it("GET /api/v2/btc/wallet — returns 400 CoinUnsupported with JWT", async () => {
    const { status, data } = await rawRequest("/api/v2/btc/wallet", {
      headers: { Authorization: `Bearer ${token}` },
    });
    // btc is unsupported on testnet — 400, not auth error
    expect(status).toBe(400);
    expect((data as Record<string, unknown>).name).toBe("CoinUnsupported");
  });

  it("GET /api/evs/v1/identity — returns 200 with JWT", async () => {
    const { status, data } = await rawRequest("/api/evs/v1/identity", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("identities");
  });
});

// ============================================================
// Verify /trade/* paths 404 (these are NOT real Magnolia endpoints)
// These tests confirm the old fabricated paths are invalid
// ============================================================

describe("Undocumented /trade/* paths — confirm 404", () => {
  const authHeader = { Authorization: `Bearer ${DEV_API_KEY}` };

  const tradePaths = [
    { path: "/trade/accounts/balances", method: "GET" },
    { path: "/trade/accounts", method: "GET" },
    { path: "/trade/wallets", method: "GET" },
    { path: "/trade/transfers", method: "GET" },
    { path: "/trade/transactions", method: "GET" },
    { path: "/trade/bank-accounts", method: "GET" },
    { path: "/trade/orders", method: "GET" },
  ];

  for (const { path, method } of tradePaths) {
    it(`${method} ${path} — should return 404`, async () => {
      const { status } = await rawRequest(path, {
        method,
        headers: authHeader,
      });
      expect(status).toBe(404);
    });
  }

  it("POST /trade/quotes — should return 404", async () => {
    const { status } = await rawRequest("/trade/quotes", {
      method: "POST",
      headers: authHeader,
      body: {
        fromCurrency: "USD",
        toCurrency: "BTC",
        amount: "100",
        side: "buy",
      },
    });
    expect(status).toBe(404);
  });
});

// ============================================================
// Test the PRIME trading paths (documented)
// Auth works but returns 403 Forbidden (dev account lacks trading permissions)
// ============================================================

describe("Prime Trading Paths (documented)", () => {
  const authHeader = { Authorization: `Bearer ${DEV_API_KEY}` };

  it("GET /api/prime/trading/v1/accounts/{id}/balances — returns 403 Forbidden", async () => {
    const { status } = await rawRequest(
      "/api/prime/trading/v1/accounts/test-account-id/balances",
      { headers: authHeader }
    );
    // Path exists, auth works, but dev account lacks trading permissions
    expect(status).not.toBe(404);
    expect(status).toBe(403);
  });

  it("GET /api/prime/trading/v1/accounts/{id}/products — returns 403 Forbidden", async () => {
    const { status } = await rawRequest(
      "/api/prime/trading/v1/accounts/test-account-id/products",
      { headers: authHeader }
    );
    expect(status).not.toBe(404);
    expect(status).toBe(403);
  });

  it("GET /api/prime/trading/v1/accounts/{id}/orders — returns 403 Forbidden", async () => {
    const { status } = await rawRequest(
      "/api/prime/trading/v1/accounts/test-account-id/orders",
      { headers: authHeader }
    );
    expect(status).not.toBe(404);
    expect(status).toBe(403);
  });
});

// ============================================================
// ACH / Fiat paths
// ============================================================

describe("Fiat/ACH Paths", () => {
  const authHeader = { Authorization: `Bearer ${DEV_API_KEY}` };

  it("GET /api/fiat/v1/transaction/ach-debit/agreement — returns 400 (requires params)", async () => {
    const { status } = await rawRequest(
      "/api/fiat/v1/transaction/ach-debit/agreement",
      { headers: authHeader }
    );
    // Auth works now, but endpoint requires amount and bankId params
    expect(status).not.toBe(404);
    expect(status).toBe(400);
  });
});

// ============================================================
// Routing number lookup
// ============================================================

describe("Utility Endpoints", () => {
  const authHeader = { Authorization: `Bearer ${DEV_API_KEY}` };

  it("GET /api/tradfi/v1/banks/ach/021000021 — returns 404 (routing number not found)", async () => {
    const { status } = await rawRequest(
      "/api/tradfi/v1/banks/ach/021000021",
      { headers: authHeader }
    );
    // Auth works, but this specific routing number is not in the dev database
    expect(status).toBe(404);
  });

  it("GET /api/tradfi/v1/banks/wire/021000021 — returns 404 (routing number not found)", async () => {
    const { status } = await rawRequest(
      "/api/tradfi/v1/banks/wire/021000021",
      { headers: authHeader }
    );
    expect(status).toBe(404);
  });
});
