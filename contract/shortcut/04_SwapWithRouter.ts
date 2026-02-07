import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as circomlibjs from 'circomlibjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ABIs
const SWAP_ROUTER_ABI = [
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMinimum, bool zeroForOne, (address,address,uint24,int24,address) poolKey, bytes hookData, address receiver, uint256 deadline) external payable returns (uint256, uint256)'
];

const UNIZWAP_HOOK_ABI = [
  'function getDepositBalance(address user, address token) external view returns (uint256)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)'
];

async function main() {
  // Configuration
  const SEPOLIA_RPC = process.env.SEPOLIA!;
  const PRIVATE_KEY = process.env.PRIVATE_KEY_2!;
  const TOKEN_A = process.env.TOKEN_A!;
  const TOKEN_B = process.env.TOKEN_B!;
  const UNIZWAP_HOOK_ADDRESS = process.env.UNIZWAP_HOOK_ADDRESS!;
  const SWAP_ROUTER = '0xf13D190e9117920c703d79B5F33732e10049b115'; // Correct SwapRouter address

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('=== Swapping with SwapRouter (Router Pattern) ===');
  console.log('Wallet:', wallet.address);
  console.log('Swap Router:', SWAP_ROUTER);
  console.log('Hook Contract:', UNIZWAP_HOOK_ADDRESS);
  console.log('Token In (A):', TOKEN_A);
  console.log('Token Out (B):', TOKEN_B);

  // Swap amount (10 tokens)
  const amountIn = ethers.parseEther('10');
  console.log('Amount In:', ethers.formatEther(amountIn));

  // Contract instances
  const token0 = new ethers.Contract(TOKEN_A, ERC20_ABI, wallet);
  const token1 = new ethers.Contract(TOKEN_B, ERC20_ABI, wallet);
  const swapRouter = new ethers.Contract(SWAP_ROUTER, SWAP_ROUTER_ABI, wallet);
  const unizwapHook = new ethers.Contract(UNIZWAP_HOOK_ADDRESS, UNIZWAP_HOOK_ABI, wallet);

  // Check token balances before swap
  const token0BalanceBefore = await token0.balanceOf(wallet.address);
  const token1BalanceBefore = await token1.balanceOf(wallet.address);
  console.log('Wallet TOKEN_A before swap:', ethers.formatEther(token0BalanceBefore));
  console.log('Wallet TOKEN_B before swap:', ethers.formatEther(token1BalanceBefore));

  // Check deposited balances before swap (for tracking in hooks)
  const depositedA = await unizwapHook.getDepositBalance(wallet.address, TOKEN_A);
  const depositedB = await unizwapHook.getDepositBalance(wallet.address, TOKEN_B);
  console.log('Deposited TOKEN_A before swap:', ethers.formatEther(depositedA));
  console.log('Deposited TOKEN_B before swap:', ethers.formatEther(depositedB));

  // Generate commitment for privacy withdrawal
  console.log('\n🔐 Generating commitment for privacy...');
  
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  const poseidonHash = (inputs: any) => {
    if (!Array.isArray(inputs)) inputs = [inputs];
    const bigints = inputs.map(BigInt);
    const res = poseidon(bigints);
    return BigInt(F.toString(res));
  };

  // Router swap unique values - use these in 07_WithdrawPrivate_Router.ts
  const secret = 333333n;
  const nonce = 444444n;
  const token_address = BigInt(TOKEN_B); // Output token address
  const deposit_amount = 1000n; // This is symbolic, actual amount comes from swap output

  // Calculate commitment: H(token_address, deposit_amount, H(secret, nonce))
  const secretHash = poseidonHash([secret, nonce]);
  const commitment = poseidonHash([token_address, deposit_amount, secretHash]);

  console.log('Secret:', secret.toString());
  console.log('Nonce:', nonce.toString());
  console.log('Commitment:', commitment.toString());
  console.log('Token Address:', TOKEN_B);
  console.log('\n💾 SAVE THESE FOR ROUTER WITHDRAWAL (07_WithdrawPrivate_Router.ts)');
  console.log('');

  // Convert commitment to bytes32
  const commitmentBytes32 = ethers.toBeHex(commitment, 32);

  // Approve tokens to SwapRouter
  console.log('Approving tokens to SwapRouter...');
  const approveTx = await token0.approve(SWAP_ROUTER, amountIn);
  await approveTx.wait();
  console.log('✅ Tokens approved');

  // Create PoolKey as tuple array for Solidity
  const poolKey = [
    TOKEN_A,                // currency0
    TOKEN_B,                // currency1
    3000,                   // fee
    60,                     // tickSpacing
    UNIZWAP_HOOK_ADDRESS    // hooks
  ];

  // Encode hookData
  const minOutputAmount = ethers.parseEther('0'); // Set to 0 to avoid slippage revert
  const hookData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256', 'string', 'bool', 'string', 'bytes32'],
    [wallet.address, 0, 'ROUTER_REF', true, 'router', commitmentBytes32] // minOutput = 0 to avoid revert
  );

  console.log('HookData encoded:');
  console.log('- User:', wallet.address);
  console.log('- Min Output:', ethers.formatEther(minOutputAmount));
  console.log('- Ref Code: ROUTER_REF');
  console.log('- Is Active: true');
  console.log('- Pattern: router');
  console.log('- Commitment:', commitmentBytes32);

  // Execute swap through SwapRouter with proper function
  console.log('Executing swap through SwapRouter...');
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  
  const swapTx = await swapRouter.swapExactTokensForTokens(
    amountIn,           // amountIn
    minOutputAmount,    // amountOutMinimum
    true,               // zeroForOne
    poolKey,            // poolKey
    hookData,           // hookData
    wallet.address,     // receiver
    deadline            // deadline
  );
  
  const receipt = await swapTx.wait();
  console.log('✅ Swap executed successfully!');
  console.log('Transaction hash:', receipt.hash);

  // Check token balances after swap
  const token0BalanceAfter = await token0.balanceOf(wallet.address);
  const token1BalanceAfter = await token1.balanceOf(wallet.address);
  console.log('Wallet TOKEN_A after swap:', ethers.formatEther(token0BalanceAfter));
  console.log('Wallet TOKEN_B after swap:', ethers.formatEther(token1BalanceAfter));

  // Check deposited balances after swap
  const depositedAAfter = await unizwapHook.getDepositBalance(wallet.address, TOKEN_A);
  const depositedBAfter = await unizwapHook.getDepositBalance(wallet.address, TOKEN_B);
  console.log('Deposited TOKEN_A after swap:', ethers.formatEther(depositedAAfter));
  console.log('Deposited TOKEN_B after swap:', ethers.formatEther(depositedBAfter));

  console.log('\n=== Swap Summary ===');
  console.log('Token A change:', ethers.formatEther(token0BalanceAfter - token0BalanceBefore));
  console.log('Token B change:', ethers.formatEther(token1BalanceAfter - token1BalanceBefore));
  console.log('\n💡 Output tokens collected to vault with commitment');
  console.log('You can now withdraw privately using:');
  console.log('npx tsx shortcut/unizwap-hook/07_WithdrawPrivate_Router.ts');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
