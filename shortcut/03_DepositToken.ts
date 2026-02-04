import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ABIs
const UNIZWAP_HOOK_ABI = [
  'function deposit(address token, uint256 amount) external',
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
  const UNIZWAP_HOOK_ADDRESS = process.env.UNIZWAP_HOOK_ADDRESS!;

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('=== Depositing Tokens to UnizwapHook ===');
  console.log('Wallet:', wallet.address);
  console.log('UnizwapHook:', UNIZWAP_HOOK_ADDRESS);
  console.log('Token:', TOKEN_A);

  // Deposit amount (10 tokens)
  const depositAmount = ethers.parseEther('10');
  console.log('Amount:', ethers.formatEther(depositAmount));

  // Contract instances
  const token0 = new ethers.Contract(TOKEN_A, ERC20_ABI, wallet);
  const unizwapHook = new ethers.Contract(UNIZWAP_HOOK_ADDRESS, UNIZWAP_HOOK_ABI, wallet);

  // Check wallet balance
  const walletBalance = await token0.balanceOf(wallet.address);
  console.log('Wallet balance:', ethers.formatEther(walletBalance));

  // Approve UnizwapHook to spend tokens
  console.log('Approving UnizwapHook to spend tokens...');
  const approveTx = await token0.approve(UNIZWAP_HOOK_ADDRESS, depositAmount);
  await approveTx.wait();
  console.log('✅ Token approved to UnizwapHook');

  // Deposit tokens
  console.log('Depositing tokens...');
  const depositTx = await unizwapHook.deposit(TOKEN_A, depositAmount);
  await depositTx.wait();
  console.log('✅ Tokens deposited successfully!');
  console.log('Transaction hash:', depositTx.hash);

  // Check deposited balance
  const depositedBalance = await unizwapHook.getDepositBalance(wallet.address, TOKEN_A);
  console.log('Deposited balance:', ethers.formatEther(depositedBalance));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
