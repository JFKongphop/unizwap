import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_2!, provider);

const POSITION_MANAGER = '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4';
const UNIZWAP_HOOK = process.env.UNIZWAP_HOOK_ADDRESS!;

const ERC721_ABI = [
  'function transferFrom(address from, address to, uint256 tokenId) external',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function approve(address to, uint256 tokenId) external',
  'function getPositionLiquidity(uint256 tokenId) external view returns (uint128 liquidity)'
];

async function getLatestTokenId(): Promise<string | null> {
  console.log('🔍 Finding your latest NFT Position Token ID...\n');

  const transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = 10197458; // Starting block for pool creation

  const filter = {
    address: POSITION_MANAGER,
    topics: [
      transferEventSignature,
      null,
      ethers.zeroPadValue(wallet.address, 32)
    ],
    fromBlock: fromBlock,
    toBlock: currentBlock
  };

  try {
    const logs = await provider.getLogs(filter);

    if (logs.length === 0) {
      console.log('❌ No positions found for your address');
      return null;
    }

    console.log(`✅ Found ${logs.length} position(s)\n`);

    const positionManager = new ethers.Contract(POSITION_MANAGER, ERC721_ABI, provider);
    const tokenIds: { tokenId: string; blockNumber: number; liquidity: bigint }[] = [];

    for (const log of logs) {
      const tokenId = BigInt(log.topics[3]!).toString();
      
      try {
        const liquidity = await positionManager.getPositionLiquidity(tokenId);
        
        if (liquidity > 0n) {
          tokenIds.push({
            tokenId,
            blockNumber: log.blockNumber,
            liquidity
          });
        }
      } catch (error) {
        // Skip positions with errors
      }
    }

    if (tokenIds.length === 0) {
      console.log('❌ No active positions found');
      return null;
    }

    // Sort by block number (newest first)
    tokenIds.sort((a, b) => b.blockNumber - a.blockNumber);

    const latestTokenId = tokenIds[0].tokenId;
    console.log(`💡 Latest active token ID: ${latestTokenId}`);
    console.log(`   Liquidity: ${ethers.formatEther(tokenIds[0].liquidity)}`);
    console.log(`   Block: ${tokenIds[0].blockNumber}\n`);

    return latestTokenId;
  } catch (error) {
    console.error('❌ Error fetching token ID:', error);
    return null;
  }
}

async function main() {
  console.log('🚀 Step 2: Transfer NFT to Hook Contract');
  console.log('Your wallet:', wallet.address);
  console.log('Hook address:', UNIZWAP_HOOK);
  console.log('');

  // Automatically get the latest token ID
  const TOKEN_ID = await getLatestTokenId();

  if (!TOKEN_ID) {
    console.error('❌ Could not find any active position token ID');
    console.log('Please run Step 1 (01_AddLiquidity.ts) first');
    return;
  }

  console.log('Using Token ID:', TOKEN_ID);

  const positionManager = new ethers.Contract(POSITION_MANAGER, ERC721_ABI, wallet);

  // Check current owner
  const currentOwner = await positionManager.ownerOf(TOKEN_ID);
  console.log('\n📝 Current NFT Owner:', currentOwner);

  if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error('❌ You do not own this NFT!');
    console.log('Expected owner:', wallet.address);
    console.log('Actual owner:', currentOwner);
    return;
  }

  // Transfer NFT to hook
  console.log('\n🔄 Transferring NFT to hook...');
  const tx = await positionManager.transferFrom(wallet.address, UNIZWAP_HOOK, TOKEN_ID);
  console.log('Transaction hash:', tx.hash);

  const receipt = await tx.wait();
  console.log('✅ Transfer complete! Block:', receipt.blockNumber);

  // Verify new owner
  const newOwner = await positionManager.ownerOf(TOKEN_ID);
  console.log('\n📝 New NFT Owner:', newOwner);
  console.log('Hook address:', UNIZWAP_HOOK);
  console.log('Transfer successful:', newOwner.toLowerCase() === UNIZWAP_HOOK.toLowerCase());

  if (newOwner.toLowerCase() === UNIZWAP_HOOK.toLowerCase()) {
    console.log('\n✅ SUCCESS! Hook now owns the NFT');
    console.log('➡️  Next: Run 03_DepositToken.ts to deposit tokens for swaps');
  } else {
    console.log('\n❌ Transfer failed - hook does not own NFT');
  }
}

main().catch(console.error);
