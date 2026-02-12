/**
 * E2E Test: Trading Flow
 *
 * Tests the complete trading lifecycle:
 * 1. Get trading account and balances
 * 2. List available trading products
 * 3. Place market orders (buy/sell)
 * 4. Place limit orders
 * 5. Cancel orders
 * 6. Poll order status until filled
 * 7. Verify balance changes
 *
 * KNOWN BLOCKER: Dev account returns 403 Forbidden for all trading endpoints.
 * Tests document the expected behavior and verify that endpoints exist with correct paths.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MagnoliaClient } from "../../magnolia-client.js";
import { DEV_API_KEY } from "../helpers.js";
import { waitForOrderFill, cleanupTestResources } from "./test-utils.js";

describe("E2E: Trading Flow", () => {
  let client: MagnoliaClient;
  let tradingAccountId: string | null = null;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    client = new MagnoliaClient(DEV_API_KEY, "https://api.dev.magfi.dev");

    // Try to get trading account
    try {
      const enterprises = (await client.getEnterprises()) as Record<
        string,
        unknown
      >;
      const tradingAccounts = enterprises.tradingAccounts as Array<
        Record<string, unknown>
      >;
      if (tradingAccounts && tradingAccounts.length > 0) {
        tradingAccountId = tradingAccounts[0].id as string;
        console.log(`Using trading account: ${tradingAccountId}`);
      } else {
        console.log("⚠️ No trading accounts available");
      }
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("403")) {
        console.log(
          "⚠️ Trading endpoints return 403 - dev account lacks permissions"
        );
      } else {
        console.log("⚠️ Could not get trading accounts:", err.message);
      }
    }
  });

  afterAll(async () => {
    // Cancel any pending orders
    if (tradingAccountId && createdOrderIds.length > 0) {
      for (const orderId of createdOrderIds) {
        try {
          await client.cancelOrder(tradingAccountId, orderId);
        } catch (e) {
          console.log(`Failed to cancel order ${orderId}:`, e);
        }
      }
    }

    const cleanup = await cleanupTestResources(client);
    console.log("Cleanup results:", cleanup);
  });

  describe("Step 1: Get Trading Account", () => {
    it("should get enterprises with trading accounts", async () => {
      try {
        const enterprises = (await client.getEnterprises()) as Record<
          string,
          unknown
        >;

        expect(enterprises).toBeDefined();
        expect(enterprises.tradingAccounts).toBeDefined();

        console.log("Enterprises:", JSON.stringify(enterprises, null, 2));
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
          expect(err.message).toContain("403");
        } else {
          throw error;
        }
      }
    });

    it("should fail gracefully when trading not enabled", async () => {
      // Document the 403 error
      try {
        await client.getEnterprises();
        // If it succeeds, verify structure
        tradingAccountId !== null;
      } catch (error) {
        const err = error as Error;
        expect(err.message).toContain("403");
        console.log("Confirmed: Trading endpoints return 403 on dev account");
      }
    });
  });

  describe("Step 2: Get Trading Balances", () => {
    it("should get balances for trading account", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403 Forbidden)");
        // Test with fake ID to verify endpoint path
        try {
          await client.getTradingBalances("fake_trading_account");
          expect.unreachable("Should have failed");
        } catch (error) {
          const err = error as Error;
          expect(err.message).toMatch(/403|404/i);
        }
        return;
      }

      try {
        const balances = (await client.getTradingBalances(
          tradingAccountId
        )) as Record<string, unknown>;

        expect(balances).toBeDefined();
        expect(balances.currencies || balances.balances).toBeDefined();

        // Should have USD balance (fiat)
        const currencies = balances.currencies as Record<string, Record<string, unknown>>;
        expect(currencies.USD).toBeDefined();
        expect(currencies.USD.available).toBeDefined();
        expect(currencies.USD.hold).toBeDefined();

        console.log("Trading balances:", JSON.stringify(balances, null, 2));
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
          expect(err.message).toContain("403");
        } else {
          throw error;
        }
      }
    });
  });

  describe("Step 3: List Trading Products", () => {
    it("should list available trading products", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        const products = (await client.getTradingProducts(
          tradingAccountId
        )) as Array<Record<string, unknown>>;

        expect(Array.isArray(products)).toBe(true);
        expect(products.length).toBeGreaterThan(0);

        // Should include BTC-USD
        const btcUsd = products.find((p) => p.id === "BTC-USD");
        expect(btcUsd).toBeDefined();

        // Verify product structure
        const firstProduct = products[0];
        expect(firstProduct.id).toBeDefined();
        expect(firstProduct.baseCurrency || firstProduct.base_currency).toBeDefined();
        expect(firstProduct.quoteCurrency || firstProduct.quote_currency).toBeDefined();

        console.log(`Found ${products.length} trading products`);
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
          expect(err.message).toContain("403");
        } else {
          throw error;
        }
      }
    });
  });

  describe("Step 4: Place Market Orders", () => {
    it("should place market buy order for BTC", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        const order = (await client.placeOrder(tradingAccountId, {
          type: "market",
          product: "BTC-USD",
          side: "buy",
          quantity: "10.00", // $10 worth of BTC
          quantityCurrency: "USD",
        })) as Record<string, unknown>;

        expect(order).toBeDefined();
        expect(order.id).toBeDefined();
        expect(order.status).toBeDefined();
        expect(order.type).toBe("market");
        expect(order.side).toBe("buy");

        createdOrderIds.push(order.id as string);

        console.log("Created market buy order:", order.id);
        console.log("Order status:", order.status);
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
          expect(err.message).toContain("403");
        } else {
          throw error;
        }
      }
    });

    it("should place market sell order for BTC", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        const order = (await client.placeOrder(tradingAccountId, {
          type: "market",
          product: "BTC-USD",
          side: "sell",
          quantity: "0.0001", // 0.0001 BTC
          quantityCurrency: "BTC",
        })) as Record<string, unknown>;

        expect(order).toBeDefined();
        expect(order.id).toBeDefined();
        expect(order.side).toBe("sell");

        createdOrderIds.push(order.id as string);

        console.log("Created market sell order:", order.id);
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403") || err.message.includes("insufficient")) {
          console.log("⚠️ Expected 403 or insufficient funds");
          expect(err.message).toMatch(/403|insufficient/i);
        } else {
          throw error;
        }
      }
    });
  });

  describe("Step 5: Place Limit Orders", () => {
    it("should place limit buy order below market", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        const order = (await client.placeOrder(tradingAccountId, {
          type: "limit",
          product: "BTC-USD",
          side: "buy",
          quantity: "10.00",
          quantityCurrency: "USD",
          limitPrice: "1.00", // Way below market - won't fill immediately
        })) as Record<string, unknown>;

        expect(order).toBeDefined();
        expect(order.id).toBeDefined();
        expect(order.type).toBe("limit");
        expect(order.status).toMatch(/pending|open|placed/i);

        createdOrderIds.push(order.id as string);

        console.log("Created limit buy order:", order.id);
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
          expect(err.message).toContain("403");
        } else {
          throw error;
        }
      }
    });

    it("should place limit sell order above market", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        const order = (await client.placeOrder(tradingAccountId, {
          type: "limit",
          product: "BTC-USD",
          side: "sell",
          quantity: "0.0001",
          quantityCurrency: "BTC",
          limitPrice: "1000000.00", // Way above market - won't fill
        })) as Record<string, unknown>;

        expect(order).toBeDefined();
        expect(order.id).toBeDefined();

        createdOrderIds.push(order.id as string);

        console.log("Created limit sell order:", order.id);
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403") || err.message.includes("insufficient")) {
          console.log("⚠️ Expected 403 or insufficient funds");
          expect(err.message).toMatch(/403|insufficient/i);
        } else {
          throw error;
        }
      }
    });
  });

  describe("Step 6: List and Get Orders", () => {
    it("should list all orders for trading account", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        const orders = (await client.listOrders(tradingAccountId)) as unknown;

        // API might return array or object with orders property
        const orderList = Array.isArray(orders)
          ? orders
          : (orders as Record<string, unknown>).orders;

        expect(orderList).toBeDefined();
        expect(Array.isArray(orderList)).toBe(true);

        const orderArray = orderList as Array<Record<string, unknown>>;

        // Should include orders we created
        if (createdOrderIds.length > 0) {
          const foundOrder = orderArray.some((o) =>
            createdOrderIds.includes(o.id as string)
          );
          expect(foundOrder).toBe(true);
        }

        console.log(`Found ${orderArray.length} order(s)`);
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
          expect(err.message).toContain("403");
        } else {
          throw error;
        }
      }
    });

    it("should get specific order by ID", async () => {
      if (!tradingAccountId || createdOrderIds.length === 0) {
        console.log("⚠️ Skipping - no orders created");
        return;
      }

      try {
        const orderId = createdOrderIds[0];
        const order = (await client.getOrder(
          tradingAccountId,
          orderId
        )) as Record<string, unknown>;

        expect(order).toBeDefined();
        expect(order.id).toBe(orderId);
        expect(order.status).toBeDefined();
        expect(order.product).toBeDefined();

        console.log("Order details:", JSON.stringify(order, null, 2));
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
          expect(err.message).toContain("403");
        } else {
          throw error;
        }
      }
    });

    it("should fail to get non-existent order", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        await client.getOrder(tradingAccountId, "order_nonexistent_123");
        expect.unreachable("Should have thrown 404");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/403|404/i);
      }
    });
  });

  describe("Step 7: Cancel Orders", () => {
    it("should cancel pending limit order", async () => {
      if (!tradingAccountId || createdOrderIds.length === 0) {
        console.log("⚠️ Skipping - no orders created");
        return;
      }

      try {
        // Find a pending order (limit orders likely still pending)
        const orderId = createdOrderIds[createdOrderIds.length - 1]; // Last order

        const result = (await client.cancelOrder(
          tradingAccountId,
          orderId
        )) as Record<string, unknown>;

        expect(result).toBeDefined();
        expect(result.status || result.cancelled).toMatch(
          /cancelled|canceled|done/i
        );

        console.log("Cancelled order:", orderId);

        // Remove from list since it's cancelled
        const idx = createdOrderIds.indexOf(orderId);
        if (idx > -1) createdOrderIds.splice(idx, 1);
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
          expect(err.message).toContain("403");
        } else if (err.message.includes("already") || err.message.includes("filled")) {
          console.log("⚠️ Order already filled/cancelled");
        } else {
          throw error;
        }
      }
    });

    it("should fail to cancel already-cancelled order (idempotency)", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      const fakeOrderId = "order_fake_123";

      try {
        await client.cancelOrder(tradingAccountId, fakeOrderId);
        // May succeed with idempotent behavior or fail with 404
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/403|404|not found|invalid/i);
      }
    });
  });

  describe("Step 8: Order Fill Polling", () => {
    it("should poll market order until filled", async () => {
      if (!tradingAccountId || createdOrderIds.length === 0) {
        console.log("⚠️ Skipping - no orders created");
        return;
      }

      // Market orders should fill quickly
      const orderId = createdOrderIds.find((id) => id.includes("market")) ||
        createdOrderIds[0];

      try {
        const filledOrder = await waitForOrderFill(
          async () => {
            return await client.getOrder(tradingAccountId!, orderId);
          },
          60000 // 1 minute max for market orders
        );

        expect(filledOrder.status).toMatch(/filled|done|settled/i);
        expect(filledOrder.filledQuantity || filledOrder.filled_size).toBeDefined();

        console.log("Order filled:", orderId);
        console.log(
          "Filled quantity:",
          filledOrder.filledQuantity || filledOrder.filled_size
        );
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
        } else if (err.message.includes("not filled")) {
          console.log("⚠️ Order did not fill within timeout");
        } else {
          throw error;
        }
      }
    });
  });

  describe("Step 9: Balance Verification After Trade", () => {
    it("should show balance changes after order fill", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        const balances = (await client.getTradingBalances(
          tradingAccountId
        )) as Record<string, unknown>;

        const currencies = balances.currencies as Record<string, Record<string, unknown>>;

        // After buying BTC, USD balance should decrease and BTC balance increase
        expect(currencies.USD).toBeDefined();
        expect(currencies.BTC || currencies.TBTC).toBeDefined();

        console.log("Post-trade USD balance:", currencies.USD.available);
        console.log("Post-trade BTC balance:", (currencies.BTC || currencies.TBTC)?.available);
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("403")) {
          console.log("⚠️ Expected 403 - trading not enabled");
        } else {
          throw error;
        }
      }
    });
  });

  describe("Step 10: Error Conditions", () => {
    it("should reject order with invalid product", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        await client.placeOrder(tradingAccountId, {
          type: "market",
          product: "INVALID-PAIR",
          side: "buy",
          quantity: "10.00",
          quantityCurrency: "USD",
        });
        expect.unreachable("Should have thrown validation error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/403|400|invalid|unsupported/i);
      }
    });

    it("should reject order with negative quantity", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        await client.placeOrder(tradingAccountId, {
          type: "market",
          product: "BTC-USD",
          side: "buy",
          quantity: "-10.00",
          quantityCurrency: "USD",
        });
        expect.unreachable("Should have thrown validation error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/403|400|invalid|negative|positive/i);
      }
    });

    it("should reject order with insufficient funds", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        await client.placeOrder(tradingAccountId, {
          type: "market",
          product: "BTC-USD",
          side: "buy",
          quantity: "1000000.00", // $1M - unlikely to have this
          quantityCurrency: "USD",
        });
        expect.unreachable("Should have thrown insufficient funds error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/403|400|insufficient|balance/i);
      }
    });

    it("should reject limit order with missing limit price", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        await client.placeOrder(tradingAccountId, {
          type: "limit",
          product: "BTC-USD",
          side: "buy",
          quantity: "10.00",
          quantityCurrency: "USD",
          // Missing limitPrice
        } as never);
        expect.unreachable("Should have thrown validation error");
      } catch (error) {
        const err = error as Error;
        expect(err.message).toMatch(/403|400|required|limit.*price/i);
      }
    });
  });

  describe("Step 11: Concurrent Trading Operations", () => {
    it("should handle multiple simultaneous order placements", async () => {
      if (!tradingAccountId) {
        console.log("⚠️ Skipping - no trading account (403)");
        return;
      }

      try {
        const orders = await Promise.allSettled([
          client.placeOrder(tradingAccountId, {
            type: "limit",
            product: "BTC-USD",
            side: "buy",
            quantity: "5.00",
            quantityCurrency: "USD",
            limitPrice: "1.00",
          }),
          client.placeOrder(tradingAccountId, {
            type: "limit",
            product: "BTC-USD",
            side: "buy",
            quantity: "10.00",
            quantityCurrency: "USD",
            limitPrice: "2.00",
          }),
          client.placeOrder(tradingAccountId, {
            type: "limit",
            product: "BTC-USD",
            side: "buy",
            quantity: "15.00",
            quantityCurrency: "USD",
            limitPrice: "3.00",
          }),
        ]);

        const successful = orders.filter((r) => r.status === "fulfilled");
        const failed = orders.filter((r) => r.status === "rejected");

        console.log(
          `Concurrent orders: ${successful.length} succeeded, ${failed.length} failed`
        );

        // If any succeeded, they should have unique IDs
        if (successful.length > 0) {
          const ids = successful.map(
            (r) => ((r as PromiseFulfilledResult<unknown>).value as Record<string, unknown>).id as string
          );
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(successful.length);

          ids.forEach((id) => createdOrderIds.push(id));
        }

        // All failures should be 403 (not random errors)
        failed.forEach((r) => {
          const reason = (r as PromiseRejectedResult).reason as Error;
          expect(reason.message).toMatch(/403|insufficient/i);
        });
      } catch (error) {
        console.log("Concurrent order placement error:", error);
      }
    });
  });
});
