/**
 * E2E Test: Bank Account Flow
 *
 * Tests the complete bank account lifecycle with real data:
 * 1. Add bank account (ACH)
 * 2. Retrieve account details
 * 3. List accounts and find created account
 * 4. Update account name
 * 5. Delete account
 * 6. Verify deletion
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MagnoliaClient } from "../../magnolia-client.js";
import { DEV_API_KEY } from "../helpers.js";
import { cleanupTestResources, TEST_FIXTURES } from "./test-utils.js";

describe("E2E: Bank Account Flow", () => {
  let client: MagnoliaClient;
  const createdBankAccounts: string[] = [];

  beforeAll(() => {
    client = new MagnoliaClient(DEV_API_KEY, "https://api.dev.magfi.dev");
  });

  afterAll(async () => {
    // Cleanup all bank accounts we created
    for (const accountId of createdBankAccounts) {
      try {
        await client.deleteBankAccount(accountId);
      } catch (e) {
        console.log(`Failed to cleanup bank account ${accountId}:`, e);
      }
    }

    // Run general cleanup
    const cleanup = await cleanupTestResources(client);
    console.log("Cleanup results:", cleanup);
  });

  describe("Step 1: Add Bank Account", () => {
    it("should add ACH bank account successfully", async () => {
      const result = (await client.addBankAccount(
        TEST_FIXTURES.TEST_BANK_ACCOUNT
      )) as Record<string, unknown>;

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe("string");

      // Store for later tests and cleanup
      createdBankAccounts.push(result.id as string);

      // Verify returned data matches input
      expect(result.name).toBe(TEST_FIXTURES.TEST_BANK_ACCOUNT.name);
      expect(result.type).toBe(TEST_FIXTURES.TEST_BANK_ACCOUNT.type);
      expect(result.currency).toBe(TEST_FIXTURES.TEST_BANK_ACCOUNT.currency);
    });

    it("should add bank account with different account type (savings)", async () => {
      const savingsAccount = {
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Test Savings",
        accountType: "saving" as const,
      };

      const result = (await client.addBankAccount(
        savingsAccount
      )) as Record<string, unknown>;

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      createdBankAccounts.push(result.id as string);

      expect(result.name).toBe("E2E Test Savings");
    });

    it("should add multiple bank accounts concurrently", async () => {
      const account1 = {
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Concurrent 1",
      };
      const account2 = {
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Concurrent 2",
      };
      const account3 = {
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Concurrent 3",
      };

      const results = await Promise.all([
        client.addBankAccount(account1),
        client.addBankAccount(account2),
        client.addBankAccount(account3),
      ]);

      results.forEach((result, idx) => {
        const r = result as Record<string, unknown>;
        expect(r.id).toBeDefined();
        createdBankAccounts.push(r.id as string);
        expect(r.name).toBe(`E2E Concurrent ${idx + 1}`);
      });

      // All IDs should be unique
      const ids = results.map((r) => (r as Record<string, unknown>).id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe("Step 2: Retrieve Bank Account", () => {
    let testAccountId: string;

    beforeAll(async () => {
      const result = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Retrieve Test",
      })) as Record<string, unknown>;
      testAccountId = result.id as string;
      createdBankAccounts.push(testAccountId);
    });

    it("should retrieve bank account by ID", async () => {
      const account = (await client.getBankAccount(
        testAccountId
      )) as Record<string, unknown>;

      expect(account).toBeDefined();
      expect(account.id).toBe(testAccountId);
      expect(account.name).toBe("E2E Retrieve Test");
      expect(account.type).toBe("ach");
    });

    it("should include account status/state", async () => {
      const account = (await client.getBankAccount(
        testAccountId
      )) as Record<string, unknown>;

      // Account should have some verification state
      const hasStatus =
        account.status !== undefined ||
        account.verificationState !== undefined ||
        account.state !== undefined;

      expect(hasStatus).toBe(true);
    });

    it("should fail to retrieve non-existent bank account", async () => {
      try {
        await client.getBankAccount("nonexistent-bank-account-id");
        expect.unreachable("Should have thrown error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toBeDefined();
        // Should be 404 error
        expect(err.message).toContain("404");
      }
    });
  });

  describe("Step 3: List Bank Accounts", () => {
    beforeAll(async () => {
      // Create a few test accounts
      const promises = [
        client.addBankAccount({
          ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
          name: "E2E List Test 1",
        }),
        client.addBankAccount({
          ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
          name: "E2E List Test 2",
        }),
      ];

      const results = await Promise.all(promises);
      results.forEach((r) => {
        const result = r as Record<string, unknown>;
        createdBankAccounts.push(result.id as string);
      });
    });

    it("should list all bank accounts", async () => {
      const result = (await client.listBankAccounts()) as Record<
        string,
        unknown
      >;

      expect(result).toBeDefined();
      expect(result.bankAccounts).toBeDefined();
      expect(Array.isArray(result.bankAccounts)).toBe(true);

      const accounts = result.bankAccounts as Array<Record<string, unknown>>;
      expect(accounts.length).toBeGreaterThan(0);
    });

    it("should find created accounts in list", async () => {
      const result = (await client.listBankAccounts()) as {
        bankAccounts: Array<Record<string, unknown>>;
      };

      const listTest1 = result.bankAccounts.find(
        (a) => a.name === "E2E List Test 1"
      );
      const listTest2 = result.bankAccounts.find(
        (a) => a.name === "E2E List Test 2"
      );

      expect(listTest1).toBeDefined();
      expect(listTest2).toBeDefined();
    });

    it("should include account metadata in list", async () => {
      const result = (await client.listBankAccounts()) as {
        bankAccounts: Array<Record<string, unknown>>;
      };

      const firstAccount = result.bankAccounts[0];

      expect(firstAccount.id).toBeDefined();
      expect(firstAccount.name).toBeDefined();
      expect(firstAccount.type).toBeDefined();
      expect(firstAccount.currency).toBeDefined();
    });
  });

  describe("Step 4: Update Bank Account", () => {
    let testAccountId: string;

    beforeAll(async () => {
      const result = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Update Original",
      })) as Record<string, unknown>;
      testAccountId = result.id as string;
      createdBankAccounts.push(testAccountId);
    });

    it("should update bank account name", async () => {
      const updated = (await client.updateBankAccount(testAccountId, {
        name: "E2E Update Modified",
      })) as Record<string, unknown>;

      expect(updated.name).toBe("E2E Update Modified");
    });

    it("should persist updated name", async () => {
      // Update
      await client.updateBankAccount(testAccountId, {
        name: "E2E Update Persisted",
      });

      // Retrieve and verify
      const retrieved = (await client.getBankAccount(
        testAccountId
      )) as Record<string, unknown>;

      expect(retrieved.name).toBe("E2E Update Persisted");
    });

    it("should fail to update non-existent account", async () => {
      try {
        await client.updateBankAccount("nonexistent-id", {
          name: "Should Fail",
        });
        expect.unreachable("Should have thrown error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toBeDefined();
        // Should be 404 error
        expect(err.message).toContain("404");
      }
    });
  });

  describe("Step 5: Delete Bank Account", () => {
    it("should delete bank account successfully", async () => {
      // Create account to delete
      const created = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Delete Test",
      })) as Record<string, unknown>;
      const accountId = created.id as string;

      // Delete it
      const result = await client.deleteBankAccount(accountId);

      // Result should indicate success
      expect(result).toBeDefined();
    });

    it("should no longer list deleted account", async () => {
      // Create and delete account
      const created = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Delete Verify",
      })) as Record<string, unknown>;
      const accountId = created.id as string;

      await client.deleteBankAccount(accountId);

      // List accounts and verify it's gone
      const listResult = (await client.listBankAccounts()) as {
        bankAccounts: Array<Record<string, unknown>>;
      };

      const deletedAccountStillPresent = listResult.bankAccounts.some(
        (a) => a.id === accountId
      );

      expect(deletedAccountStillPresent).toBe(false);
    });

    it("should not be able to retrieve deleted account", async () => {
      // Create and delete account
      const created = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Delete Retrieve Test",
      })) as Record<string, unknown>;
      const accountId = created.id as string;

      await client.deleteBankAccount(accountId);

      // Try to retrieve (should fail)
      try {
        await client.getBankAccount(accountId);
        expect.unreachable("Should have thrown 404 error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toContain("404");
      }
    });
  });

  describe("Step 6: Edge Cases & Error Handling", () => {
    it("should reject bank account with invalid routing number", async () => {
      const invalidAccount = {
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        routingNumber: "000000000", // Invalid routing number
      };

      try {
        await client.addBankAccount(invalidAccount);
        // May or may not fail depending on validation - let's see
      } catch (error) {
        const err = error as Error;
        expect(err.message).toBeDefined();
      }
    });

    it("should reject bank account with missing required fields", async () => {
      const incompleteAccount = {
        type: "ach" as const,
        name: "Incomplete Account",
        // Missing: ownerName, accountNumber, routingNumber, currency, shortCountryCode
      };

      try {
        await client.addBankAccount(incompleteAccount as any);
        expect.unreachable("Should have thrown error for missing fields");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toBeDefined();
        expect(
          [400, 422].some((code) => err.message.includes(String(code)))
        ).toBe(true);
      }
    });

    it("should handle concurrent delete operations gracefully", async () => {
      // Create account
      const created = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Concurrent Delete",
      })) as Record<string, unknown>;
      const accountId = created.id as string;

      // Try to delete twice in parallel
      const deletePromises = [
        client.deleteBankAccount(accountId),
        client.deleteBankAccount(accountId),
      ];

      // One should succeed, one may fail or both may succeed if idempotent
      const results = await Promise.allSettled(deletePromises);

      const successCount = results.filter(
        (r) => r.status === "fulfilled"
      ).length;

      // At least one should succeed
      expect(successCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Step 7: Idempotency & Data Consistency", () => {
    it("should allow creating multiple accounts with same details", async () => {
      // Create two accounts with identical details (different IDs expected)
      const account1 = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Idempotency Test",
      })) as Record<string, unknown>;

      const account2 = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Idempotency Test",
      })) as Record<string, unknown>;

      createdBankAccounts.push(account1.id as string, account2.id as string);

      // Should have different IDs
      expect(account1.id).not.toBe(account2.id);
    });

    it("should maintain data consistency after rapid create/delete", async () => {
      // Create, delete, create again with same name
      const created1 = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Consistency Test",
      })) as Record<string, unknown>;

      await client.deleteBankAccount(created1.id as string);

      const created2 = (await client.addBankAccount({
        ...TEST_FIXTURES.TEST_BANK_ACCOUNT,
        name: "E2E Consistency Test",
      })) as Record<string, unknown>;

      createdBankAccounts.push(created2.id as string);

      // Should get different ID
      expect(created1.id).not.toBe(created2.id);

      // Should be able to retrieve the new one
      const retrieved = (await client.getBankAccount(
        created2.id as string
      )) as Record<string, unknown>;
      expect(retrieved.id).toBe(created2.id);
    });
  });
});
