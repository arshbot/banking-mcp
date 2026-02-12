/**
 * E2E Test Utilities
 *
 * Polling helpers, cleanup utilities, and test fixtures for comprehensive
 * end-to-end testing of the Magnolia API.
 */

import { MagnoliaClient } from "../../magnolia-client.js";

/**
 * Poll a function until a condition is met or timeout occurs.
 *
 * @param fn - Function to poll (should return data to check)
 * @param condition - Condition function that returns true when done
 * @param options - Polling options (maxWait, pollInterval)
 * @returns The result when condition is met
 * @throws Error if timeout occurs
 */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: {
    maxWait?: number; // Max time to wait (ms)
    pollInterval?: number; // Time between polls (ms)
    timeoutMessage?: string; // Custom timeout message
  } = {}
): Promise<T> {
  const maxWait = options.maxWait || 30000; // Default 30 seconds
  const pollInterval = options.pollInterval || 1000; // Default 1 second
  const startTime = Date.now();

  let lastResult: T | undefined;
  let attempts = 0;

  while (Date.now() - startTime < maxWait) {
    attempts++;
    try {
      const result = await fn();
      lastResult = result;

      if (condition(result)) {
        return result;
      }
    } catch (error) {
      // Log error but continue polling
      console.log(
        `[pollUntil] Attempt ${attempts} failed:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  const timeoutMsg =
    options.timeoutMessage ||
    `pollUntil: condition not met after ${maxWait}ms (${attempts} attempts)`;
  throw new Error(
    `${timeoutMsg}\nLast result: ${JSON.stringify(lastResult, null, 2)}`
  );
}

/**
 * Wait for a bank account to reach verified status.
 */
export async function waitForBankAccountVerification(
  client: MagnoliaClient,
  bankAccountId: string,
  maxWait = 120000 // 2 minutes
): Promise<void> {
  await pollUntil(
    async () => {
      const account = (await client.getBankAccount(bankAccountId)) as Record<
        string,
        unknown
      >;
      return account;
    },
    (account) => {
      const state = account.verificationState || account.status;
      return state === "verified" || state === "approved";
    },
    {
      maxWait,
      pollInterval: 5000, // Check every 5 seconds
      timeoutMessage: `Bank account ${bankAccountId} not verified after ${maxWait}ms`,
    }
  );
}

/**
 * Wait for an ACH debit to complete.
 */
export async function waitForAchDebitCompletion(
  getStatusFn: () => Promise<unknown>,
  maxWait = 300000 // 5 minutes (ACH can be slow in test)
): Promise<Record<string, unknown>> {
  return await pollUntil(
    async () => {
      const result = (await getStatusFn()) as Record<string, unknown>;
      return result;
    },
    (result) => {
      const status = result.status;
      return status === "completed" || status === "settled" || status === "done";
    },
    {
      maxWait,
      pollInterval: 10000, // Check every 10 seconds
      timeoutMessage: "ACH debit not completed in time",
    }
  );
}

/**
 * Wait for a trading order to fill.
 */
export async function waitForOrderFill(
  getOrderFn: () => Promise<unknown>,
  maxWait = 60000 // 1 minute
): Promise<Record<string, unknown>> {
  return await pollUntil(
    async () => {
      const order = (await getOrderFn()) as Record<string, unknown>;
      return order;
    },
    (order) => {
      const status = order.status;
      return status === "filled" || status === "done" || status === "settled";
    },
    {
      maxWait,
      pollInterval: 2000, // Check every 2 seconds
      timeoutMessage: "Order not filled in time",
    }
  );
}

/**
 * Wait for a crypto transaction to confirm.
 */
export async function waitForTransactionConfirmation(
  getTransferFn: () => Promise<unknown>,
  minConfirmations = 1,
  maxWait = 600000 // 10 minutes (Bitcoin testnet can be slow)
): Promise<Record<string, unknown>> {
  return await pollUntil(
    async () => {
      const transfer = (await getTransferFn()) as Record<string, unknown>;
      return transfer;
    },
    (transfer) => {
      const status = transfer.status;
      const confirmations = Number(transfer.confirmations || 0);

      return (
        status === "confirmed" ||
        status === "complete" ||
        confirmations >= minConfirmations
      );
    },
    {
      maxWait,
      pollInterval: 15000, // Check every 15 seconds
      timeoutMessage: `Transaction not confirmed after ${maxWait}ms`,
    }
  );
}

/**
 * Wait for a Lightning invoice to be paid.
 */
export async function waitForLightningInvoicePaid(
  getInvoiceFn: () => Promise<unknown>,
  maxWait = 120000 // 2 minutes
): Promise<Record<string, unknown>> {
  return await pollUntil(
    async () => {
      const invoice = (await getInvoiceFn()) as Record<string, unknown>;
      return invoice;
    },
    (invoice) => {
      const status = invoice.status;
      return status === "paid" || status === "settled" || status === "completed";
    },
    {
      maxWait,
      pollInterval: 3000, // Check every 3 seconds
      timeoutMessage: "Lightning invoice not paid in time",
    }
  );
}

/**
 * Wait for KYC identity verification.
 */
export async function waitForKycApproval(
  getIdentityFn: () => Promise<unknown>,
  maxWait = 300000 // 5 minutes
): Promise<Record<string, unknown>> {
  return await pollUntil(
    async () => {
      const identity = (await getIdentityFn()) as Record<string, unknown>;
      return identity;
    },
    (identity) => {
      const status = identity.status || identity.verificationStatus;
      return status === "approved" || status === "verified" || status === "complete";
    },
    {
      maxWait,
      pollInterval: 10000, // Check every 10 seconds
      timeoutMessage: "KYC identity not approved in time",
    }
  );
}

/**
 * Cleanup test resources after tests complete.
 */
export async function cleanupTestResources(client: MagnoliaClient): Promise<{
  deletedBankAccounts: number;
  deletedApiKeys: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let deletedBankAccounts = 0;
  let deletedApiKeys = 0;

  try {
    // Delete test bank accounts
    const bankAccounts = (await client.listBankAccounts()) as {
      bankAccounts?: Array<{ id: string; name: string }>;
    };

    if (bankAccounts.bankAccounts) {
      for (const account of bankAccounts.bankAccounts) {
        if (
          account.name.toLowerCase().includes("test") ||
          account.name.toLowerCase().includes("e2e")
        ) {
          try {
            await client.deleteBankAccount(account.id);
            deletedBankAccounts++;
          } catch (e) {
            errors.push(
              `Failed to delete bank account ${account.id}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      }
    }
  } catch (e) {
    errors.push(
      `Failed to list/delete bank accounts: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  try {
    // Delete test API keys (except current one)
    const currentApiKey = process.env.MAGNOLIA_API_KEY;
    const apiKeys = (await client.listApiKeys()) as Array<{
      id: string;
      apiKey?: string;
      name?: string;
    }>;

    for (const key of apiKeys) {
      const isCurrentKey = key.apiKey === currentApiKey;
      const isTestKey =
        key.name?.toLowerCase().includes("test") ||
        key.name?.toLowerCase().includes("e2e");

      if (!isCurrentKey && isTestKey) {
        try {
          await client.deleteApiKey(key.id);
          deletedApiKeys++;
        } catch (e) {
          errors.push(
            `Failed to delete API key ${key.id}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }
  } catch (e) {
    errors.push(
      `Failed to list/delete API keys: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return { deletedBankAccounts, deletedApiKeys, errors };
}

/**
 * Test fixtures with known-good testnet addresses and amounts.
 */
export const TEST_FIXTURES = {
  // Testnet Bitcoin address (from Bitcoin testnet faucet)
  TBTC_EXTERNAL_ADDRESS: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",

  // Test amounts
  ACH_TEST_AMOUNT: "100.00", // USD
  BTC_SEND_AMOUNT_SATS: "50000", // 0.0005 tBTC
  LN_INVOICE_AMOUNT_SATS: "1000", // 0.00001 tBTC

  // Bank account test data
  // NOTE: API requires ownerAddress object with nested address fields (discovered via E2E testing)
  TEST_BANK_ACCOUNT: {
    type: "ach" as const,
    name: "E2E Test Account",
    ownerName: "Test User",
    accountNumber: "1234567890",
    routingNumber: "021000021", // Chase Bank routing number (valid format)
    currency: "USD",
    shortCountryCode: "US",
    accountType: "checking" as const,
    ownerAddressCountryCode: "US",
    ownerAddress: {
      address_line_1: "123 Test Street",
      city_locality: "San Francisco",
      state_province: "CA",
      postal_code: "94102",
    },
  },

  // Supported testnet coins
  TESTNET_COINS: ["tbtc", "teth"] as const,
};

/**
 * Sleep helper for delays.
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function up to N times with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts || 3;
  const initialDelay = options.initialDelay || 1000;
  const maxDelay = options.maxDelay || 10000;
  const backoffFactor = options.backoffFactor || 2;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt - 1),
        maxDelay
      );

      console.log(
        `[retry] Attempt ${attempt} failed, retrying in ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  throw new Error(
    `Failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}
