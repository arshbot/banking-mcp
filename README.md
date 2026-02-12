# Magnolia MCP Server

An MCP (Model Context Protocol) server that wraps the Magnolia banking API, letting AI agents manage crypto wallets, bank accounts, trading, fiat operations, and Lightning Network payments.

## Prerequisites

- Node.js 18+
- A Magnolia API key (get one at [clawbot.cash](https://clawbot.cash))

## Install

```bash
npm install
npm run build
```

## Configuration

Set your API key as an environment variable:

```bash
export MAGNOLIA_API_KEY=magfi_your_api_key_here
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAGNOLIA_API_KEY` | Yes | — | API key from ClawBot.cash KYC flow |
| `MAGNOLIA_API_URL` | No | `https://api.magfi.net` | Magnolia API base URL |

## Usage

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "magnolia": {
      "command": "node",
      "args": ["/path/to/clawbot.cash/mcp-server/dist/index.js"],
      "env": {
        "MAGNOLIA_API_KEY": "magfi_your_api_key_here"
      }
    }
  }
}
```

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "magnolia": {
      "command": "node",
      "args": ["/path/to/clawbot.cash/mcp-server/dist/index.js"],
      "env": {
        "MAGNOLIA_API_KEY": "magfi_your_api_key_here"
      }
    }
  }
}
```

### Direct

```bash
MAGNOLIA_API_KEY=magfi_... node dist/index.js
```

## Available Tools (30 total)

### Enterprise

| Tool | Description |
|------|-------------|
| `list_enterprises` | List all enterprises accessible to this API key |

### Crypto Wallets

| Tool | Description |
|------|-------------|
| `list_wallets` | List wallets for a cryptocurrency (btc, eth, tbtc, teth) |
| `get_wallet` | Get wallet details by coin and wallet ID |
| `generate_address` | Generate a new receive address for a wallet |
| `list_addresses` | List all addresses for a wallet |
| `get_address_balances` | Get address balances for a wallet |
| `send_crypto` | Send a cryptocurrency transaction |
| `get_wallet_transfer` | Get transfer status for a wallet |
| `list_wallet_transfers` | List all transfers for a wallet |

### Bank Accounts

| Tool | Description |
|------|-------------|
| `list_bank_accounts` | List linked bank accounts (filterable by type, state, enterprise) |
| `get_bank_account` | Get bank account details by ID |
| `add_bank_account` | Add a new bank account (wire, ACH, or SEPA) |
| `delete_bank_account` | Delete a bank account |
| `get_deposit_info` | Get deposit/wiring instructions |

### Trading

| Tool | Description |
|------|-------------|
| `get_trading_balances` | Get balances for a trading account |
| `get_trading_products` | List available trading products/pairs |
| `place_order` | Place a trading order (market, limit, TWAP, steady pace) |
| `list_orders` | List orders for a trading account |
| `get_order` | Get order details by ID |
| `cancel_order` | Cancel a pending order |

### Fiat/ACH

| Tool | Description |
|------|-------------|
| `get_ach_agreement` | Get the ACH debit agreement |
| `accept_ach_agreement` | Accept the ACH debit agreement for a bank account |
| `create_ach_debit` | Create an ACH debit to pull funds from a bank account |

### Lightning Network

| Tool | Description |
|------|-------------|
| `create_lightning_invoice` | Create a Lightning invoice to receive payment |
| `get_lightning_invoice` | Check Lightning invoice status |
| `pay_lightning_invoice` | Pay a Lightning invoice |
| `list_lightning_transactions` | List Lightning transactions for a wallet |

### Utility

| Tool | Description |
|------|-------------|
| `lookup_routing_number` | Look up bank info by ACH or wire routing number |

### Auth

| Tool | Description |
|------|-------------|
| `list_api_keys` | List all API keys for the authenticated user |
| `delete_api_key` | Delete an API key by ID |

## Example Interactions

Once configured, you can ask your AI agent things like:

- "List my BTC wallets"
- "Generate a new receive address for my ETH wallet"
- "Send 0.001 BTC to address bc1q..."
- "Show my bank accounts"
- "Add my Chase checking account for ACH"
- "Place a market order to buy $100 of BTC"
- "What are my trading balances?"
- "Create a Lightning invoice for 10000 sats"
- "Look up routing number 021000021"

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:integration  # Integration tests only
```

118 tests across 5 suites covering auth, API paths, client methods, edge cases, and backward compatibility.

## Development

```bash
npm run dev    # Watch mode (recompiles on change)
npm run build  # One-time build
npm start      # Run the compiled server
```

## License

MIT
