/**
 * Magnolia API client for the MCP server.
 * Uses API keys obtained from the ClawBot.cash KYC flow.
 *
 * IMPORTANT: API paths are based on the official Magnolia documentation at
 * docs.magnolia.financial. The API has multiple services:
 *
 *   - /auth/*                          — Authentication (login, API keys)
 *   - /api/v2/{coin}/wallet/*          — Crypto wallet operations
 *   - /api/v2/bankaccounts/*           — Bank account management
 *   - /api/v2/enterprise/*             — Enterprise management
 *   - /api/prime/trading/v1/accounts/* — Trading (orders, balances, products)
 *   - /api/fiat/v1/*                   — Fiat/ACH operations
 *   - /api/evs/v1/*                    — KYC/Identity verification
 *   - /api/tradfi/v1/*                 — Traditional finance utilities
 */

const DEFAULT_API_URL = "https://api.magfi.net";

export class MagnoliaClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiKey: string, apiUrl?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || DEFAULT_API_URL;
  }

  private async request(
    path: string,
    options: RequestInit = {}
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      "User-Agent": "ClawBot-MCP/1.0",
      Authorization: `Bearer ${this.apiKey}`,
      ...(options.headers as Record<string, string> || {}),
    };

    if (options.body && typeof options.body === "string") {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers,
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `Magnolia API error ${res.status} on ${options.method || "GET"} ${path}: ${text}`
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // --- Authentication ---

  /**
   * Login with email/password to get a JWT token.
   * JWT tokens expire after 1 hour.
   */
  async login(email: string, password: string): Promise<unknown> {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      // Don't send API key for login, use raw request
    });
  }

  /**
   * List all API keys for the authenticated user.
   */
  async listApiKeys(): Promise<unknown> {
    return this.request("/auth/api-key");
  }

  /**
   * Delete an API key by ID.
   */
  async deleteApiKey(keyId: string): Promise<unknown> {
    return this.request(`/auth/api-key/${keyId}`, {
      method: "DELETE",
    });
  }

  // --- Enterprise ---

  /**
   * List enterprises accessible to this user.
   */
  async getEnterprises(): Promise<unknown> {
    return this.request("/api/v2/enterprise");
  }

  // --- Crypto Wallets (v2/{coin}/wallet) ---

  /**
   * List wallets for a specific cryptocurrency.
   * @param coin - Coin ticker (e.g., "btc", "eth", "tbtc" for testnet)
   */
  async listWallets(coin: string): Promise<unknown> {
    return this.request(`/api/v2/${coin}/wallet`);
  }

  /**
   * Get a specific wallet by ID.
   */
  async getWallet(coin: string, walletId: string): Promise<unknown> {
    return this.request(`/api/v2/${coin}/wallet/${walletId}`);
  }

  /**
   * Generate a new receive address for a wallet.
   */
  async generateAddress(
    coin: string,
    walletId: string
  ): Promise<unknown> {
    return this.request(`/api/v2/${coin}/wallet/${walletId}/address`, {
      method: "POST",
    });
  }

  /**
   * List all addresses for a wallet.
   */
  async listAddresses(
    coin: string,
    walletId: string
  ): Promise<unknown> {
    return this.request(
      `/api/v2/${coin}/wallet/${walletId}/addresses`
    );
  }

  /**
   * Get address balances for a wallet.
   */
  async getAddressBalances(
    coin: string,
    walletId: string
  ): Promise<unknown> {
    return this.request(
      `/api/v2/${coin}/wallet/${walletId}/addresses/balances`
    );
  }

  /**
   * Send a transaction from a wallet.
   */
  async sendTransaction(
    coin: string,
    walletId: string,
    data: {
      address: string;
      amount: string;
      walletPassphrase?: string;
      memo?: string;
    }
  ): Promise<unknown> {
    return this.request(
      `/api/v2/${coin}/wallet/${walletId}/tx/send`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Get transfer status for a wallet.
   */
  async getWalletTransfer(
    coin: string,
    walletId: string,
    transferId: string
  ): Promise<unknown> {
    return this.request(
      `/api/v2/${coin}/wallet/${walletId}/transfer/${transferId}`
    );
  }

  /**
   * List transfers for a wallet.
   */
  async listWalletTransfers(
    coin: string,
    walletId: string
  ): Promise<unknown> {
    return this.request(
      `/api/v2/${coin}/wallet/${walletId}/transfer`
    );
  }

  // --- Bank Accounts (v2/bankaccounts) ---

  /**
   * List all bank accounts.
   */
  async listBankAccounts(params?: {
    type?: string;
    verificationState?: string;
    enterpriseId?: string;
  }): Promise<unknown> {
    const query = new URLSearchParams();
    if (params?.type) query.set("type", params.type);
    if (params?.verificationState)
      query.set("verificationState", params.verificationState);
    if (params?.enterpriseId)
      query.set("enterpriseId", params.enterpriseId);
    const qs = query.toString();
    return this.request(`/api/v2/bankaccounts${qs ? `?${qs}` : ""}`);
  }

  /**
   * Get a specific bank account by ID.
   */
  async getBankAccount(bankAccountId: string): Promise<unknown> {
    return this.request(
      `/api/v2/bankaccounts/${bankAccountId}`
    );
  }

  /**
   * Add a new bank account.
   *
   * NOTE: API requires complete owner address information (discovered via E2E testing).
   * The ownerAddress object must contain these fields (snake_case):
   * - address_line_1
   * - city_locality
   * - state_province
   * - postal_code
   */
  async addBankAccount(data: {
    type: "wire" | "ach" | "sepa";
    name: string;
    ownerName: string;
    shortCountryCode: string;
    accountNumber: string;
    currency: string;
    routingNumber?: string;
    swiftCode?: string;
    accountType?: "checking" | "saving";
    // Owner address (REQUIRED by API)
    ownerAddressCountryCode: string;
    ownerAddress: {
      address_line_1: string;
      city_locality: string;
      state_province: string;
      postal_code: string;
    };
  }): Promise<unknown> {
    return this.request("/api/v2/bankaccounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a bank account.
   */
  async updateBankAccount(
    bankAccountId: string,
    data: Record<string, unknown>
  ): Promise<unknown> {
    return this.request(
      `/api/v2/bankaccounts/${bankAccountId}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Delete a bank account.
   */
  async deleteBankAccount(bankAccountId: string): Promise<unknown> {
    return this.request(
      `/api/v2/bankaccounts/${bankAccountId}`,
      { method: "DELETE" }
    );
  }

  /**
   * Get deposit info for bank accounts.
   */
  async getDepositInfo(): Promise<unknown> {
    return this.request("/api/v2/bankaccounts/deposit/info");
  }

  // --- Trading (Prime) ---

  /**
   * Get account balances for a trading account.
   */
  async getTradingBalances(accountId: string): Promise<unknown> {
    return this.request(
      `/api/prime/trading/v1/accounts/${accountId}/balances`
    );
  }

  /**
   * List available trading products for an account.
   */
  async getTradingProducts(accountId: string): Promise<unknown> {
    return this.request(
      `/api/prime/trading/v1/accounts/${accountId}/products`
    );
  }

  /**
   * Place a trading order.
   */
  async placeOrder(
    accountId: string,
    data: {
      type: "market" | "limit" | "twap" | "steady_pace";
      product: string;
      side: "buy" | "sell";
      quantity: string;
      quantityCurrency: string;
      limitPrice?: string;
      duration?: number;
      clientOrderId?: string;
      fundingType?: "margin" | "funded";
    }
  ): Promise<unknown> {
    return this.request(
      `/api/prime/trading/v1/accounts/${accountId}/orders`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * List orders for a trading account.
   */
  async listOrders(
    accountId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<unknown> {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return this.request(
      `/api/prime/trading/v1/accounts/${accountId}/orders${qs ? `?${qs}` : ""}`
    );
  }

  /**
   * Get a specific order by ID.
   */
  async getOrder(
    accountId: string,
    orderId: string
  ): Promise<unknown> {
    return this.request(
      `/api/prime/trading/v1/accounts/${accountId}/orders/${orderId}`
    );
  }

  /**
   * Cancel an order.
   */
  async cancelOrder(
    accountId: string,
    orderId: string
  ): Promise<unknown> {
    return this.request(
      `/api/prime/trading/v1/accounts/${accountId}/orders/${orderId}/cancel`,
      { method: "POST" }
    );
  }

  // --- Fiat/ACH ---

  /**
   * Get ACH debit agreement.
   */
  async getAchAgreement(): Promise<unknown> {
    return this.request(
      "/api/fiat/v1/transaction/ach-debit/agreement"
    );
  }

  /**
   * Accept ACH debit agreement.
   */
  async acceptAchAgreement(data: {
    bankAccountId: string;
  }): Promise<unknown> {
    return this.request(
      "/api/fiat/v1/transaction/ach-debit/agreement",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Create an ACH debit transaction.
   */
  async createAchDebit(data: {
    bankAccountId: string;
    amount: string;
    currency: string;
  }): Promise<unknown> {
    return this.request("/api/fiat/v1/transaction/ach-debit", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // --- Lightning Network ---

  /**
   * Create a lightning invoice.
   */
  async createLightningInvoice(
    walletId: string,
    data: { amount: string; memo?: string }
  ): Promise<unknown> {
    return this.request(
      `/api/v2/wallet/${walletId}/lightning/invoice`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Get a lightning invoice status.
   */
  async getLightningInvoice(
    walletId: string,
    paymentHash: string
  ): Promise<unknown> {
    return this.request(
      `/api/v2/wallet/${walletId}/lightning/invoice/${paymentHash}`
    );
  }

  /**
   * Make a lightning payment.
   */
  async makeLightningPayment(
    walletId: string,
    data: { invoice: string }
  ): Promise<unknown> {
    return this.request(
      `/api/v2/wallet/${walletId}/lightning/payment`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * List lightning transactions.
   */
  async listLightningTransactions(
    walletId: string
  ): Promise<unknown> {
    return this.request(
      `/api/v2/wallet/${walletId}/lightning/transaction`
    );
  }

  // --- Utility ---

  /**
   * Look up bank routing number information.
   * @param bankType - "ach" or "wire"
   */
  async lookupRoutingNumber(
    bankType: "ach" | "wire",
    routingNumber: string
  ): Promise<unknown> {
    return this.request(
      `/api/tradfi/v1/banks/${bankType}/${routingNumber}`
    );
  }

}
