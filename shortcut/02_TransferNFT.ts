import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_2!, provider);

const POSITION_MANAGER = '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4';
const UNIZWAP_HOOK = process.env.UNIZWAP_HOOK_ADDRESS!;

// ⚠️ UPDATE THESE VALUES FROM STEP 1 OUTPUT
const TOKEN_ID = 22926; // From Step 1
const SECRET = '987654'; // Save for step 3
const NONCE = '321098'; // Save for step 3
const COMMITMENT = '1afd984a5fa6f69521506943b52eaddb1c96059434f334e73bdaa16947441829'; // Save for step 3

const ERC721_ABI = [
  'function transferFrom(address from, address to, uint256 tokenId) external',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function approve(address to, uint256 tokenId) external'
];

async function main() {
  console.log('🚀 Step 2: Transfer NFT to Hook Contract');
  console.log('Your wallet:', wallet.address);
  console.log('Hook address:', UNIZWAP_HOOK);
  console.log('Token ID:', TOKEN_ID);

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
