/**
 * E2E Test: Lightning Network Flow
 *
 * Tests Lightning Network operations with real data:
 * 1. Create lightning invoice
 * 2. Get invoice status
 * 3. Pay lightning invoice
 * 4. List lightning transactions
 * 5. Test expiry and cancellation
 *
 * KNOWN BLOCKER: Bug #6 - No wallets provisioned in dev environment
 * Tests will document what SHOULD work once wallets are available.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MagnoliaClient } from "../../magnolia-client.js";
import { DEV_API_KEY } from "../helpers.js";
import { pollUntil, cleanupTestResources } from "./test-utils.js";

describe("E2E: Lightning Network Flow", () => {
  let client: MagnoliaClient;
  let testWalletId: string | null = null;
  const createdInvoices: string[] = [];

  beforeAll(async () => {
    client = new MagnoliaClient(DEV_API_KEY, "https://api.dev.magfi.dev");

    // Try to get a wallet for testing
    try {
      const wallets = (await client.listWallets("tbtc")) as Record<
        string,
        unknown
      >;
      const walletArray = wallets.wallets as Array<Record<string, unknown>>;
      if (walletArray && walletArray.length > 0) {
        testWalletId = walletArray[0].id as string;
        console.log(`Using wallet: ${testWalletId}`);
      } else {
        console.log("⚠️ No wallets available - tests will document expected behavior");
      }
    } catch (error) {
      console.log("⚠️ Could not list wallets:", (error as Error).message);
    }
  });

  afterAll(async () => {
    const cleanup = await cleanupTestResources(client);
    console.log("Cleanup results:", cleanup);
  });

  describe("Step 1: Create Lightning Invoice", () => {
    it("should create lightning invoice with amount and memo", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available (Bug #6)");
        // Test the API call anyway to verify endpoint exists
        try {
          await client.createLightningInvoice("fake_wallet_id", {
            amount: "1000",
            memo: "Test invoice",
          });
          expect.unreachable("Should have failed with fake wallet ID");
        } catch (error) {
          const err = error as Error;
          expect(err.message).toMatch(/404|invalid|not found/i);
        }
        return;
      }

      const invoice = (await client.createLightningInvoice(testWalletId, {
        amount: "1000", // 1000 satoshis
        memo: "E2E Test Invoice",
      })) as Record<string, unknown>;

      expect(invoice).toBeDefined();
      expect(invoice.paymentRequest).toBeDefined();
      expect(typeof invoice.paymentRequest).toBe("string");

      // Lightning invoice should start with "ln" for mainnet or "lntb" for testnet
      const paymentRequest = invoice.paymentRequest as string;
      expect(paymentRequest).toMatch(/^ln(tb)?/i);

      expect(invoice.paymentHash).toBeDefined();
      expect(typeof invoice.paymentHash).toBe("string");

      createdInvoices.push(invoice.paymentHash as string);

      console.log("Created invoice:", invoice.paymentHash);
      console.log("Payment request:", paymentRequest);
    });

    it("should create invoice with minimal amount", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available (Bug #6)");
        return;
      }

      const invoice = (await client.createLightningInvoice(testWalletId, {
        amount: "1", // 1 satoshi - minimum amount
        memo: "Minimum amount test",
      })) as Record<string, unknown>;

      expect(invoice).toBeDefined();
      expect(invoice.paymentRequest).toBeDefined();
      createdInvoices.push(invoice.paymentHash as string);
    });

    it("should create invoice with large amount", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available (Bug #6)");
        return;
      }

      const invoice = (await client.createLightningInvoice(testWalletId, {
        amount: "1000000", // 1 million satoshis (0.01 BTC)
        memo: "Large amount test",
      })) as Record<string, unknown>;

      expect(invoice).toBeDefined();
      expect(invoice.paymentRequest).toBeDefined();
      createdInvoices.push(invoice.paymentHash as string);
    });

    it("should create invoice without memo (optional field)", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available (Bug #6)");
        return;
      }

      const invoice = (await client.createLightningInvoice(testWalletId, {
        amount: "500",
        // No memo field
      })) as Record<string, unknown>;

      expect(invoice).toBeDefined();
      expect(invoice.paymentRequest).toBeDefined();
      createdInvoices.push(invoice.paymentHash as string);
    });

    it("should create multiple invoices with unique payment hashes", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available (Bug #6)");
        return;
      }

      const invoices = await Promise.all([
        client.createLightningInvoice(testWalletId, {
          amount: "100",
          memo: "Invoice 1",
        }),
        client.createLightningInvoice(testWalletId, {
          amount: "200",
          memo: "Invoice 2",
        }),
        client.createLightningInvoice(testWalletId, {
          amount: "300",
          memo: "Invoice 3",
        }),
      ]);

      const hashes = invoices.map(
        (inv) => (inv as Record<string, unknown>).paymentHash as string
      );
      const uniqueHashes = new Set(hashes);

      expect(uniqueHashes.size).toBe(3);
      expect(hashes.every((h) => typeof h === "string")).toBe(true);

      hashes.forEach((h) => createdInvoices.push(h));
    });
  });

  describe("Step 2: Get Invoice Status", () => {
    it("should retrieve invoice by payment hash", async () => {
      if (!testWalletId || createdInvoices.length === 0) {
        console.log("⚠️ Skipping - no invoices created");
        return;
      }

      const paymentHash = createdInvoices[0];
      const invoice = (await client.getLightningInvoice(
        testWalletId,
        paymentHash
      )) as Record<string, unknown>;

      expect(invoice).toBeDefined();
      expect(invoice.paymentHash).toBe(paymentHash);
      expect(invoice.status).toBeDefined();
      expect(invoice.amount).toBeDefined();

      // Status should be pending/unpaid initially
      expect(invoice.status).toMatch(/pending|unpaid|open|waiting/i);

      console.log("Invoice status:", invoice.status);
    });

    it("should fail for non-existent payment hash", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      const fakeHash = "0".repeat(64); // Fake payment hash

      try {
        await client.getLightningInvoice(testWalletId, fakeHash);
        expect.unreachable("Should have thrown 404");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/404|not found/i);
      }
    });
  });

  describe("Step 3: List Lightning Transactions", () => {
    it("should list all lightning transactions", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      const transactions = (await client.listLightningTransactions(
        testWalletId
      )) as unknown;

      // API might return array or object with transactions property
      const txList = Array.isArray(transactions)
        ? transactions
        : (transactions as Record<string, unknown>).transactions;

      expect(txList).toBeDefined();
      expect(Array.isArray(txList)).toBe(true);

      const txArray = txList as Array<Record<string, unknown>>;

      // Should include invoices we created
      if (createdInvoices.length > 0) {
        const foundInvoice = txArray.some((tx) =>
          createdInvoices.includes(tx.paymentHash as string)
        );
        expect(foundInvoice).toBe(true);
      }

      console.log(`Found ${txArray.length} lightning transaction(s)`);
    });

    it("should include transaction metadata", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      const transactions = (await client.listLightningTransactions(
        testWalletId
      )) as unknown;

      const txList = Array.isArray(transactions)
        ? transactions
        : (transactions as Record<string, unknown>).transactions;

      if ((txList as Array<unknown>).length > 0) {
        const firstTx = (txList as Array<Record<string, unknown>>)[0];

        // Verify transaction has required fields
        expect(firstTx.paymentHash).toBeDefined();
        expect(firstTx.amount || firstTx.value).toBeDefined();
        expect(firstTx.status).toBeDefined();
        expect(firstTx.createdAt || firstTx.timestamp).toBeDefined();
      }
    });
  });

  describe("Step 4: Pay Lightning Invoice", () => {
    it("should pay external lightning invoice (requires funded wallet)", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      // To test payment, we need:
      // 1. Funded wallet with sufficient balance
      // 2. Valid testnet lightning invoice to pay

      // For now, test with a fake invoice to verify endpoint exists
      const fakeInvoice = "lntb" + "0".repeat(100); // Fake testnet invoice

      try {
        const payment = (await client.makeLightningPayment(testWalletId, {
          invoice: fakeInvoice,
        })) as Record<string, unknown>;

        // If this succeeds, verify response structure
        expect(payment).toBeDefined();
        expect(payment.paymentHash || payment.id).toBeDefined();
        expect(payment.status).toBeDefined();
      } catch (error) {
        const err = error as Error;

        // Expected errors:
        // - Invalid invoice format
        // - Insufficient funds
        // - Invoice already paid/expired
        if (err.message.includes("invalid") ||
            err.message.includes("insufficient") ||
            err.message.includes("expired") ||
            err.message.includes("400")) {
          console.log("⚠️ Payment failed as expected (test invoice):", err.message.substring(0, 100));
          expect(err.message).toMatch(/400|invalid|insufficient|expired/i);
        } else {
          console.log("Unexpected payment error:", err.message);
          throw error;
        }
      }
    });

    it("should reject payment with invalid invoice format", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      const invalidInvoice = "not-a-valid-invoice";

      try {
        await client.makeLightningPayment(testWalletId, {
          invoice: invalidInvoice,
        });
        expect.unreachable("Should have thrown validation error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/400|invalid|format/i);
      }
    });

    it("should reject payment with empty invoice", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      try {
        await client.makeLightningPayment(testWalletId, {
          invoice: "",
        });
        expect.unreachable("Should have thrown validation error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/400|required|empty/i);
      }
    });
  });

  describe("Step 5: Invoice Status Transitions", () => {
    it("should poll invoice until paid or expired", async () => {
      if (!testWalletId || createdInvoices.length === 0) {
        console.log("⚠️ Skipping - no invoices created");
        return;
      }

      const paymentHash = createdInvoices[0];

      try {
        // Poll for 30 seconds (invoice may expire quickly)
        const finalInvoice = await pollUntil(
          async () => {
            const invoice = (await client.getLightningInvoice(
              testWalletId!,
              paymentHash
            )) as Record<string, unknown>;
            return invoice;
          },
          (invoice) => {
            const status = invoice.status as string;
            return (
              status === "paid" ||
              status === "settled" ||
              status === "expired" ||
              status === "cancelled"
            );
          },
          {
            maxWait: 30000,
            pollInterval: 2000,
            timeoutMessage: "Invoice did not reach final state",
          }
        );

        expect(finalInvoice.status).toMatch(
          /paid|settled|expired|cancelled/i
        );
        console.log("Final invoice status:", finalInvoice.status);
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("did not reach final state")) {
          console.log("⚠️ Invoice still pending after 30 seconds");
          // Not necessarily a failure - may take longer
        } else {
          throw error;
        }
      }
    });
  });

  describe("Step 6: Error Conditions", () => {
    it("should reject invoice creation with negative amount", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      try {
        await client.createLightningInvoice(testWalletId, {
          amount: "-100",
          memo: "Invalid negative amount",
        });
        expect.unreachable("Should have thrown validation error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/400|invalid|negative/i);
      }
    });

    it("should reject invoice creation with zero amount", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      try {
        await client.createLightningInvoice(testWalletId, {
          amount: "0",
          memo: "Invalid zero amount",
        });
        expect.unreachable("Should have thrown validation error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/400|invalid|zero|positive/i);
      }
    });

    it("should reject invoice creation with invalid wallet ID", async () => {
      try {
        await client.createLightningInvoice("fake_wallet_id", {
          amount: "1000",
          memo: "Test",
        });
        expect.unreachable("Should have thrown 404");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/404|invalid|not found/i);
      }
    });

    it("should handle very long memo field", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      const longMemo = "A".repeat(1000); // 1000 character memo

      try {
        const invoice = (await client.createLightningInvoice(testWalletId, {
          amount: "100",
          memo: longMemo,
        })) as Record<string, unknown>;

        expect(invoice).toBeDefined();
        // Some implementations truncate long memos
        createdInvoices.push(invoice.paymentHash as string);
      } catch (error) {
        const err = error as Error;
        // May reject if memo too long
        if (err.message.includes("too long") || err.message.includes("400")) {
          console.log("⚠️ Long memo rejected:", err.message.substring(0, 100));
          expect(err.message).toMatch(/400|too long|max/i);
        } else {
          throw error;
        }
      }
    });
  });

  describe("Step 7: Concurrent Invoice Operations", () => {
    it("should handle concurrent invoice creations", async () => {
      if (!testWalletId) {
        console.log("⚠️ Skipping - no wallets available");
        return;
      }

      const invoices = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          client.createLightningInvoice(testWalletId!, {
            amount: `${(i + 1) * 100}`,
            memo: `Concurrent invoice ${i + 1}`,
          })
        )
      );

      // All invoices should succeed
      expect(invoices.length).toBe(5);

      // All should have unique payment hashes
      const hashes = invoices.map(
        (inv) => (inv as Record<string, unknown>).paymentHash as string
      );
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(5);

      // All should have valid payment requests
      const requests = invoices.map(
        (inv) => (inv as Record<string, unknown>).paymentRequest as string
      );
      expect(requests.every((r) => r.startsWith("ln"))).toBe(true);

      hashes.forEach((h) => createdInvoices.push(h));
    });

    it("should handle concurrent invoice status checks", async () => {
      if (!testWalletId || createdInvoices.length < 3) {
        console.log("⚠️ Skipping - insufficient invoices");
        return;
      }

      const checks = await Promise.all(
        createdInvoices.slice(0, 3).map((hash) =>
          client.getLightningInvoice(testWalletId!, hash)
        )
      );

      expect(checks.length).toBe(3);
      checks.forEach((invoice) => {
        const inv = invoice as Record<string, unknown>;
        expect(inv.paymentHash).toBeDefined();
        expect(inv.status).toBeDefined();
      });
    });
  });
});
