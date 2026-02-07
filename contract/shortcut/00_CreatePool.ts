import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_2!, provider);

const POSITION_MANAGER = '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4';
const TOKEN_A = process.env.TOKEN_A!;
const TOKEN_B = process.env.TOKEN_B!;
const UNIZWAP_HOOK = process.env.UNIZWAP_HOOK_ADDRESS!;

const POSITION_MANAGER_ABI = [
  'function initializePool(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) external'
];

async function main() {
  console.log('🚀 Step 0: Create Pool with UnizwapHook');
  console.log('Wallet:', wallet.address);
  console.log('Hook:', UNIZWAP_HOOK);
  console.log('Token A:', TOKEN_A);
  console.log('Token B:', TOKEN_B);

  // Pool parameters
  const fee = 3000; // 0.3% fee
  const tickSpacing = 60;
  
  const poolKey = {
    currency0: TOKEN_A,
    currency1: TOKEN_B,
    fee: fee,
    tickSpacing: tickSpacing,
    hooks: UNIZWAP_HOOK
  };

  // Initial price: 1:1 (sqrtPriceX96 = sqrt(1) * 2^96)
  const sqrtPriceX96 = '79228162514264337593543950336';

  console.log('\n📊 Pool Configuration:');
  console.log('Fee:', fee, '(0.3%)');
  console.log('Tick Spacing:', tickSpacing);
  console.log('Initial Price: 1:1');

  // Create pool
  console.log('\n🔄 Creating pool...');
  const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, wallet);

  const tx = await positionManager.initializePool(poolKey, sqrtPriceX96);
  console.log('Transaction hash:', tx.hash);

  const receipt = await tx.wait();
  console.log('✅ Pool created! Block:', receipt.blockNumber);

  console.log('\n📝 Pool Details:');
  console.log('Currency0:', poolKey.currency0);
  console.log('Currency1:', poolKey.currency1);
  console.log('Fee:', poolKey.fee);
  console.log('Tick Spacing:', poolKey.tickSpacing);
  console.log('Hooks:', poolKey.hooks);

  console.log('\n➡️  Next: Run 01_AddLiquidity.ts');
}

main().catch(console.error);
