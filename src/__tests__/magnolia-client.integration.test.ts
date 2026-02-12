/**
 * Integration tests for the MagnoliaClient class (v2).
 *
 * Tests the correct API paths from docs.magnolia.financial.
 * Verifies path construction, error formatting, and auth behavior.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { MagnoliaClient } from "../magnolia-client.js";
import { DEV_API_KEY, DEV_API_URL, rawRequest, getJwtToken } from "./helpers.js";

let client: MagnoliaClient;

beforeAll(() => {
  client = new MagnoliaClient(DEV_API_KEY, DEV_API_URL);
});

// ============================================================
// AUTH — /auth/* endpoints (these work with API key auth)
// ============================================================

describe("MagnoliaClient v2: Auth endpoints", () => {
  it("listApiKeys — should return array of API keys", async () => {
    const result = await client.listApiKeys();
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    const keys = result as Array<Record<string, unknown>>;
    expect(keys.length).toBeGreaterThan(0);
    expect(keys[0]).toHaveProperty("id");
    expect(keys[0]).toHaveProperty("createdAt");
  });
});

// ============================================================
// ENTERPRISE — /api/v2/enterprise
// ============================================================

describe("MagnoliaClient v2: Enterprise", () => {
  it("getEnterprises — should return enterprise data", async () => {
    const result = await client.getEnterprises();
    expect(result).toBeDefined();
    // Dev environment returns a single enterprise object
    const enterprise = result as Record<string, unknown>;
    expect(enterprise).toHaveProperty("id");
    expect(enterprise).toHaveProperty("name");
    expect(enterprise).toHaveProperty("kycState");
  });
});

// ============================================================
// CRYPTO WALLETS — /api/v2/{coin}/wallet
// ============================================================

describe("MagnoliaClient v2: Crypto Wallets", () => {
  it("listWallets(btc) — should return 400 CoinUnsupported on testnet", async () => {
    try {
      await client.listWallets("btc");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      // btc is not supported on testnet dev env — 400 not 404
      expect(msg).toContain("400");
      expect(msg).toContain("/api/v2/btc/wallet");
      expect(msg).not.toContain("404");
    }
  });

  it("listWallets(tbtc) — should return wallet list for testnet BTC", async () => {
    const result = await client.listWallets("tbtc");
    expect(result).toBeDefined();
    const data = result as { wallets: unknown[]; coin: string };
    expect(data.coin).toBe("tbtc");
    expect(Array.isArray(data.wallets)).toBe(true);
  });

  it("getWallet — should return error containing correct path", async () => {
    try {
      await client.getWallet("btc", "00000000-0000-0000-0000-000000000000");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/btc/wallet/00000000-0000-0000-0000-000000000000");
    }
  });

  it("listWalletTransfers — should construct correct path with wallet ID", async () => {
    try {
      await client.listWalletTransfers("btc", "test-wallet-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/btc/wallet/test-wallet-id/transfer");
    }
  });

  it("generateAddress — should construct correct path", async () => {
    try {
      await client.generateAddress("btc", "test-wallet-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/btc/wallet/test-wallet-id/address");
      expect(msg).toContain("POST");
    }
  });

  it("listAddresses — should construct correct path", async () => {
    try {
      await client.listAddresses("btc", "test-wallet-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/btc/wallet/test-wallet-id/addresses");
    }
  });

  it("getAddressBalances — should construct correct path", async () => {
    try {
      await client.getAddressBalances("btc", "test-wallet-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/btc/wallet/test-wallet-id/addresses/balances");
    }
  });

  it("sendTransaction — should construct correct path", async () => {
    try {
      await client.sendTransaction("btc", "test-wallet-id", {
        address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        amount: "100000",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/btc/wallet/test-wallet-id/tx/send");
      expect(msg).toContain("POST");
    }
  });

  it("getWalletTransfer — should construct correct path", async () => {
    try {
      await client.getWalletTransfer("btc", "test-wallet-id", "test-transfer-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/btc/wallet/test-wallet-id/transfer/test-transfer-id");
    }
  });
});

// ============================================================
// BANK ACCOUNTS — /api/v2/bankaccounts
// ============================================================

describe("MagnoliaClient v2: Bank Accounts", () => {
  it("listBankAccounts — should return bank accounts array", async () => {
    const result = await client.listBankAccounts();
    expect(result).toBeDefined();
    const data = result as { bankAccounts: unknown[] };
    expect(Array.isArray(data.bankAccounts)).toBe(true);
  });

  it("listBankAccounts with filters — should return filtered results", async () => {
    const result = await client.listBankAccounts({ type: "ach", enterpriseId: "test" });
    expect(result).toBeDefined();
    const data = result as { bankAccounts: unknown[] };
    expect(Array.isArray(data.bankAccounts)).toBe(true);
  });

  it("getBankAccount — should throw 404 for nonexistent bank account", async () => {
    try {
      await client.getBankAccount("nonexistent-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/bankaccounts/nonexistent-id");
      expect(msg).toContain("404");
    }
  });

  it("getDepositInfo — should throw 400 (requires currency and goAccountId params)", async () => {
    try {
      await client.getDepositInfo();
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/bankaccounts/deposit/info");
      expect(msg).toContain("400");
    }
  });

  it("updateBankAccount — should throw error for nonexistent bank account", async () => {
    try {
      await client.updateBankAccount("test-id", { name: "Updated" });
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/bankaccounts/test-id");
      expect(msg).toContain("PUT");
    }
  });

  it("deleteBankAccount — should throw error for nonexistent bank account", async () => {
    try {
      await client.deleteBankAccount("test-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/bankaccounts/test-id");
      expect(msg).toContain("DELETE");
    }
  });
});

// ============================================================
// TRADING — /api/prime/trading/v1
// ============================================================

describe("MagnoliaClient v2: Trading", () => {
  it("getTradingBalances — should throw 403 Forbidden (dev account lacks trading access)", async () => {
    try {
      await client.getTradingBalances("test-account-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("403");
      expect(msg).toContain("/api/prime/trading/v1/accounts/test-account-id/balances");
    }
  });

  it("getTradingProducts — should throw 403 Forbidden", async () => {
    try {
      await client.getTradingProducts("test-account-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("403");
      expect(msg).toContain("/api/prime/trading/v1/accounts/test-account-id/products");
    }
  });

  it("listOrders — should throw 403 with correct path including query params", async () => {
    try {
      await client.listOrders("test-account-id", { limit: 10 });
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("403");
      expect(msg).toContain("/api/prime/trading/v1/accounts/test-account-id/orders");
    }
  });

  it("getOrder — should throw 403 with order ID in path", async () => {
    try {
      await client.getOrder("test-account", "test-order");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("403");
      expect(msg).toContain("/api/prime/trading/v1/accounts/test-account/orders/test-order");
    }
  });

  it("cancelOrder — should throw error with POST and cancel path", async () => {
    try {
      await client.cancelOrder("test-account", "test-order");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      // Returns 404 for nonexistent order (cancel route requires a valid order)
      expect(msg).toContain("POST");
      expect(msg).toContain("/api/prime/trading/v1/accounts/test-account/orders/test-order/cancel");
    }
  });

  it("placeOrder — should throw 403 with POST and correct path", async () => {
    try {
      await client.placeOrder("test-account", {
        type: "market",
        product: "BTC-USD",
        side: "buy",
        quantity: "100",
        quantityCurrency: "USD",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("403");
      expect(msg).toContain("POST");
      expect(msg).toContain("/api/prime/trading/v1/accounts/test-account/orders");
    }
  });
});

// ============================================================
// FIAT/ACH — /api/fiat/v1
// ============================================================

describe("MagnoliaClient v2: Fiat/ACH", () => {
  it("getAchAgreement — should throw 400 (requires amount and bankId params)", async () => {
    try {
      await client.getAchAgreement();
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("400");
      expect(msg).toContain("/api/fiat/v1/transaction/ach-debit/agreement");
    }
  });

  it("acceptAchAgreement — should throw error with POST to correct path", async () => {
    try {
      await client.acceptAchAgreement({ bankAccountId: "test-bank" });
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("POST");
      expect(msg).toContain("/api/fiat/v1/transaction/ach-debit/agreement");
    }
  });

  it("createAchDebit — should throw error with POST to correct path", async () => {
    try {
      await client.createAchDebit({
        bankAccountId: "test-bank",
        amount: "100.00",
        currency: "USD",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("POST");
      expect(msg).toContain("/api/fiat/v1/transaction/ach-debit");
    }
  });
});

// ============================================================
// LIGHTNING — /api/v2/wallet/{id}/lightning
// ============================================================

describe("MagnoliaClient v2: Lightning", () => {
  it("listLightningTransactions — should construct correct path", async () => {
    try {
      await client.listLightningTransactions("test-wallet-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/wallet/test-wallet-id/lightning/transaction");
    }
  });

  it("getLightningInvoice — should include payment hash in path", async () => {
    try {
      await client.getLightningInvoice("test-wallet", "test-hash");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/wallet/test-wallet/lightning/invoice/test-hash");
    }
  });

  it("createLightningInvoice — should use POST with correct path", async () => {
    try {
      await client.createLightningInvoice("test-wallet", {
        amount: "1000",
        memo: "test",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("POST");
      expect(msg).toContain("/api/v2/wallet/test-wallet/lightning/invoice");
    }
  });

  it("makeLightningPayment — should use POST with correct path", async () => {
    try {
      await client.makeLightningPayment("test-wallet", {
        invoice: "lnbc1test",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("POST");
      expect(msg).toContain("/api/v2/wallet/test-wallet/lightning/payment");
    }
  });
});

// ============================================================
// UTILITY — /api/tradfi/v1
// ============================================================

describe("MagnoliaClient v2: Utility", () => {
  it("lookupRoutingNumber(ach) — should throw 404 for unknown routing number", async () => {
    try {
      await client.lookupRoutingNumber("ach", "021000021");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("404");
      expect(msg).toContain("/api/tradfi/v1/banks/ach/021000021");
    }
  });

  it("lookupRoutingNumber(wire) — should throw 404 for unknown routing number", async () => {
    try {
      await client.lookupRoutingNumber("wire", "021000021");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("404");
      expect(msg).toContain("/api/tradfi/v1/banks/wire/021000021");
    }
  });
});

// ============================================================
// AUTH METHOD COMPARISON — Verify auth behavior across services
// ============================================================

describe("Auth method comparison (raw requests)", () => {
  it("API key auth returns 200 for /api/v2/bankaccounts (Bug #660 fixed)", async () => {
    const { status, data } = await rawRequest("/api/v2/bankaccounts", {
      method: "GET",
      headers: { Authorization: `Bearer ${DEV_API_KEY}` },
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("bankAccounts");
  });

  it("JWT auth returns 200 for /api/v2/bankaccounts (Bug #658 fixed)", async () => {
    const token = await getJwtToken();
    const { status, data } = await rawRequest("/api/v2/bankaccounts", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("bankAccounts");
  });

  it("JWT auth returns 200 for /api/v2/enterprise (Bug #658 fixed)", async () => {
    const token = await getJwtToken();
    const { status, data } = await rawRequest("/api/v2/enterprise", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(status).toBe(200);
    const enterprise = data as Record<string, unknown>;
    expect(enterprise).toHaveProperty("id");
    expect(enterprise).toHaveProperty("name");
  });

  it("API key auth returns 400 CoinUnsupported for /api/v2/btc/wallet (path works)", async () => {
    const { status, data } = await rawRequest("/api/v2/btc/wallet", {
      method: "GET",
      headers: { Authorization: `Bearer ${DEV_API_KEY}` },
    });
    // btc is unsupported on testnet — 400 (not 401 or 404)
    expect(status).toBe(400);
    expect((data as Record<string, unknown>).name).toBe("CoinUnsupported");
  });
});
