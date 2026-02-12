/**
 * E2E Test: Wallet Flow
 *
 * Tests the complete wallet lifecycle with real data:
 * 1. List wallets for testnet coin (tbtc)
 * 2. Get wallet details
 * 3. Generate new address
 * 4. List addresses
 * 5. Get address balances
 * 6. List wallet transfers
 */

import { describe, it, expect, beforeAll } from "vitest";
import { MagnoliaClient } from "../../magnolia-client.js";
import { DEV_API_KEY } from "../helpers.js";

describe("E2E: Wallet Flow", () => {
  let client: MagnoliaClient;
  let testWalletId: string;
  let generatedAddress: string;

  beforeAll(() => {
    client = new MagnoliaClient(DEV_API_KEY, "https://api.dev.magfi.dev");
  });

  describe("Step 1: List Wallets", () => {
    it("should list tbtc wallets successfully", async () => {
      const result = (await client.listWallets("tbtc")) as Record<
        string,
        unknown
      >;

      expect(result).toBeDefined();
      expect(result.wallets).toBeDefined();
      expect(Array.isArray(result.wallets)).toBe(true);
      expect(result.coin).toBe("tbtc");

      const wallets = result.wallets as Array<Record<string, unknown>>;
      expect(wallets.length).toBeGreaterThan(0);

      // Save first wallet for subsequent tests
      testWalletId = wallets[0].id as string;
      expect(testWalletId).toBeDefined();

      console.log(`Found ${wallets.length} tbtc wallet(s), using: ${testWalletId}`);
    });

    it("should list teth wallets successfully", async () => {
      const result = (await client.listWallets("teth")) as Record<
        string,
        unknown
      >;

      expect(result).toBeDefined();
      expect(result.wallets).toBeDefined();
      expect(Array.isArray(result.wallets)).toBe(true);
      expect(result.coin).toBe("teth");
    });

    it("should fail for unsupported coins on testnet", async () => {
      // btc/eth are not supported on dev testnet, should use tbtc/teth
      try {
        await client.listWallets("btc");
        expect.unreachable("Should have thrown for btc on testnet");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toContain("400");
        expect(err.message.toLowerCase()).toMatch(/coin.*unsupported|invalid/i);
      }
    });
  });

  describe("Step 2: Get Wallet Details", () => {
    it("should get wallet by ID successfully", async () => {
      const wallet = (await client.getWallet(
        "tbtc",
        testWalletId
      )) as Record<string, unknown>;

      expect(wallet).toBeDefined();
      expect(wallet.id).toBe(testWalletId);
      expect(wallet.coin).toBe("tbtc");

      // Wallet should have either balance info or addresses
      const hasBalanceInfo = wallet.balance !== undefined ||
                            wallet.balances !== undefined;
      const hasAddresses = wallet.addresses !== undefined;

      expect(hasBalanceInfo || hasAddresses).toBe(true);

      console.log("Wallet details:", JSON.stringify(wallet, null, 2));
    });

    it("should fail for non-existent wallet ID", async () => {
      const fakeWalletId = "wallet_nonexistent_123";

      try {
        await client.getWallet("tbtc", fakeWalletId);
        expect.unreachable("Should have thrown 404");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/404|not found/i);
      }
    });
  });

  describe("Step 3: Generate Address", () => {
    it("should generate new tbtc address successfully", async () => {
      const address = (await client.generateAddress(
        "tbtc",
        testWalletId
      )) as Record<string, unknown>;

      expect(address).toBeDefined();
      expect(address.address).toBeDefined();
      expect(typeof address.address).toBe("string");

      generatedAddress = address.address as string;

      // Testnet Bitcoin addresses start with tb1, m, or n
      expect(generatedAddress).toMatch(/^(tb1|[mn])[a-zA-Z0-9]+$/);

      console.log(`Generated new tbtc address: ${generatedAddress}`);
    });

    it("should be able to generate multiple addresses", async () => {
      const address1 = (await client.generateAddress(
        "tbtc",
        testWalletId
      )) as Record<string, unknown>;
      const address2 = (await client.generateAddress(
        "tbtc",
        testWalletId
      )) as Record<string, unknown>;

      expect(address1.address).toBeDefined();
      expect(address2.address).toBeDefined();

      // Each address should be unique
      expect(address1.address).not.toBe(address2.address);

      console.log(`Generated addresses: ${address1.address}, ${address2.address}`);
    });
  });

  describe("Step 4: List Addresses", () => {
    it("should list wallet addresses successfully", async () => {
      const addresses = (await client.listAddresses(
        "tbtc",
        testWalletId
      )) as unknown;

      // API might return array or object with addresses property
      const addressList = Array.isArray(addresses)
        ? addresses
        : (addresses as Record<string, unknown>).addresses;

      expect(addressList).toBeDefined();
      expect(Array.isArray(addressList)).toBe(true);

      const addrArray = addressList as Array<Record<string, unknown>>;

      // Should include the address we just generated
      const foundGenerated = addrArray.some(
        (addr) => addr.address === generatedAddress
      );
      expect(foundGenerated).toBe(true);

      console.log(`Wallet has ${addrArray.length} address(es)`);
    });
  });

  describe("Step 5: Get Balances", () => {
    it("should get address balances successfully", async () => {
      const balances = (await client.getAddressBalances(
        "tbtc",
        testWalletId
      )) as Record<string, unknown>;

      expect(balances).toBeDefined();

      // Balance structure might vary - check for common fields
      const hasTotal = balances.total !== undefined;
      const hasBalance = balances.balance !== undefined;
      const hasBalances = balances.balances !== undefined;
      const hasAvailable = balances.available !== undefined;

      expect(hasTotal || hasBalance || hasBalances || hasAvailable).toBe(true);

      // Balance might be 0 if wallet is unfunded (testnet)
      // Just verify structure is correct
      const balanceValue = (balances.total ||
        balances.balance ||
        balances.available) as string | number | undefined;

      if (balanceValue !== undefined) {
        const numBalance = typeof balanceValue === "string"
          ? parseFloat(balanceValue)
          : balanceValue;
        expect(numBalance).toBeGreaterThanOrEqual(0);
      }

      console.log("Wallet balances:", JSON.stringify(balances, null, 2));
    });
  });

  describe("Step 6: List Transfers", () => {
    it("should list wallet transfers successfully", async () => {
      const transfers = (await client.listWalletTransfers(
        "tbtc",
        testWalletId
      )) as unknown;

      // API might return array or object with transfers property
      const transferList = Array.isArray(transfers)
        ? transfers
        : (transfers as Record<string, unknown>).transfers;

      expect(transferList).toBeDefined();
      expect(Array.isArray(transferList)).toBe(true);

      // Might be empty if no transfers yet (testnet wallet)
      console.log(
        `Wallet has ${(transferList as Array<unknown>).length} transfer(s)`
      );
    });

    it("should handle empty transfer list", async () => {
      // Create a fresh wallet that definitely has no transfers
      // Just verify the API doesn't error on empty state
      const transfers = (await client.listWalletTransfers(
        "tbtc",
        testWalletId
      )) as unknown;

      const transferList = Array.isArray(transfers)
        ? transfers
        : (transfers as Record<string, unknown>).transfers;

      // Should return empty array, not null/undefined
      expect(transferList).toBeDefined();
      expect(Array.isArray(transferList)).toBe(true);
    });
  });

  describe("Step 7: Error Conditions", () => {
    it("should handle invalid coin gracefully", async () => {
      try {
        await client.listWallets("invalidcoin");
        expect.unreachable("Should have thrown error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/400|invalid|unsupported/i);
      }
    });

    it("should handle invalid wallet ID gracefully", async () => {
      try {
        await client.generateAddress("tbtc", "invalid_wallet_id");
        expect.unreachable("Should have thrown error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/404|not found/i);
      }
    });

    it("should handle mismatched coin and wallet", async () => {
      // Try to get a tbtc wallet with teth coin parameter
      try {
        await client.getWallet("teth", testWalletId); // testWalletId is tbtc
        expect.unreachable("Should have thrown error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/400|404|invalid|not found/i);
      }
    });
  });
});
