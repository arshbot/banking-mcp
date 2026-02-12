# MCP Server Integration Tests Audit Report

**Date**: 2026-02-10
**Status**: ⚠️ CRITICAL GAPS IDENTIFIED
**Test Suite**: 125 tests, all passing

## Executive Summary

**The tests pass, but they don't test the actual functionality.** The current test suite is primarily a **smoke test** that verifies:
- API endpoints exist (return something other than 404)
- Authentication works (not getting 401)
- Input validation rejects bad data (returns 400)
- Permission errors return 403

**What's missing**: Tests that verify the actual business logic works end-to-end. Engineers report the ACH → Fiat → Bitcoin → Withdrawal flow doesn't work, but our tests claim everything passes because they only test error paths, not success paths.

---

## What the Tests ARE Testing ✅

### 1. Authentication (14 tests)
- ✅ Login with email/password
- ✅ JWT token generation
- ✅ API key creation/listing/deletion
- ✅ Logout
- ✅ Auth header validation
- ✅ Cloudflare User-Agent requirement

### 2. API Path Correctness (26 tests)
- ✅ Documented endpoints return non-404 status codes
- ✅ Path construction is correct (verified in error messages)
- ✅ Undocumented `/trade/*` paths correctly 404
- ✅ Auth bugs #658/#660 are fixed upstream

### 3. Edge Cases & Security (30 tests)
- ✅ SQL injection rejection
- ✅ XSS attempt rejection
- ✅ Path traversal rejection
- ✅ Invalid routing numbers rejected
- ✅ Missing required fields rejected
- ✅ Malformed JSON rejected
- ✅ Rate limiting doesn't crash server

### 4. Client Method Path Construction (36 tests)
- ✅ MagnoliaClient constructs correct API paths
- ✅ Query parameters are formatted correctly
- ✅ POST/PUT/DELETE methods use correct HTTP verbs

### 5. Error Handling (19 tests)
- ✅ 403 Forbidden for trading (dev account lacks permissions)
- ✅ 400 CoinUnsupported for btc/eth on testnet
- ✅ 404 for nonexistent resources
- ✅ 401 for invalid API keys

---

## What the Tests ARE NOT Testing ❌ (CRITICAL GAPS)

### 1. **End-to-End Flows** 🚨 HIGHEST PRIORITY

The user specifically mentioned: "ACH like moving money into a bank account, converting that Fiat's into Bitcoin, and then you know actually withdrawing that Bitcoin that flow doesn't really quite work yet"

**Current coverage**: ZERO end-to-end flow tests

**Missing tests**:
```
TEST: ACH → Fiat → Bitcoin → Withdrawal Flow
1. Add a real bank account
2. Accept ACH agreement
3. Create ACH debit for $100
4. Wait/poll for fiat balance to update
5. Convert $100 USD to Bitcoin via trading
6. Verify Bitcoin wallet balance increased
7. Send Bitcoin to external address
8. Verify balance decreased
9. Check withdrawal status

EXPECTED: Flow completes successfully
ACTUAL: Engineers report this doesn't work
TEST STATUS: Not tested - tests only check error paths
```

### 2. **Successful Operations** 🚨 HIGH PRIORITY

Almost all tests intentionally trigger errors (400, 403, 404). Very few test successful operations.

**Examples of missing success tests**:

#### Bank Accounts
- ❌ Add a real bank account (test only checks it rejects invalid input)
- ❌ Verify bank account successfully
- ❌ Update bank account name/details
- ❌ List bank accounts and verify the one we added appears

#### Crypto Wallets
- ❌ Create a new wallet
- ❌ Generate a receive address
- ❌ Fund wallet and verify balance increases
- ❌ Send transaction successfully
- ❌ Check transaction status until confirmed

#### Fiat Operations
- ❌ Accept ACH agreement successfully
- ❌ Create ACH debit and verify it's pending
- ❌ Poll ACH debit status until completed
- ❌ Verify fiat balance increased after ACH clears

#### Trading
- ❌ Cannot test at all - dev account returns 403
- ❌ No tests with trading-enabled account
- ❌ No tests for quote generation
- ❌ No tests for order placement/cancellation
- ❌ No tests for order fills

#### Lightning
- ❌ Create invoice successfully
- ❌ Pay invoice successfully
- ❌ Verify lightning transaction appears in history

### 3. **State Verification** 🚨 HIGH PRIORITY

Tests don't verify that operations actually change state.

**Missing verifications**:
- ❌ Balances change after deposits/withdrawals
- ❌ Bank account status changes after verification
- ❌ Wallet addresses appear in list after generation
- ❌ Transactions appear in history after sending
- ❌ ACH debit status transitions (pending → processing → completed)

### 4. **Real Data Scenarios** 🚨 MEDIUM PRIORITY

Tests use fake IDs and expect errors. No tests with real data.

**Missing scenarios**:
- ❌ Add real bank account with valid routing number
- ❌ Create wallet for supported coins (tbtc works, but no wallet creation test)
- ❌ Generate and use real addresses
- ❌ Test with actual testnet faucet funds

### 5. **Integration Between Services** 🚨 HIGH PRIORITY

No tests that chain operations across different API services.

**Missing integration tests**:
- ❌ Fiat → Trading: Convert USD to BTC via trading API
- ❌ Trading → Wallet: Verify trading balance appears in wallet
- ❌ Bank → Fiat: ACH debit to fiat balance
- ❌ Fiat → Bank: Fiat withdrawal to bank account
- ❌ Wallet → Lightning: Bitcoin to Lightning conversion

### 6. **Polling & Async Operations**

Many operations are async but tests don't handle this.

**Missing async tests**:
- ❌ Poll wallet transfer until confirmed
- ❌ Poll ACH debit until completed
- ❌ Poll bank account verification status
- ❌ Poll lightning invoice until paid
- ❌ Poll trading order until filled

### 7. **Cleanup & Idempotency**

Tests create API keys but memory notes say "Dev API keys get accumulated during testing — always clean up after test runs"

**Missing cleanup**:
- ❌ Delete test bank accounts after tests
- ❌ Cancel test orders after tests
- ⚠️ Some API key cleanup exists but not comprehensive

### 8. **Error Recovery**

No tests for error recovery scenarios.

**Missing error tests**:
- ❌ What happens if ACH debit fails?
- ❌ What happens if Bitcoin send fails (insufficient funds)?
- ❌ What happens if trading order is rejected?
- ❌ Can you cancel a pending ACH debit?

---

## Why Tests Pass But Features Don't Work

### The Pattern

```typescript
// Current test pattern (checking error paths only):
it("createAchDebit — should throw error", async () => {
  try {
    await client.createAchDebit({
      bankAccountId: "test-bank",  // ← Fake ID
      amount: "100.00",
      currency: "USD",
    });
    expect.unreachable("Should have thrown");
  } catch (e) {
    // ✅ Test passes because it got an error
    expect(msg).toContain("POST");
    expect(msg).toContain("/api/fiat/v1/transaction/ach-debit");
  }
});

// What we SHOULD be testing:
it("createAchDebit — should create pending ACH debit", async () => {
  // Use real bank account ID from setup
  const realBankId = testContext.verifiedBankAccountId;

  const result = await client.createAchDebit({
    bankAccountId: realBankId,
    amount: "100.00",
    currency: "USD",
  });

  // ✅ Verify success response
  expect(result.status).toBe("pending");
  expect(result.amount).toBe("100.00");

  // ✅ Poll until completed
  const completed = await pollUntil(
    () => client.getAchDebitStatus(result.id),
    (status) => status !== "pending",
    { timeout: 60000 }
  );

  expect(completed.status).toBe("completed");

  // ✅ Verify fiat balance increased
  const balance = await client.getFiatBalance("USD");
  expect(balance).toBeGreaterThanOrEqual(100.00);
});
```

### Root Cause

1. **Tests verify API surface, not business logic**
   - Check that endpoints exist
   - Check that errors are formatted correctly
   - Don't check that operations succeed

2. **Tests use fake data intentionally**
   - Fake bank account IDs → expect 404
   - Fake wallet IDs → expect 404
   - Fake order IDs → expect 404
   - Tests pass when they get the expected error

3. **No real accounts in test environment**
   - Dev environment might lack:
     - Verified bank accounts
     - Funded wallets
     - Trading permissions (confirmed: 403 Forbidden)

4. **Tests don't chain operations**
   - Each test is isolated
   - No "add bank account, then use it" flows
   - No "fund wallet, then send transaction" flows

---

## Recommended Test Additions

### Phase 1: Basic Success Paths (1-2 days)

```typescript
// 1. Bank Account Lifecycle
describe("Bank Account Flow", () => {
  it("should add, verify, and use a bank account", async () => {
    // Add bank account
    const account = await client.addBankAccount({
      type: "ach",
      name: "Test Checking",
      ownerName: "Test User",
      accountNumber: "123456789",
      routingNumber: "021000021",
      currency: "USD",
      shortCountryCode: "US",
    });

    expect(account.id).toBeDefined();

    // Verify it appears in list
    const list = await client.listBankAccounts();
    const found = list.bankAccounts.find(b => b.id === account.id);
    expect(found).toBeDefined();

    // Clean up
    await client.deleteBankAccount(account.id);
  });
});

// 2. Wallet Operations
describe("Wallet Operations", () => {
  let walletId: string;

  it("should create wallet and generate address", async () => {
    const wallets = await client.listWallets("tbtc");
    expect(wallets.wallets.length).toBeGreaterThan(0);
    walletId = wallets.wallets[0].id;

    const address = await client.generateAddress("tbtc", walletId);
    expect(address.address).toBeDefined();
    expect(address.address).toMatch(/^(tb1|[mn])[a-zA-Z0-9]+$/);
  });

  it("should list addresses and show generated address", async () => {
    const addresses = await client.listAddresses("tbtc", walletId);
    expect(addresses.length).toBeGreaterThan(0);
  });
});

// 3. Lightning Operations
describe("Lightning Network", () => {
  it("should create and check invoice", async () => {
    const wallets = await client.listWallets("tbtc");
    const walletId = wallets.wallets[0].id;

    const invoice = await client.createLightningInvoice(walletId, {
      amount: "1000",
      memo: "Test invoice",
    });

    expect(invoice.paymentRequest).toBeDefined();
    expect(invoice.paymentHash).toBeDefined();

    // Check status
    const status = await client.getLightningInvoice(
      walletId,
      invoice.paymentHash
    );
    expect(status.status).toBe("pending");
  });
});
```

### Phase 2: End-to-End Flows (2-3 days)

```typescript
describe("ACH → Fiat → Bitcoin Flow", () => {
  let bankAccountId: string;
  let walletId: string;

  beforeAll(async () => {
    // Setup: Add and verify bank account
    const account = await client.addBankAccount({
      type: "ach",
      name: "Test Account",
      ownerName: "Test User",
      accountNumber: "123456789",
      routingNumber: "021000021",
      currency: "USD",
      shortCountryCode: "US",
    });
    bankAccountId = account.id;

    // Get wallet
    const wallets = await client.listWallets("tbtc");
    walletId = wallets.wallets[0].id;
  });

  it("should pull funds via ACH", async () => {
    // Accept agreement
    await client.acceptAchAgreement({ bankAccountId });

    // Create ACH debit
    const debit = await client.createAchDebit({
      bankAccountId,
      amount: "100.00",
      currency: "USD",
    });

    expect(debit.id).toBeDefined();
    expect(debit.status).toBe("pending");

    // In real test, would poll until completed
    // For now, just verify it was created
  });

  it("should convert USD to BTC", async () => {
    // This requires trading permissions (currently 403)
    // Will need a trading-enabled test account

    // Get trading account
    const enterprises = await client.getEnterprises();
    const tradingAccountId = enterprises.tradingAccounts[0].id;

    // Place market order
    const order = await client.placeOrder(tradingAccountId, {
      type: "market",
      product: "BTC-USD",
      side: "buy",
      quantity: "100",
      quantityCurrency: "USD",
    });

    expect(order.id).toBeDefined();
    expect(order.status).toMatch(/pending|filled/);
  });

  it("should withdraw BTC to external address", async () => {
    const initialBalance = await client.getAddressBalances("tbtc", walletId);

    const tx = await client.sendTransaction("tbtc", walletId, {
      address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      amount: "100000", // 0.001 tBTC in satoshis
    });

    expect(tx.txId).toBeDefined();
    expect(tx.status).toBe("pending");

    // Poll until confirmed
    const transfer = await pollForConfirmation(
      () => client.getWalletTransfer("tbtc", walletId, tx.id),
      30000
    );

    expect(transfer.status).toBe("confirmed");

    // Verify balance decreased
    const newBalance = await client.getAddressBalances("tbtc", walletId);
    expect(Number(newBalance.total)).toBeLessThan(Number(initialBalance.total));
  });

  afterAll(async () => {
    // Cleanup
    await client.deleteBankAccount(bankAccountId);
  });
});
```

### Phase 3: Error & Edge Cases (1-2 days)

```typescript
describe("Error Handling & Recovery", () => {
  it("should reject ACH debit with insufficient funds", async () => {
    // Test error scenarios that could actually happen
  });

  it("should handle double-spend attempts", async () => {
    // Try to send same Bitcoin twice
  });

  it("should handle network failures gracefully", async () => {
    // Test retry logic, timeouts
  });
});
```

---

## Environment Requirements for Full Testing

To test the complete flow, we need:

### 1. Test Environment Setup
- ✅ Dev API access (have this)
- ✅ Test account with API key (have this)
- ⚠️ Verified bank account in test environment (need this)
- ⚠️ Trading permissions enabled (currently 403 - need this)
- ⚠️ Funded testnet wallet (need this)
- ⚠️ KYC approved identity (need this)

### 2. External Resources
- ⚠️ Testnet Bitcoin faucet for funding wallets
- ⚠️ Test bank account simulator (for ACH testing)
- ⚠️ Lightning testnet node (for LN testing)

### 3. Test Infrastructure
- ❌ Polling helpers for async operations
- ❌ Test data factory for creating accounts/wallets
- ❌ Cleanup helpers to prevent resource accumulation
- ❌ Test fixtures with real IDs

---

## Immediate Action Items

### Priority 1: Understand Current Failures
1. **Manual testing**: Run the ACH → Fiat → Bitcoin flow manually
   - Document exactly which step fails
   - Capture error messages
   - Identify if it's:
     - API bug
     - Permission issue
     - Test environment limitation
     - Integration bug between services

### Priority 2: Add Success Path Tests
2. **Bank accounts**: Test adding/listing/deleting with real data
3. **Wallets**: Test address generation with tbtc (which works)
4. **Lightning**: Test invoice creation (might work)

### Priority 3: Request Environment Access
5. **Trading permissions**: Request trading-enabled test account
6. **Funded wallet**: Get testnet BTC in test wallet
7. **Verified bank**: Add and verify test bank account

### Priority 4: Build Test Infrastructure
8. **Polling utilities**: Helper to wait for async operations
9. **Test fixtures**: Real IDs from test environment
10. **Cleanup automation**: Delete test resources after runs

---

## Conclusion

**Current test suite is good for**:
- ✅ Verifying API paths are correct
- ✅ Verifying auth works
- ✅ Catching input validation bugs
- ✅ Preventing regressions in error handling

**Current test suite does NOT verify**:
- ❌ Operations complete successfully
- ❌ State changes as expected
- ❌ End-to-end flows work
- ❌ Services integrate correctly

**Recommendation**: The engineers are correct. The tests pass because they only test error paths. We need to add success path testing and end-to-end flow testing to catch the actual bugs they're experiencing.

**Estimated effort to achieve full coverage**:
- Phase 1 (Basic Success): 1-2 days
- Phase 2 (E2E Flows): 2-3 days
- Phase 3 (Error Cases): 1-2 days
- **Total**: ~1 week of focused testing work

Plus time to coordinate with Magnolia team for:
- Trading permissions in dev environment
- Funded testnet wallets
- Verified bank account setup
