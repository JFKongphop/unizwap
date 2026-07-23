# Limit Order Keeper Bot

Automated keeper bot for executing TWAP-based limit orders on the LimitOrderHook contract.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required Configuration:**
- `RPC_URL`: Your Ethereum RPC endpoint (Infura, Alchemy, etc.)
- `PRIVATE_KEY`: Keeper wallet private key (needs ETH for gas)
- `HOOK_ADDRESS`: Deployed LimitOrderHook contract address
- `CURRENCY_0`, `CURRENCY_1`: Pool token addresses
- `FEE`, `TICK_SPACING`, `HOOKS`: Pool configuration

### 3. Run the Bot

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## 📖 How It Works

The keeper bot:

1. **Checks every minute** for executable limit orders
2. **Queries the hook** for orders where TWAP conditions are met
3. **Executes orders** by sending transactions
4. **Earns 0.1% fee** on each executed order as incentive
5. **Monitors gas prices** and skips execution if too high

### Example Output

```
🤖 Limit Order Keeper Bot Started
📍 Hook Address: 0x1234...
💼 Keeper Address: 0x5678...
⏱️  Check Interval: 60 seconds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 Check #1 - 10:30:45 AM
📋 Fetching executable orders...
🎯 Found 2 executable order(s)

📦 Executing order: 0x1234abcd...
   Owner: 0x9876...
   TokenIn: 0xA0b8...
   Amount: 100.0
   Estimated Gas: 250000
   TX Hash: 0xdef...
   ⏳ Waiting for confirmation...
   ✅ Order executed successfully!
   💰 Executor Fee: 0.1 tokens

📊 Execution Summary: 2/2 successful

📈 Statistics:
   Total Checks: 1
   Total Executions: 2
   Total Fees Earned: 0.2 tokens
   Errors: 0
   Uptime: 0h 1m
```

## ⚙️ Configuration

### Bot Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `CHECK_INTERVAL` | How often to check for orders (ms) | 60000 (1 min) |
| `MAX_GAS_PRICE` | Max gas price in gwei | 100 |
| `MAX_ORDERS_PER_EXECUTION` | Max orders to execute per run | 5 |

### Gas Management

The bot automatically:
- Checks current gas prices before execution
- Skips execution if gas > `MAX_GAS_PRICE`
- Adds 20% buffer to gas estimates
- Retries failed transactions

### Earnings

Keepers earn **0.1% (10 bps)** of the output amount for each order executed.

**Example:**
- Order swaps 1000 USDC → 0.5 ETH
- Keeper earns: 0.0005 ETH (0.1% of 0.5 ETH)

## 🛠️ Advanced Usage

### Running Multiple Pools

Create separate `.env` files for each pool:

```bash
# Terminal 1
cp .env .env.eth-usdc
node keeper.js  # Monitors ETH/USDC

# Terminal 2
cp .env .env.eth-dai
node keeper.js  # Monitors ETH/DAI
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["npm", "start"]
```

```bash
docker build -t limitorder-keeper .
docker run -d --env-file .env limitorder-keeper
```

### Monitoring

The bot logs:
- ✅ Successful executions
- ❌ Failed transactions
- ⛽ Gas price checks
- 📊 Running statistics

Press `Ctrl+C` to gracefully shutdown and view final stats.

## 🔒 Security

**Important:**
- Never commit `.env` file to git
- Use a dedicated keeper wallet (not your main wallet)
- Fund keeper wallet with only necessary ETH
- Monitor keeper wallet balance regularly
- Consider using a hardware wallet for large operations

## 🐛 Troubleshooting

### "Insufficient funds" error
- Keeper wallet needs ETH for gas
- Check balance: `cast balance <KEEPER_ADDRESS>`

### "TWAP condition not met" error
- Order's TWAP condition hasn't triggered yet
- Check order details with `cast call`

### "Gas price too high" skips
- Network is congested
- Bot will retry when gas prices drop
- Adjust `MAX_GAS_PRICE` if needed

### No orders found
- No active orders in the pool
- Check hook contract: `cast call <HOOK> "getActiveOrderCount()"`

## 📊 Monitoring Dashboard

Create a simple monitoring dashboard:

```javascript
// monitor.js
import { ethers } from 'ethers';

const hook = new ethers.Contract(HOOK_ADDRESS, HOOK_ABI, provider);

setInterval(async () => {
  const activeOrders = await hook.getActiveOrderCount();
  const executableOrders = await hook.getExecutableOrders(poolKey);
  
  console.log(`Active Orders: ${activeOrders}`);
  console.log(`Executable: ${executableOrders.length}`);
}, 10000);
```

## 🤝 Contributing

Issues and PRs welcome!

## 📄 License

MIT
