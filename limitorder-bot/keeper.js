import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { HOOK_ABI } from './abi.js';

dotenv.config();

// Configuration
const config = {
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  hookAddress: process.env.HOOK_ADDRESS,
  checkInterval: parseInt(process.env.CHECK_INTERVAL) || 60000, // 60 seconds
  maxGasPrice: ethers.parseUnits(process.env.MAX_GAS_PRICE || '100', 'gwei'),
  maxOrdersPerExecution: parseInt(process.env.MAX_ORDERS_PER_EXECUTION) || 5,
  poolKey: {
    currency0: process.env.CURRENCY_0,
    currency1: process.env.CURRENCY_1,
    fee: parseInt(process.env.FEE),
    tickSpacing: parseInt(process.env.TICK_SPACING),
    hooks: process.env.HOOKS
  }
};

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const wallet = new ethers.Wallet(config.privateKey, provider);
const hook = new ethers.Contract(config.hookAddress, HOOK_ABI, wallet);

console.log('🤖 Limit Order Keeper Bot Started');
console.log('📍 Hook Address:', config.hookAddress);
console.log('💼 Keeper Address:', wallet.address);
console.log('⏱️  Check Interval:', config.checkInterval / 1000, 'seconds');
console.log('━'.repeat(60));

// Statistics
let stats = {
  totalChecks: 0,
  totalExecutions: 0,
  totalFees: 0n,
  errors: 0,
  startTime: Date.now()
};

/**
 * Check if gas price is acceptable
 */
async function isGasPriceAcceptable() {
  const feeData = await provider.getFeeData();
  const currentGasPrice = feeData.gasPrice;
  
  if (currentGasPrice > config.maxGasPrice) {
    console.log(`⛽ Gas price too high: ${ethers.formatUnits(currentGasPrice, 'gwei')} gwei`);
    return false;
  }
  
  return true;
}

/**
 * Execute a single limit order
 */
async function executeOrder(orderHash) {
  try {
    console.log(`\n📦 Executing order: ${orderHash.slice(0, 10)}...`);
    
    // Get order details
    const order = await hook.getOrder(orderHash);
    console.log(`   Owner: ${order.owner}`);
    console.log(`   TokenIn: ${order.tokenIn}`);
    console.log(`   Amount: ${ethers.formatUnits(order.amountIn, 18)}`);
    
    // Estimate gas
    const gasEstimate = await hook.executeLimitOrder.estimateGas(
      orderHash,
      config.poolKey
    );
    
    console.log(`   Estimated Gas: ${gasEstimate.toString()}`);
    
    // Execute transaction
    const tx = await hook.executeLimitOrder(
      orderHash,
      config.poolKey,
      {
        gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
      }
    );
    
    console.log(`   TX Hash: ${tx.hash}`);
    console.log(`   ⏳ Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`   ✅ Order executed successfully!`);
      console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
      
      // Calculate executor fee earned (0.1% of output)
      const executorFee = await calculateExecutorFee(receipt);
      stats.totalFees += executorFee;
      stats.totalExecutions++;
      
      console.log(`   💰 Executor Fee: ${ethers.formatUnits(executorFee, 18)} tokens`);
      
      return true;
    } else {
      console.log(`   ❌ Transaction failed`);
      return false;
    }
    
  } catch (error) {
    console.error(`   ❌ Error executing order:`, error.message);
    stats.errors++;
    return false;
  }
}

/**
 * Calculate executor fee from receipt logs
 */
function calculateExecutorFee(receipt) {
  // Parse LimitOrderExecuted event to get amountOut
  // Executor gets 0.1% (10 bps) of amountOut
  try {
    const executedEvent = receipt.logs.find(log => {
      try {
        const parsed = hook.interface.parseLog(log);
        return parsed.name === 'LimitOrderExecuted';
      } catch {
        return false;
      }
    });
    
    if (executedEvent) {
      const parsed = hook.interface.parseLog(executedEvent);
      const amountOut = parsed.args.amountOut;
      return (amountOut * 10n) / 10000n; // 0.1%
    }
  } catch (error) {
    console.error('Error parsing executor fee:', error);
  }
  
  return 0n;
}

/**
 * Main keeper loop
 */
async function keeperLoop() {
  try {
    stats.totalChecks++;
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔍 Check #${stats.totalChecks} - ${new Date().toLocaleTimeString()}`);
    
    // Check gas price
    if (!(await isGasPriceAcceptable())) {
      console.log('⏭️  Skipping due to high gas prices');
      return;
    }
    
    // Get executable orders
    console.log('📋 Fetching executable orders...');
    const executableOrders = await hook.getExecutableOrders(config.poolKey);
    
    if (executableOrders.length === 0) {
      console.log('✨ No executable orders found');
      printStats();
      return;
    }
    
    console.log(`🎯 Found ${executableOrders.length} executable order(s)`);
    
    // Limit number of orders to execute per run
    const ordersToExecute = executableOrders.slice(0, config.maxOrdersPerExecution);
    
    if (executableOrders.length > config.maxOrdersPerExecution) {
      console.log(`⚠️  Limiting to ${config.maxOrdersPerExecution} orders per execution`);
    }
    
    // Execute each order
    let successCount = 0;
    for (const orderHash of ordersToExecute) {
      const success = await executeOrder(orderHash);
      if (success) successCount++;
      
      // Wait 2 seconds between executions
      if (ordersToExecute.indexOf(orderHash) < ordersToExecute.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n📊 Execution Summary: ${successCount}/${ordersToExecute.length} successful`);
    printStats();
    
  } catch (error) {
    console.error('\n❌ Error in keeper loop:', error.message);
    stats.errors++;
  }
}

/**
 * Print statistics
 */
function printStats() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  console.log('\n📈 Statistics:');
  console.log(`   Total Checks: ${stats.totalChecks}`);
  console.log(`   Total Executions: ${stats.totalExecutions}`);
  console.log(`   Total Fees Earned: ${ethers.formatUnits(stats.totalFees, 18)} tokens`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Uptime: ${hours}h ${minutes}m`);
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down keeper bot...');
  printStats();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Shutting down keeper bot...');
  printStats();
  process.exit(0);
});

// Start the keeper
console.log('🚀 Starting keeper loop...\n');
keeperLoop(); // Run immediately
setInterval(keeperLoop, config.checkInterval);
