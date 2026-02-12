# Missing Integration Tests - Concrete Action Plan

## Summary

**Problem**: Tests pass but engineers report features don't work
**Root Cause**: Tests only verify error paths (400/403/404), not success paths (200/201)
**Solution**: Add 45+ tests covering successful operations and end-to-end flows

---

## Test Gaps by Priority

### 🚨 Priority 1: ACH → Fiat → Bitcoin → Withdrawal Flow

**User's exact complaint**: "ACH like moving money into a bank account, converting that Fiat's into Bitcoin, and then you know actually withdrawing that Bitcoin that flow doesn't really quite work yet"

**Current coverage**: 0 tests for this flow
**Needed**: 1 comprehensive E2E test + breakdown tests

```typescript
// FILE: src/__tests__/e2e-ach-to-bitcoin.integration.test.ts

describe("E2E: ACH → Fiat → Bitcoin → Withdrawal", () => {
  let bankAccountId: string;
  let walletId: string;
  let achDebitId: string;

  // STEP 1: Add Bank Account
  it("should add ACH bank account", async () => {
    const account = await client.addBankAccount({
      type: "ach",
      name: "E2E Test Account",
      ownerName: "Test User",
      accountNumber: "1234567890",
      routingNumber: "021000021",
      currency: "USD",
      shortCountryCode: "US",
    });

    expect(account.id).toBeDefined();
    expect(account.status).toBeDefined(); // pending/verified?
    bankAccountId = account.id;
  });

  // STEP 2: Verify Bank Account (if needed)
  it("should verify bank account is ready for ACH", async () => {
    const account = await client.getBankAccount(bankAccountId);
    expect(account.verificationState).toMatch(/verified|ready/);
  });

  // STEP 3: Accept ACH Agreement
  it("should accept ACH debit agreement", async () => {
    const agreement = await client.getAchAgreement();
    expect(agreement).toBeDefined();
    expect(agreement.text || agreement.termsUrl).toBeDefined();

    const result = await client.acceptAchAgreement({
      bankAccountId,
    });
    expect(result.accepted || result.status).toBe(true || "accepted");
  });

  // STEP 4: Create ACH Debit
  it("should create ACH debit for $100", async () => {
    const debit = await client.createAchDebit({
      bankAccountId,
      amount: "100.00",
      currency: "USD",
    });

    expect(debit.id).toBeDefined();
    expect(debit.status).toMatch(/pending|processing/);
    expect(debit.amount).toBe("100.00");
    achDebitId = debit.id;
  });

  // STEP 5: Poll until ACH Debit Completes
  it("should poll ACH debit until completed", async () => {
    // Real ACH can take 1-3 business days, but test environment should be faster
    const maxWait = 120000; // 2 minutes
    const pollInterval = 5000; // 5 seconds

    const completedDebit = await pollUntil(
      async () => {
        // This endpoint might not exist - need to check API docs
        return await client.getAchDebitStatus?.(achDebitId) ||
               await client.listFiatTransactions(); // might need to list and find
      },
      (result) => result.status === "completed",
      { maxWait, pollInterval }
    );

    expect(completedDebit.status).toBe("completed");
  });

  // STEP 6: Verify Fiat Balance
  it("should show $100 USD fiat balance", async () => {
    // This endpoint might not exist - need to verify
    const balance = await client.getFiatBalance?.("USD") ||
                    await client.getEnterprises(); // might be in enterprise data

    // Need to check response structure
    expect(parseFloat(balance.USD || balance.fiatBalance?.USD || "0"))
      .toBeGreaterThanOrEqual(100.00);
  });

  // STEP 7: Get Trading Account
  it("should have trading account with USD balance", async () => {
    const enterprises = await client.getEnterprises();
    const tradingAccountId = enterprises.tradingAccounts?.[0]?.id;

    if (!tradingAccountId) {
      throw new Error("No trading account - dev environment may not have trading enabled");
    }

    // Currently returns 403 - need trading permissions
    const balances = await client.getTradingBalances(tradingAccountId);
    expect(balances.currencies.USD.available).toBeGreaterThanOrEqual("100.00");
  });

  // STEP 8: Convert USD to BTC
  it("should place market order to buy BTC with USD", async () => {
    const enterprises = await client.getEnterprises();
    const tradingAccountId = enterprises.tradingAccounts?.[0]?.id;

    // Place market buy order for $100 of BTC
    const order = await client.placeOrder(tradingAccountId, {
      type: "market",
      product: "BTC-USD",
      side: "buy",
      quantity: "100.00",
      quantityCurrency: "USD",
    });

    expect(order.id).toBeDefined();
    expect(order.status).toMatch(/pending|filled|open/);
  });

  // STEP 9: Poll until Order Fills
  it("should poll order until filled", async () => {
    const enterprises = await client.getEnterprises();
    const tradingAccountId = enterprises.tradingAccounts?.[0]?.id;

    // Market orders should fill immediately
    const maxWait = 30000; // 30 seconds
    const pollInterval = 1000; // 1 second

    const filledOrder = await pollUntil(
      async () => await client.getOrder(tradingAccountId, order.id),
      (order) => order.status === "filled",
      { maxWait, pollInterval }
    );

    expect(filledOrder.status).toBe("filled");
    expect(filledOrder.filledQuantity).toBeDefined();
    expect(parseFloat(filledOrder.filledQuantity)).toBeGreaterThan(0);
  });

  // STEP 10: Verify BTC appears in Wallet
  it("should show BTC balance in wallet", async () => {
    const wallets = await client.listWallets("tbtc");
    expect(wallets.wallets.length).toBeGreaterThan(0);
    walletId = wallets.wallets[0].id;

    const balances = await client.getAddressBalances("tbtc", walletId);
    const totalSats = parseFloat(balances.total || balances.balance || "0");

    expect(totalSats).toBeGreaterThan(0);
    // Should have ~$100 worth of BTC (exact amount depends on BTC price)
  });

  // STEP 11: Generate External Withdraw Address
  it("should send BTC to external address", async () => {
    const externalAddress = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"; // Testnet address

    const balanceBefore = await client.getAddressBalances("tbtc", walletId);

    const tx = await client.sendTransaction("tbtc", walletId, {
      address: externalAddress,
      amount: "50000", // Send 0.0005 tBTC (50k sats)
    });

    expect(tx.id || tx.txId).toBeDefined();
    expect(tx.status).toMatch(/pending|broadcast|submitted/);
  });

  // STEP 12: Poll until Transaction Confirms
  it("should poll transaction until confirmed", async () => {
    const maxWait = 600000; // 10 minutes (Bitcoin testnet can be slow)
    const pollInterval = 10000; // 10 seconds

    const confirmedTx = await pollUntil(
      async () => await client.getWalletTransfer("tbtc", walletId, tx.id),
      (transfer) => transfer.status === "confirmed" ||
                     transfer.confirmations >= 1,
      { maxWait, pollInterval }
    );

    expect(confirmedTx.status).toBe("confirmed");
    expect(confirmedTx.confirmations).toBeGreaterThanOrEqual(1);
  });

  // STEP 13: Verify Balance Decreased
  it("should show reduced BTC balance after withdrawal", async () => {
    const balanceAfter = await client.getAddressBalances("tbtc", walletId);
    const balanceBefore = /* saved from step 11 */;

    const before = parseFloat(balanceBefore.total);
    const after = parseFloat(balanceAfter.total);

    // Should be reduced by amount + fees
    expect(after).toBeLessThan(before);
    expect(before - after).toBeGreaterThanOrEqual(50000); // At least the amount sent
  });

  // CLEANUP
  afterAll(async () => {
    await client.deleteBankAccount(bankAccountId);
  });
});
```

**Blockers**:
- ⚠️ Dev account currently returns 403 for trading endpoints
- ⚠️ Unknown if dev environment supports ACH simulation
- ⚠️ Unknown if fiat balance endpoint exists
- ⚠️ Need testnet BTC to fund wallet

---

### 🚨 Priority 2: Bank Account Success Paths

**Current**: Only tests error cases (404 for nonexistent, 400 for invalid)
**Needed**: 5 tests for successful bank account operations

```typescript
// FILE: src/__tests__/bank-accounts.success.integration.test.ts

describe("Bank Accounts: Success Paths", () => {
  let testBankAccountId: string;

  it("should add bank account successfully", async () => {
    const account = await client.addBankAccount({
      type: "ach",
      name: "Success Test Account",
      ownerName: "Test User",
      accountNumber: "9876543210",
      routingNumber: "021000021",
      currency: "USD",
      shortCountryCode: "US",
      accountType: "checking",
    });

    expect(account.id).toBeDefined();
    expect(account.name).toBe("Success Test Account");
    expect(account.type).toBe("ach");
    expect(account.currency).toBe("USD");
    testBankAccountId = account.id;
  });

  it("should retrieve bank account by ID", async () => {
    const account = await client.getBankAccount(testBankAccountId);

    expect(account.id).toBe(testBankAccountId);
    expect(account.name).toBe("Success Test Account");
  });

  it("should list bank accounts and find the one we added", async () => {
    const list = await client.listBankAccounts();

    expect(list.bankAccounts).toBeDefined();
    expect(Array.isArray(list.bankAccounts)).toBe(true);

    const found = list.bankAccounts.find(a => a.id === testBankAccountId);
    expect(found).toBeDefined();
    expect(found.name).toBe("Success Test Account");
  });

  it("should update bank account name", async () => {
    const updated = await client.updateBankAccount(testBankAccountId, {
      name: "Updated Test Account",
    });

    expect(updated.name).toBe("Updated Test Account");

    // Verify update persisted
    const retrieved = await client.getBankAccount(testBankAccountId);
    expect(retrieved.name).toBe("Updated Test Account");
  });

  it("should delete bank account successfully", async () => {
    const result = await client.deleteBankAccount(testBankAccountId);
    expect(result.success || result.deleted).toBe(true);

    // Verify it's gone
    try {
      await client.getBankAccount(testBankAccountId);
      expect.unreachable("Should have thrown 404");
    } catch (e) {
      expect((e as Error).message).toContain("404");
    }
  });
});
```

---

### 🚨 Priority 3: Wallet Success Paths

**Current**: Tests only check error paths and path construction
**Needed**: 6 tests for successful wallet operations

```typescript
// FILE: src/__tests__/wallets.success.integration.test.ts

describe("Wallets: Success Paths", () => {
  let walletId: string;
  let addressId: string;

  it("should list tbtc wallets successfully", async () => {
    const result = await client.listWallets("tbtc");

    expect(result.wallets).toBeDefined();
    expect(Array.isArray(result.wallets)).toBe(true);
    expect(result.coin).toBe("tbtc");
    expect(result.wallets.length).toBeGreaterThan(0);

    walletId = result.wallets[0].id;
  });

  it("should get wallet details by ID", async () => {
    const wallet = await client.getWallet("tbtc", walletId);

    expect(wallet.id).toBe(walletId);
    expect(wallet.coin).toBe("tbtc");
    expect(wallet.balance || wallet.addresses).toBeDefined();
  });

  it("should generate new address successfully", async () => {
    const address = await client.generateAddress("tbtc", walletId);

    expect(address.address).toBeDefined();
    expect(address.address).toMatch(/^(tb1|[mn])[a-zA-Z0-9]+$/); // Testnet format
    addressId = address.address;
  });

  it("should list addresses and find generated address", async () => {
    const addresses = await client.listAddresses("tbtc", walletId);

    expect(Array.isArray(addresses)).toBe(true);
    const found = addresses.find(a => a.address === addressId);
    expect(found).toBeDefined();
  });

  it("should get address balances successfully", async () => {
    const balances = await client.getAddressBalances("tbtc", walletId);

    expect(balances).toBeDefined();
    expect(balances.total !== undefined || balances.balance !== undefined).toBe(true);
    // Balance might be 0 if unfunded, but should return structure
  });

  it("should list wallet transfers", async () => {
    const transfers = await client.listWalletTransfers("tbtc", walletId);

    expect(Array.isArray(transfers) || transfers.transfers).toBeDefined();
    // Might be empty array if no transfers yet
  });
});
```

---

### 🔶 Priority 4: Lightning Success Paths

**Current**: Only tests path construction
**Needed**: 4 tests for Lightning operations

```typescript
// FILE: src/__tests__/lightning.success.integration.test.ts

describe("Lightning Network: Success Paths", () => {
  let walletId: string;
  let invoiceHash: string;

  beforeAll(async () => {
    const wallets = await client.listWallets("tbtc");
    walletId = wallets.wallets[0].id;
  });

  it("should create lightning invoice successfully", async () => {
    const invoice = await client.createLightningInvoice(walletId, {
      amount: "1000", // 1000 sats
      memo: "Test invoice",
    });

    expect(invoice.paymentRequest).toBeDefined();
    expect(invoice.paymentRequest).toMatch(/^lntb/); // Testnet LN invoice
    expect(invoice.paymentHash).toBeDefined();
    invoiceHash = invoice.paymentHash;
  });

  it("should retrieve lightning invoice status", async () => {
    const invoice = await client.getLightningInvoice(walletId, invoiceHash);

    expect(invoice.paymentHash).toBe(invoiceHash);
    expect(invoice.status).toMatch(/pending|unpaid|open/);
    expect(invoice.amount).toBe("1000");
  });

  it("should list lightning transactions", async () => {
    const txs = await client.listLightningTransactions(walletId);

    expect(Array.isArray(txs) || txs.transactions).toBeDefined();
    // Should include the invoice we just created
    const found = (txs.transactions || txs).find(
      t => t.paymentHash === invoiceHash
    );
    expect(found).toBeDefined();
  });

  it("should pay lightning invoice (requires funded wallet)", async () => {
    // This test requires:
    // 1. Funded wallet
    // 2. Valid testnet LN invoice to pay
    // 3. Lightning node connectivity

    const testInvoice = "lntb..."; // Need real testnet invoice

    const payment = await client.makeLightningPayment(walletId, {
      invoice: testInvoice,
    });

    expect(payment.paymentHash).toBeDefined();
    expect(payment.status).toMatch(/pending|completed|success/);
  });
});
```

---

### 🔶 Priority 5: Fiat/ACH Success Paths

**Current**: Only tests that endpoints exist and require params
**Needed**: 3 tests for ACH operations

```typescript
// FILE: src/__tests__/fiat-ach.success.integration.test.ts

describe("Fiat/ACH: Success Paths", () => {
  let bankAccountId: string;

  beforeAll(async () => {
    // Setup: Create and verify bank account
    const account = await client.addBankAccount({
      type: "ach",
      name: "Fiat Test Account",
      ownerName: "Test User",
      accountNumber: "1112223333",
      routingNumber: "021000021",
      currency: "USD",
      shortCountryCode: "US",
    });
    bankAccountId = account.id;

    // May need to wait for verification
    await waitForBankAccountVerification(bankAccountId);
  });

  it("should get ACH agreement text", async () => {
    // Current test shows this requires params - check API docs
    const agreement = await client.getAchAgreement({
      amount: "100.00",
      bankAccountId,
    });

    expect(agreement).toBeDefined();
    expect(agreement.text || agreement.termsUrl || agreement.agreement).toBeDefined();
  });

  it("should accept ACH agreement successfully", async () => {
    const result = await client.acceptAchAgreement({
      bankAccountId,
    });

    expect(result.accepted || result.status).toBeTruthy();
  });

  it("should create ACH debit successfully", async () => {
    const debit = await client.createAchDebit({
      bankAccountId,
      amount: "50.00",
      currency: "USD",
    });

    expect(debit.id).toBeDefined();
    expect(debit.amount).toBe("50.00");
    expect(debit.status).toMatch(/pending|processing/);
    expect(debit.bankAccountId).toBe(bankAccountId);
  });

  afterAll(async () => {
    await client.deleteBankAccount(bankAccountId);
  });
});
```

---

### 🔶 Priority 6: Trading Paths (Blocked by 403)

**Current**: All return 403 Forbidden
**Needed**: Request trading-enabled test account, then add 6 tests

```typescript
// FILE: src/__tests__/trading.success.integration.test.ts

describe("Trading: Success Paths (requires trading permissions)", () => {
  let tradingAccountId: string;

  beforeAll(async () => {
    const enterprises = await client.getEnterprises();
    // This will throw 403 until we get trading permissions
    tradingAccountId = enterprises.tradingAccounts?.[0]?.id;

    if (!tradingAccountId) {
      throw new Error("No trading account - skip these tests");
    }
  });

  it("should get trading account balances", async () => {
    const balances = await client.getTradingBalances(tradingAccountId);

    expect(balances.currencies).toBeDefined();
    expect(balances.currencies.USD).toBeDefined();
  });

  it("should list available trading products", async () => {
    const products = await client.getTradingProducts(tradingAccountId);

    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
    expect(products.find(p => p.id === "BTC-USD")).toBeDefined();
  });

  it("should place market buy order", async () => {
    const order = await client.placeOrder(tradingAccountId, {
      type: "market",
      product: "BTC-USD",
      side: "buy",
      quantity: "10.00",
      quantityCurrency: "USD",
    });

    expect(order.id).toBeDefined();
    expect(order.status).toMatch(/pending|filled|open/);
  });

  it("should list orders and find placed order", async () => {
    const orders = await client.listOrders(tradingAccountId);

    expect(Array.isArray(orders) || orders.orders).toBeDefined();
  });

  it("should get specific order details", async () => {
    const orders = await client.listOrders(tradingAccountId);
    const firstOrder = (orders.orders || orders)[0];

    const order = await client.getOrder(tradingAccountId, firstOrder.id);

    expect(order.id).toBe(firstOrder.id);
    expect(order.status).toBeDefined();
  });

  it("should cancel pending order", async () => {
    // Place a limit order (won't fill immediately)
    const order = await client.placeOrder(tradingAccountId, {
      type: "limit",
      product: "BTC-USD",
      side: "buy",
      quantity: "10.00",
      quantityCurrency: "USD",
      limitPrice: "1.00", // Way below market
    });

    const result = await client.cancelOrder(tradingAccountId, order.id);

    expect(result.status || result.cancelled).toBe("cancelled" || true);
  });
});
```

---

## Test Infrastructure Needed

### Polling Helper

```typescript
// FILE: src/__tests__/test-utils.ts

export async function pollUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: {
    maxWait?: number;      // Max time to wait (ms)
    pollInterval?: number; // Time between polls (ms)
    timeout?: number;      // Alias for maxWait
  } = {}
): Promise<T> {
  const maxWait = options.maxWait || options.timeout || 30000;
  const pollInterval = options.pollInterval || 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const result = await fn();
    if (condition(result)) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`pollUntil: condition not met after ${maxWait}ms`);
}

export async function waitForBankAccountVerification(
  client: MagnoliaClient,
  bankAccountId: string,
  maxWait = 120000
): Promise<void> {
  await pollUntil(
    () => client.getBankAccount(bankAccountId),
    (account) => account.verificationState === "verified",
    { maxWait }
  );
}
```

### Test Fixtures

```typescript
// FILE: src/__tests__/fixtures.ts

/**
 * Real IDs from dev environment - update these after setup
 */
export const FIXTURES = {
  // Fill these in after manual setup in dev environment
  VERIFIED_BANK_ACCOUNT_ID: "bank_abc123",
  FUNDED_WALLET_ID: "wallet_xyz789",
  TRADING_ACCOUNT_ID: "trading_acc_456",

  // Testnet addresses
  EXTERNAL_TBTC_ADDRESS: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",

  // Test amounts
  ACH_TEST_AMOUNT: "100.00",
  BTC_SEND_AMOUNT: "50000", // sats
  LN_INVOICE_AMOUNT: "1000", // sats
};
```

### Cleanup Helpers

```typescript
// FILE: src/__tests__/cleanup.ts

export async function cleanupTestResources(client: MagnoliaClient) {
  // Delete all test bank accounts
  const accounts = await client.listBankAccounts();
  for (const account of accounts.bankAccounts) {
    if (account.name.includes("Test")) {
      await client.deleteBankAccount(account.id);
    }
  }

  // Delete all test API keys (except the one we're using)
  const keys = await client.listApiKeys();
  for (const key of keys) {
    if (key.name?.includes("Test") && key.id !== process.env.MAGNOLIA_API_KEY_ID) {
      await client.deleteApiKey(key.id);
    }
  }
}
```

---

## Summary of Missing Tests

| Category | Current Tests | Needed Tests | Blocker |
|----------|--------------|--------------|---------|
| ACH E2E Flow | 0 | 13 | Trading 403, Unknown ACH support |
| Bank Accounts Success | 0 | 5 | None |
| Wallets Success | 0 | 6 | None |
| Lightning Success | 0 | 4 | Need funded wallet |
| Fiat/ACH Success | 0 | 3 | Need verified bank |
| Trading Success | 0 | 6 | Need trading permissions (403) |
| **Total** | **125** | **+37** | **- Multiple -** |

---

## Next Steps

1. **Verify API capabilities** in dev environment:
   - Can dev environment simulate ACH debits?
   - Can we fund testnet wallet via faucet?
   - Can we get trading permissions enabled?

2. **Manual test** the full flow:
   - Document exact failure point
   - Capture actual error messages
   - Determine if bug is API or test environment

3. **Implement tests in order**:
   - Start with Priority 2 (Bank Accounts) - no blockers
   - Then Priority 3 (Wallets) - no blockers
   - Then Priority 4 (Lightning) - needs funded wallet
   - Then Priority 5 (Fiat/ACH) - needs verified bank
   - Finally Priority 1 (E2E) - needs all above working
   - Finally Priority 6 (Trading) - needs permissions

4. **Request from Magnolia team**:
   - Trading permissions for dev account
   - ACH simulation in test environment
   - Funded testnet wallet
   - Documentation on fiat balance endpoints
