#!/usr/bin/env node

/**
 * Magnolia MCP Server
 *
 * An MCP server that wraps the Magnolia banking API, allowing AI agents
 * to manage crypto wallets, bank accounts, trading, fiat operations,
 * and Lightning Network payments.
 *
 * API paths are based on the official Magnolia documentation at
 * docs.magnolia.financial.
 *
 * Usage:
 *   MAGNOLIA_API_KEY=magfi_... node dist/index.js
 *   MAGNOLIA_API_KEY=magfi_... MAGNOLIA_API_URL=https://api.magfi.net node dist/index.js
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MagnoliaClient } from "./magnolia-client.js";

const API_KEY = process.env.MAGNOLIA_API_KEY;
const API_URL = process.env.MAGNOLIA_API_URL;

if (!API_KEY) {
  console.error(
    "Error: MAGNOLIA_API_KEY environment variable is required.\n" +
      "Get your API key at https://clawbot.cash"
  );
  process.exit(1);
}

const client = new MagnoliaClient(API_KEY, API_URL);

const server = new McpServer({
  name: "magnolia",
  version: "1.0.0",
});

// Helper to format JSON responses
function jsonResponse(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${message}`,
      },
    ],
    isError: true,
  };
}

// ==========================================
// Enterprise Tools
// ==========================================

server.registerTool("list_enterprises", {
  description:
    "List all enterprises accessible to this API key.",
  inputSchema: {},
}, async () => {
  try {
    const enterprises = await client.getEnterprises();
    return jsonResponse(enterprises);
  } catch (e) {
    return errorResponse(e);
  }
});

// ==========================================
// Crypto Wallet Tools — /api/v2/{coin}/wallet
// ==========================================

server.registerTool("list_wallets", {
  description:
    "List wallets for a specific cryptocurrency. Use coin tickers like 'btc', 'eth', 'tbtc' (testnet BTC), 'teth' (testnet ETH).",
  inputSchema: {
    coin: z.string().describe("Coin ticker (e.g., 'btc', 'eth', 'tbtc', 'teth')"),
  },
}, async ({ coin }) => {
  try {
    const wallets = await client.listWallets(coin);
    return jsonResponse(wallets);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("get_wallet", {
  description: "Get details for a specific wallet by coin and wallet ID.",
  inputSchema: {
    coin: z.string().describe("Coin ticker (e.g., 'btc', 'eth')"),
    walletId: z.string().describe("The wallet ID"),
  },
}, async ({ coin, walletId }) => {
  try {
    const wallet = await client.getWallet(coin, walletId);
    return jsonResponse(wallet);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("generate_address", {
  description:
    "Generate a new receive address for a crypto wallet.",
  inputSchema: {
    coin: z.string().describe("Coin ticker (e.g., 'btc', 'eth')"),
    walletId: z.string().describe("The wallet ID"),
  },
}, async ({ coin, walletId }) => {
  try {
    const address = await client.generateAddress(coin, walletId);
    return jsonResponse(address);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("list_addresses", {
  description:
    "List all addresses for a crypto wallet.",
  inputSchema: {
    coin: z.string().describe("Coin ticker (e.g., 'btc', 'eth')"),
    walletId: z.string().describe("The wallet ID"),
  },
}, async ({ coin, walletId }) => {
  try {
    const addresses = await client.listAddresses(coin, walletId);
    return jsonResponse(addresses);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("get_address_balances", {
  description:
    "Get address balances for a crypto wallet.",
  inputSchema: {
    coin: z.string().describe("Coin ticker (e.g., 'btc', 'eth')"),
    walletId: z.string().describe("The wallet ID"),
  },
}, async ({ coin, walletId }) => {
  try {
    const balances = await client.getAddressBalances(coin, walletId);
    return jsonResponse(balances);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("send_crypto", {
  description:
    "Send a cryptocurrency transaction from a wallet.",
  inputSchema: {
    coin: z.string().describe("Coin ticker (e.g., 'btc', 'eth')"),
    walletId: z.string().describe("Source wallet ID"),
    address: z.string().describe("Destination address"),
    amount: z.string().describe("Amount to send (in base units)"),
    walletPassphrase: z.string().optional().describe("Wallet passphrase for signing"),
    memo: z.string().optional().describe("Optional memo/tag"),
  },
}, async ({ coin, walletId, address, amount, walletPassphrase, memo }) => {
  try {
    const tx = await client.sendTransaction(coin, walletId, {
      address,
      amount,
      walletPassphrase,
      memo,
    });
    return jsonResponse(tx);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("get_wallet_transfer", {
  description:
    "Get the status of a specific transfer for a wallet.",
  inputSchema: {
    coin: z.string().describe("Coin ticker (e.g., 'btc', 'eth')"),
    walletId: z.string().describe("The wallet ID"),
    transferId: z.string().describe("The transfer ID"),
  },
}, async ({ coin, walletId, transferId }) => {
  try {
    const transfer = await client.getWalletTransfer(coin, walletId, transferId);
    return jsonResponse(transfer);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("list_wallet_transfers", {
  description:
    "List all transfers for a specific crypto wallet.",
  inputSchema: {
    coin: z.string().describe("Coin ticker (e.g., 'btc', 'eth')"),
    walletId: z.string().describe("The wallet ID"),
  },
}, async ({ coin, walletId }) => {
  try {
    const transfers = await client.listWalletTransfers(coin, walletId);
    return jsonResponse(transfers);
  } catch (e) {
    return errorResponse(e);
  }
});

// ==========================================
// Bank Account Tools — /api/v2/bankaccounts
// ==========================================

server.registerTool("list_bank_accounts", {
  description:
    "List all linked bank accounts. Can filter by type, verification state, or enterprise.",
  inputSchema: {
    type: z.string().optional().describe("Filter by type: 'wire', 'ach', or 'sepa'"),
    verificationState: z.string().optional().describe("Filter by verification state"),
    enterpriseId: z.string().optional().describe("Filter by enterprise ID"),
  },
}, async ({ type, verificationState, enterpriseId }) => {
  try {
    const accounts = await client.listBankAccounts({
      type,
      verificationState,
      enterpriseId,
    });
    return jsonResponse(accounts);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("get_bank_account", {
  description: "Get details for a specific bank account by ID.",
  inputSchema: {
    bankAccountId: z.string().describe("The bank account ID"),
  },
}, async ({ bankAccountId }) => {
  try {
    const account = await client.getBankAccount(bankAccountId);
    return jsonResponse(account);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("add_bank_account", {
  description:
    "Add a new bank account for deposits and withdrawals.",
  inputSchema: {
    type: z.enum(["wire", "ach", "sepa"]).describe("Bank account type"),
    name: z.string().describe("A label for this bank account"),
    ownerName: z.string().describe("Name of the account owner"),
    shortCountryCode: z.string().describe("Two-letter country code (e.g., 'US')"),
    accountNumber: z.string().describe("Bank account number"),
    currency: z.string().describe("Currency code (e.g., 'USD')"),
    routingNumber: z.string().optional().describe("Routing number (required for ACH/wire in US)"),
    swiftCode: z.string().optional().describe("SWIFT code (for international wire)"),
    accountType: z.enum(["checking", "saving"]).optional().describe("Account type"),
    ownerAddressCountryCode: z.string().describe("Two-letter country code for the owner's address (e.g., 'US')"),
    ownerAddress: z.object({
      address_line_1: z.string().describe("Street address"),
      city_locality: z.string().describe("City"),
      state_province: z.string().describe("State or province"),
      postal_code: z.string().describe("Postal/ZIP code"),
    }).describe("Owner's physical address"),
  },
}, async ({ type, name, ownerName, shortCountryCode, accountNumber, currency, routingNumber, swiftCode, accountType, ownerAddressCountryCode, ownerAddress }) => {
  try {
    const account = await client.addBankAccount({
      type,
      name,
      ownerName,
      shortCountryCode,
      accountNumber,
      currency,
      routingNumber,
      swiftCode,
      accountType,
      ownerAddressCountryCode,
      ownerAddress,
    });
    return jsonResponse(account);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("delete_bank_account", {
  description: "Delete a bank account by ID.",
  inputSchema: {
    bankAccountId: z.string().describe("The bank account ID to delete"),
  },
}, async ({ bankAccountId }) => {
  try {
    const result = await client.deleteBankAccount(bankAccountId);
    return jsonResponse(result);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("get_deposit_info", {
  description:
    "Get deposit information for bank accounts (wiring instructions, etc.).",
  inputSchema: {},
}, async () => {
  try {
    const info = await client.getDepositInfo();
    return jsonResponse(info);
  } catch (e) {
    return errorResponse(e);
  }
});

// ==========================================
// Trading Tools — /api/prime/trading/v1
// ==========================================

server.registerTool("get_trading_balances", {
  description:
    "Get balances for a trading account.",
  inputSchema: {
    accountId: z.string().describe("Trading account ID"),
  },
}, async ({ accountId }) => {
  try {
    const balances = await client.getTradingBalances(accountId);
    return jsonResponse(balances);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("get_trading_products", {
  description:
    "List available trading products (pairs) for an account.",
  inputSchema: {
    accountId: z.string().describe("Trading account ID"),
  },
}, async ({ accountId }) => {
  try {
    const products = await client.getTradingProducts(accountId);
    return jsonResponse(products);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("place_order", {
  description:
    "Place a trading order (market, limit, TWAP, or steady pace).",
  inputSchema: {
    accountId: z.string().describe("Trading account ID"),
    type: z.enum(["market", "limit", "twap", "steady_pace"]).describe("Order type"),
    product: z.string().describe("Trading product/pair (e.g., 'BTC-USD')"),
    side: z.enum(["buy", "sell"]).describe("Order side"),
    quantity: z.string().describe("Order quantity"),
    quantityCurrency: z.string().describe("Currency of the quantity (e.g., 'USD' or 'BTC')"),
    limitPrice: z.string().optional().describe("Limit price (required for limit orders)"),
    duration: z.number().optional().describe("Duration in seconds (for TWAP/steady pace)"),
    clientOrderId: z.string().optional().describe("Client-defined order ID"),
    fundingType: z.enum(["margin", "funded"]).optional().describe("Funding type"),
  },
}, async ({ accountId, type, product, side, quantity, quantityCurrency, limitPrice, duration, clientOrderId, fundingType }) => {
  try {
    const order = await client.placeOrder(accountId, {
      type,
      product,
      side,
      quantity,
      quantityCurrency,
      limitPrice,
      duration,
      clientOrderId,
      fundingType,
    });
    return jsonResponse(order);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("list_orders", {
  description: "List orders for a trading account.",
  inputSchema: {
    accountId: z.string().describe("Trading account ID"),
    limit: z.number().optional().describe("Max number of orders to return"),
    offset: z.number().optional().describe("Offset for pagination"),
  },
}, async ({ accountId, limit, offset }) => {
  try {
    const orders = await client.listOrders(accountId, { limit, offset });
    return jsonResponse(orders);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("get_order", {
  description: "Get details for a specific trading order.",
  inputSchema: {
    accountId: z.string().describe("Trading account ID"),
    orderId: z.string().describe("The order ID"),
  },
}, async ({ accountId, orderId }) => {
  try {
    const order = await client.getOrder(accountId, orderId);
    return jsonResponse(order);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("cancel_order", {
  description: "Cancel a pending trading order.",
  inputSchema: {
    accountId: z.string().describe("Trading account ID"),
    orderId: z.string().describe("The order ID to cancel"),
  },
}, async ({ accountId, orderId }) => {
  try {
    const result = await client.cancelOrder(accountId, orderId);
    return jsonResponse(result);
  } catch (e) {
    return errorResponse(e);
  }
});

// ==========================================
// Fiat/ACH Tools — /api/fiat/v1
// ==========================================

server.registerTool("get_ach_agreement", {
  description:
    "Get the ACH debit agreement that must be accepted before making ACH debits.",
  inputSchema: {},
}, async () => {
  try {
    const agreement = await client.getAchAgreement();
    return jsonResponse(agreement);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("accept_ach_agreement", {
  description:
    "Accept the ACH debit agreement for a specific bank account.",
  inputSchema: {
    bankAccountId: z.string().describe("The bank account ID to accept the agreement for"),
  },
}, async ({ bankAccountId }) => {
  try {
    const result = await client.acceptAchAgreement({ bankAccountId });
    return jsonResponse(result);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("create_ach_debit", {
  description:
    "Create an ACH debit transaction to pull funds from a linked bank account.",
  inputSchema: {
    bankAccountId: z.string().describe("Source bank account ID"),
    amount: z.string().describe("Amount to debit (e.g., '100.00')"),
    currency: z.string().describe("Currency code (e.g., 'USD')"),
  },
}, async ({ bankAccountId, amount, currency }) => {
  try {
    const tx = await client.createAchDebit({ bankAccountId, amount, currency });
    return jsonResponse(tx);
  } catch (e) {
    return errorResponse(e);
  }
});

// ==========================================
// Lightning Network Tools
// ==========================================

server.registerTool("create_lightning_invoice", {
  description:
    "Create a Lightning Network invoice to receive a payment.",
  inputSchema: {
    walletId: z.string().describe("Bitcoin wallet ID"),
    amount: z.string().describe("Amount in satoshis"),
    memo: z.string().optional().describe("Invoice memo/description"),
  },
}, async ({ walletId, amount, memo }) => {
  try {
    const invoice = await client.createLightningInvoice(walletId, { amount, memo });
    return jsonResponse(invoice);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("get_lightning_invoice", {
  description:
    "Check the status of a Lightning Network invoice.",
  inputSchema: {
    walletId: z.string().describe("Bitcoin wallet ID"),
    paymentHash: z.string().describe("The payment hash of the invoice"),
  },
}, async ({ walletId, paymentHash }) => {
  try {
    const invoice = await client.getLightningInvoice(walletId, paymentHash);
    return jsonResponse(invoice);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("pay_lightning_invoice", {
  description:
    "Pay a Lightning Network invoice.",
  inputSchema: {
    walletId: z.string().describe("Bitcoin wallet ID to pay from"),
    invoice: z.string().describe("Lightning invoice string (lnbc...)"),
  },
}, async ({ walletId, invoice }) => {
  try {
    const payment = await client.makeLightningPayment(walletId, { invoice });
    return jsonResponse(payment);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("list_lightning_transactions", {
  description:
    "List Lightning Network transactions for a wallet.",
  inputSchema: {
    walletId: z.string().describe("Bitcoin wallet ID"),
  },
}, async ({ walletId }) => {
  try {
    const txs = await client.listLightningTransactions(walletId);
    return jsonResponse(txs);
  } catch (e) {
    return errorResponse(e);
  }
});

// ==========================================
// Utility Tools
// ==========================================

server.registerTool("lookup_routing_number", {
  description:
    "Look up bank information by routing number. Returns bank name and address.",
  inputSchema: {
    bankType: z.enum(["ach", "wire"]).describe("Type of routing number: 'ach' or 'wire'"),
    routingNumber: z.string().describe("The 9-digit routing number"),
  },
}, async ({ bankType, routingNumber }) => {
  try {
    const info = await client.lookupRoutingNumber(bankType, routingNumber);
    return jsonResponse(info);
  } catch (e) {
    return errorResponse(e);
  }
});

// ==========================================
// Auth Tools
// ==========================================

server.registerTool("list_api_keys", {
  description:
    "List all API keys for the authenticated user.",
  inputSchema: {},
}, async () => {
  try {
    const keys = await client.listApiKeys();
    return jsonResponse(keys);
  } catch (e) {
    return errorResponse(e);
  }
});

server.registerTool("delete_api_key", {
  description:
    "Delete an API key by ID. Use list_api_keys first to find the key ID.",
  inputSchema: {
    keyId: z.string().describe("The API key ID to delete"),
  },
}, async ({ keyId }) => {
  try {
    const result = await client.deleteApiKey(keyId);
    return jsonResponse(result);
  } catch (e) {
    return errorResponse(e);
  }
});

// ==========================================
// Start Server
// ==========================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Magnolia MCP server v1.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
