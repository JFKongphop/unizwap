import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as circomlibjs from 'circomlibjs';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ABIs
const UNIZWAP_HOOK_ABI = [
  'function swap((address,address,uint24,int24,address) key, bool zeroForOne, int256 amountSpecified, bytes hookData) external',
  'function getDepositBalance(address user, address token) external view returns (uint256)'
];

async function main() {
  // Configuration
  const SEPOLIA_RPC = process.env.SEPOLIA!;
  const PRIVATE_KEY = process.env.PRIVATE_KEY_2!;
  const TOKEN_A = process.env.TOKEN_A!;
  const TOKEN_B = process.env.TOKEN_B!;
  const UNIZWAP_HOOK_ADDRESS = process.env.UNIZWAP_HOOK_ADDRESS!;

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('=== Swapping with UnizwapHook (Vault Pattern) ===');
  console.log('Wallet:', wallet.address);
  console.log('UnizwapHook:', UNIZWAP_HOOK_ADDRESS);
  console.log('Token In (A):', TOKEN_A);
  console.log('Token Out (B):', TOKEN_B);

  // Swap amount (10 tokens)
  const amountIn = ethers.parseEther('10');
  console.log('Amount In:', ethers.formatEther(amountIn));

  // Contract instance
  const unizwapHook = new ethers.Contract(UNIZWAP_HOOK_ADDRESS, UNIZWAP_HOOK_ABI, wallet);

  // Check deposited balance before swap
  const balanceBefore = await unizwapHook.getDepositBalance(wallet.address, TOKEN_A);
  console.log('Deposited TOKEN_A before swap:', ethers.formatEther(balanceBefore));

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

  // Vault swap unique values - use these in 06_WithdrawPrivate_Vault.ts
  const secret = 111111n;
  const nonce = 222222n;
  const token_address = BigInt(TOKEN_B); // Output token address
  const deposit_amount = 1000n; // This is symbolic, actual amount comes from swap output

  // Calculate commitment: H(token_address, deposit_amount, H(secret, nonce))
  const secretHash = poseidonHash([secret, nonce]);
  const commitment = poseidonHash([token_address, deposit_amount, secretHash]);

  console.log('Secret:', secret.toString());
  console.log('Nonce:', nonce.toString());
  console.log('Commitment:', commitment.toString());
  console.log('Token Address:', TOKEN_B);
  console.log('\n💾 SAVE THESE FOR VAULT WITHDRAWAL (06_WithdrawPrivate_Vault.ts)');
  console.log('');

  // Convert commitment to bytes32
  const commitmentBytes32 = ethers.toBeHex(commitment, 32);

  // Create PoolKey as tuple array for Solidity
  const poolKey = [
    TOKEN_A,              // currency0
    TOKEN_B,              // currency1
    3000,                 // fee
    60,                   // tickSpacing
    UNIZWAP_HOOK_ADDRESS  // hooks
  ];

  // Encode hookData with: user address, minimum output amount, referral code, isActive, pattern, commitment
  const minOutputAmount = 0; // Set to 0 to skip slippage check (accept any output)
  const hookData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256', 'string', 'bool', 'string', 'bytes32'],
    [wallet.address, minOutputAmount, 'REF123', true, 'vault', commitmentBytes32]
  );

  console.log('HookData encoded:');
  console.log('- User:', wallet.address);
  console.log('- Min Output:', ethers.formatEther(minOutputAmount));
  console.log('- Ref Code: REF123');
  console.log('- Is Active: true');
  console.log('- Pattern: vault');
  console.log('- Commitment:', commitmentBytes32);

  // Execute swap using UnizwapHook's swap function (uses deposited tokens)
  console.log('Executing swap...');
  const swapTx = await unizwapHook.swap(
    poolKey,
    true, // zeroForOne
    -BigInt(amountIn.toString()), // negative for exact input
    hookData
  );
  await swapTx.wait();
  console.log('✅ Swap executed successfully!');
  console.log('Transaction hash:', swapTx.hash);

  // Check balances after swap
  const balanceAfterA = await unizwapHook.getDepositBalance(wallet.address, TOKEN_A);
  const balanceAfterB = await unizwapHook.getDepositBalance(wallet.address, TOKEN_B);

  console.log('Deposited TOKEN_A after swap:', ethers.formatEther(balanceAfterA));
  console.log('Deposited TOKEN_B after swap:', ethers.formatEther(balanceAfterB));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
