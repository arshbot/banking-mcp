/**
 * Unit tests for MCP server tool registration and error handling.
 *
 * Tests that all tools are properly registered and handle errors gracefully.
 * Updated for v2.0 — uses correct documented API paths.
 */

import { describe, it, expect } from "vitest";
import { MagnoliaClient } from "../magnolia-client.js";

describe("MagnoliaClient: Constructor", () => {
  it("should use default API URL when none provided", () => {
    const client = new MagnoliaClient("test-key");
    expect(client).toBeDefined();
  });

  it("should use custom API URL when provided", () => {
    const client = new MagnoliaClient(
      "test-key",
      "https://custom.api.com"
    );
    expect(client).toBeDefined();
  });
});

describe("MagnoliaClient: Request method", () => {
  it("should include User-Agent header", async () => {
    const client = new MagnoliaClient(
      "test-key",
      "https://api.dev.magfi.dev"
    );

    try {
      await client.getEnterprises();
    } catch (e) {
      const msg = (e as Error).message;
      // If we get 403 with error 1010, User-Agent is not being sent
      expect(msg).not.toContain("1010");
    }
  });

  it("should include Authorization header (gets 401, not 403)", async () => {
    const client = new MagnoliaClient(
      "test-key",
      "https://api.dev.magfi.dev"
    );

    try {
      await client.listApiKeys();
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      // Should get 401 (unauthorized) not 403 (Cloudflare block)
      expect(msg).toContain("401");
      expect(msg).not.toContain("403");
    }
  });

  it("should set Content-Type for POST requests", async () => {
    const client = new MagnoliaClient(
      "test-key",
      "https://api.dev.magfi.dev"
    );

    try {
      await client.addBankAccount({
        type: "ach",
        name: "test",
        ownerName: "Test User",
        shortCountryCode: "US",
        accountNumber: "123456789",
        currency: "USD",
        routingNumber: "021000021",
        accountType: "checking",
        ownerAddressCountryCode: "US",
        ownerAddress: {
          address_line_1: "123 Test St",
          city_locality: "San Francisco",
          state_province: "CA",
          postal_code: "94102",
        },
      });
    } catch (e) {
      // Just verify it doesn't crash with a content-type error
      const msg = (e as Error).message;
      expect(msg).not.toContain("Content-Type");
    }
  });
});

describe("MagnoliaClient: Error handling", () => {
  it("should throw Error with status code on failure", async () => {
    const client = new MagnoliaClient(
      "invalid-key",
      "https://api.dev.magfi.dev"
    );

    try {
      await client.listApiKeys();
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      const msg = (e as Error).message;
      expect(msg).toContain("Magnolia API error");
    }
  });

  it("should include path in error message", async () => {
    const client = new MagnoliaClient(
      "invalid-key",
      "https://api.dev.magfi.dev"
    );

    try {
      await client.getWallet("btc", "test-wallet-id");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/btc/wallet/test-wallet-id");
    }
  });

  it("should include HTTP method in error message", async () => {
    const client = new MagnoliaClient(
      "invalid-key",
      "https://api.dev.magfi.dev"
    );

    try {
      await client.addBankAccount({
        type: "ach",
        name: "test",
        ownerName: "Test",
        shortCountryCode: "US",
        accountNumber: "123",
        currency: "USD",
        ownerAddressCountryCode: "US",
        ownerAddress: {
          address_line_1: "123 Test St",
          city_locality: "Test City",
          state_province: "CA",
          postal_code: "90001",
        },
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("POST");
    }
  });
});

describe("MagnoliaClient: Query string building", () => {
  it("should handle empty params for listBankAccounts", async () => {
    const client = new MagnoliaClient(
      "test-key",
      "https://api.dev.magfi.dev"
    );

    try {
      await client.listBankAccounts({});
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/api/v2/bankaccounts");
      expect(msg).not.toContain("?");
    }
  });

  it("should handle params for listBankAccounts", async () => {
    const client = new MagnoliaClient(
      "test-key",
      "https://api.dev.magfi.dev"
    );

    try {
      await client.listBankAccounts({
        type: "ach",
        verificationState: "verified",
        enterpriseId: "test-enterprise",
      });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("?");
    }
  });

  it("should handle params for listOrders", async () => {
    const client = new MagnoliaClient(
      "test-key",
      "https://api.dev.magfi.dev"
    );

    try {
      await client.listOrders("test-account", { limit: 3, offset: 0 });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("limit=3");
    }
  });
});

describe("MagnoliaClient: New v2 method signatures", () => {
  const client = new MagnoliaClient("test-key");

  // Enterprise
  it("should have enterprise methods", () => {
    expect(typeof client.getEnterprises).toBe("function");
  });

  // Auth
  it("should have auth methods", () => {
    expect(typeof client.login).toBe("function");
    expect(typeof client.listApiKeys).toBe("function");
    expect(typeof client.deleteApiKey).toBe("function");
  });

  // Crypto wallets
  it("should have crypto wallet methods", () => {
    expect(typeof client.listWallets).toBe("function");
    expect(typeof client.getWallet).toBe("function");
    expect(typeof client.generateAddress).toBe("function");
    expect(typeof client.listAddresses).toBe("function");
    expect(typeof client.getAddressBalances).toBe("function");
    expect(typeof client.sendTransaction).toBe("function");
    expect(typeof client.getWalletTransfer).toBe("function");
    expect(typeof client.listWalletTransfers).toBe("function");
  });

  // Bank accounts
  it("should have bank account methods", () => {
    expect(typeof client.listBankAccounts).toBe("function");
    expect(typeof client.getBankAccount).toBe("function");
    expect(typeof client.addBankAccount).toBe("function");
    expect(typeof client.updateBankAccount).toBe("function");
    expect(typeof client.deleteBankAccount).toBe("function");
    expect(typeof client.getDepositInfo).toBe("function");
  });

  // Trading
  it("should have trading methods", () => {
    expect(typeof client.getTradingBalances).toBe("function");
    expect(typeof client.getTradingProducts).toBe("function");
    expect(typeof client.placeOrder).toBe("function");
    expect(typeof client.listOrders).toBe("function");
    expect(typeof client.getOrder).toBe("function");
    expect(typeof client.cancelOrder).toBe("function");
  });

  // Fiat/ACH
  it("should have fiat/ACH methods", () => {
    expect(typeof client.getAchAgreement).toBe("function");
    expect(typeof client.acceptAchAgreement).toBe("function");
    expect(typeof client.createAchDebit).toBe("function");
  });

  // Lightning
  it("should have lightning methods", () => {
    expect(typeof client.createLightningInvoice).toBe("function");
    expect(typeof client.getLightningInvoice).toBe("function");
    expect(typeof client.makeLightningPayment).toBe("function");
    expect(typeof client.listLightningTransactions).toBe("function");
  });

  // Utility
  it("should have utility methods", () => {
    expect(typeof client.lookupRoutingNumber).toBe("function");
  });

});
