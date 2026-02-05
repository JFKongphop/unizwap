import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { buildPoseidon } from 'circomlibjs';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_2!, provider);

const POSITION_MANAGER = '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const TOKEN_A = process.env.TOKEN_A!;
const TOKEN_B = process.env.TOKEN_B!;
const UNIZWAP_HOOK = process.env.UNIZWAP_HOOK_ADDRESS!;

const ERC20_ABI = ['function approve(address spender, uint256 amount) external returns (bool)'];

async function main() {
  console.log('🚀 Step 1: Add Liquidity with Commitment');
  console.log('Wallet:', wallet.address);
  console.log('Hook:', UNIZWAP_HOOK);

  // Get next token ID from PositionManager
  const pmContract = new ethers.Contract(POSITION_MANAGER, [
    'function nextTokenId() external view returns (uint256)'
  ], wallet);
  
  const expectedTokenId = await pmContract.nextTokenId();
  console.log('\n📝 Next Token ID:', expectedTokenId.toString());

  // Privacy parameters (hard-coded for consistency with removal)
  const secret = 987654n;
  const nonce = 321098n;

  // Generate commitment using Poseidon hash
  const poseidon = await buildPoseidon();
  const commitmentBigInt = poseidon([secret, nonce, expectedTokenId]);
  const commitment = poseidon.F.toObject(commitmentBigInt).toString(16).padStart(64, '0');

  console.log('\n🔐 Privacy Parameters:');
  console.log('Secret:', secret.toString());
  console.log('Nonce:', nonce.toString());
  console.log('Expected TokenId:', expectedTokenId.toString());
  console.log('Commitment:', '0x' + commitment);

  // Pool parameters
  const fee = 3000; // 0.3% fee (must match pool creation)
  const tickSpacing = 60;
  const poolKey = [TOKEN_A, TOKEN_B, fee, tickSpacing, UNIZWAP_HOOK];

  const tickLower = -45000;
  const tickUpper = 45000;
  const liquidity = ethers.parseEther('100');

  console.log('\n💰 Liquidity Amount:', ethers.formatEther(liquidity));

  // Approve tokens to Permit2
  console.log('\n✅ Approving tokens to Permit2...');
  const token0 = new ethers.Contract(TOKEN_A, ERC20_ABI, wallet);
  const token1 = new ethers.Contract(TOKEN_B, ERC20_ABI, wallet);
  const permit2 = new ethers.Contract(PERMIT2, ['function approve(address token, address spender, uint160 amount, uint48 expiration) external'], wallet);

  await (await token0.approve(PERMIT2, ethers.MaxUint256)).wait();
  await (await token1.approve(PERMIT2, ethers.MaxUint256)).wait();
  console.log('✅ Tokens approved to Permit2');

  // Approve PositionManager through Permit2
  console.log('✅ Approving PositionManager through Permit2...');
  const expiration = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
  const maxUint160 = 2n**160n - 1n;
  
  await (await permit2.approve(TOKEN_A, POSITION_MANAGER, maxUint160, expiration)).wait();
  console.log('✓ Token0 approved through Permit2');
  
  await (await permit2.approve(TOKEN_B, POSITION_MANAGER, maxUint160, expiration)).wait();
  console.log('✓ Token1 approved through Permit2');

  // Encode hookData with commitment
  const hookData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], ['0x' + commitment]);

  // Encode actions: MINT_POSITION (2), SETTLE_PAIR (13)
  const actions = ethers.solidityPacked(['uint8', 'uint8'], [2, 13]);

  // Slippage tolerance
  const MAX_UINT128 = (1n << 128n) - 1n;

  // Encode params
  const params = [
    // MINT_POSITION params: (PoolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData)
    // Mint NFT directly to hook contract instead of wallet!
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)', 'int24', 'int24', 'uint256', 'uint128', 'uint128', 'address', 'bytes'],
      [poolKey, tickLower, tickUpper, liquidity, MAX_UINT128, MAX_UINT128, UNIZWAP_HOOK, hookData]
    ),
    // SETTLE_PAIR params: (currency0, currency1)
    ethers.AbiCoder.defaultAbiCoder().encode(['address', 'address'], [TOKEN_A, TOKEN_B])
  ];

  const unlockData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes', 'bytes[]'], [actions, params]);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // Add liquidity
  console.log('\n🔄 Adding liquidity...');
  const positionManager = new ethers.Contract(
    POSITION_MANAGER,
    ['function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable'],
    wallet
  );

  const tx = await positionManager.modifyLiquidities(unlockData, deadline);
  console.log('Transaction hash:', tx.hash);

  const receipt = await tx.wait();
  console.log('✅ Liquidity added! Block:', receipt.blockNumber);

  // Verify NFT ownership
  const nftContract = new ethers.Contract(
    POSITION_MANAGER,
    ['function ownerOf(uint256 tokenId) view returns (address)'],
    provider
  );

  const owner = await nftContract.ownerOf(expectedTokenId);
  console.log('\n📝 NFT Owner:', owner);
  console.log('Hook address:', UNIZWAP_HOOK);
  console.log('NFT owned by hook:', owner.toLowerCase() === UNIZWAP_HOOK.toLowerCase());

  if (owner.toLowerCase() === UNIZWAP_HOOK.toLowerCase()) {
    console.log('✅ SUCCESS! NFT minted directly to hook contract');
  } else {
    console.log('❌ ERROR: NFT not owned by hook');
  }

  console.log('\n💾 SAVE THESE FOR STEP 8 (Remove Liquidity):');
  console.log('Secret:', secret.toString());
  console.log('Nonce:', nonce.toString());
  console.log('TokenId:', expectedTokenId.toString());
  console.log('Commitment:', commitment);

  console.log('\n➡️  Next: Skip Step 2, proceed to Step 3 (03_DepositToken.ts)');
  console.log('     Or run Step 8 (08_RemoveLiquidity.ts) to test private LP removal');
}

main().catch(console.error);
