import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as circomlibjs from 'circomlibjs';
import { MerkleTree } from 'fixed-merkle-tree';
import * as snarkjs from 'snarkjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Fixed Merkle tree depth
const TREE_LEVELS = 10;

// ⚠️ Fixed values (match AddLiquidity)
const SECRET = 987654n;
const NONCE = 321098n;

// ABIs
const POSITION_MANAGER_ABI = [
  'function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable',
  'function getPositionLiquidity(uint256 tokenId) external view returns (uint128)',
  'function ownerOf(uint256 tokenId) view returns (address)'
];

const UNIZWAP_HOOK_ABI = [
  'function roots(uint256) external view returns (bytes32)',
  'function currentRootIndex() external view returns (uint32)',
  'function nullifiers(bytes32) external view returns (bool)',
  'function getTokenIdByCommitment(bytes32 commitment) external view returns (uint256)',
  'function removeLiquidityWithProof(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint256 tokenId, uint128 liquidity, address recipient, uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[6] _pubSignals) external',
  'event NewLeafInserted(bytes32 indexed commitment, uint32 indexed leafIndex, bytes32 root)'
];

async function getLatestTokenIdOwnedByHook(provider: ethers.JsonRpcProvider, hookAddress: string, positionManagerAddress: string): Promise<bigint | null> {
  console.log('🔍 Finding latest NFT owned by hook...\n');

  const transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = 10197458; // Starting block for pool creation

  const filter = {
    address: positionManagerAddress,
    topics: [
      transferEventSignature,
      null,
      ethers.zeroPadValue(hookAddress, 32) // to = hook address
    ],
    fromBlock: fromBlock,
    toBlock: currentBlock
  };

  try {
    const logs = await provider.getLogs(filter);

    if (logs.length === 0) {
      console.log('❌ No positions found owned by hook');
      return null;
    }

    console.log(`✅ Found ${logs.length} position(s) transferred to hook\n`);

    const positionManagerABI = [
      'function getPositionLiquidity(uint256 tokenId) external view returns (uint128 liquidity)',
      'function ownerOf(uint256 tokenId) view returns (address)'
    ];
    const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, provider);
    const tokenIds: { tokenId: bigint; blockNumber: number; liquidity: bigint }[] = [];

    for (const log of logs) {
      const tokenId = BigInt(log.topics[3]!);
      
      try {
        const owner = await positionManager.ownerOf(tokenId);
        const liquidity = await positionManager.getPositionLiquidity(tokenId);
        
        // Only include if hook still owns it and has liquidity
        if (owner.toLowerCase() === hookAddress.toLowerCase() && liquidity > 0n) {
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
      console.log('❌ No active positions owned by hook');
      return null;
    }

    // Sort by block number (newest first)
    tokenIds.sort((a, b) => b.blockNumber - a.blockNumber);

    const latestTokenId = tokenIds[0].tokenId;
    console.log(`💡 Latest active token ID owned by hook: ${latestTokenId}`);
    console.log(`   Liquidity: ${ethers.formatEther(tokenIds[0].liquidity)}`);
    console.log(`   Block: ${tokenIds[0].blockNumber}\n`);

    return latestTokenId;
  } catch (error) {
    console.error('❌ Error fetching token ID:', error);
    return null;
  }
}

async function main() {
  // Configuration
  const SEPOLIA_RPC = process.env.SEPOLIA!;
  const PRIVATE_KEY = process.env.PRIVATE_KEY!; // Can be ANY wallet - just needs valid proof!
  const TOKEN_A = process.env.TOKEN_A!;
  const TOKEN_B = process.env.TOKEN_B!;
  const UNIZWAP_HOOK_ADDRESS = process.env.UNIZWAP_HOOK_ADDRESS!;
  const POSITION_MANAGER = '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4';
  const FROM_BLOCK = 10191164; // New deployment block

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('🚀 Step 8: Remove Liquidity with ZK Proof (Cross-Wallet)');
  console.log('Wallet:', wallet.address, '(Different from wallet that added LP!)');
  console.log('Hook:', UNIZWAP_HOOK_ADDRESS);

  const unizwapHook = new ethers.Contract(UNIZWAP_HOOK_ADDRESS, UNIZWAP_HOOK_ABI, wallet);

  // First, compute our commitment to look up the token ID
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  const poseidonHash = (inputs: any) => {
    if (!Array.isArray(inputs)) inputs = [inputs];
    const bigints = inputs.map(BigInt);
    const res = poseidon(bigints);
    return F.toString(res);
  };

  console.log('\n🔐 Computing commitment with your secret/nonce...');
  console.log('Secret:', SECRET.toString());
  console.log('Nonce:', NONCE.toString());

  // We need to try different token IDs to find ours
  // Get latest token ID to know the range
  const pmContract = new ethers.Contract(POSITION_MANAGER, [
    'function nextTokenId() external view returns (uint256)'
  ], wallet);
  const nextTokenId = await pmContract.nextTokenId();
  
  console.log('Searching for your token ID...');
  
  let TOKEN_ID = 23014n;
  let commitment: string | null = null;

  const testCommitment = poseidonHash([SECRET, NONCE, BigInt(TOKEN_ID)]);
  const testCommitmentHex = '0x' + BigInt(testCommitment).toString(16).padStart(64, '0');
  commitment = testCommitment;
  console.log('✅ Found your token ID:', TOKEN_ID.toString());
  console.log('   Commitment:', testCommitmentHex);

  if (!TOKEN_ID || !commitment) {
    console.error('❌ Could not find token ID for your secret/nonce');
    console.log('Make sure you used the correct SECRET and NONCE from Step 1');
    console.log('Usage: npx tsx 08_RemoveLiquidity.ts [SECRET] [NONCE]');
    return;
  }

  console.log('Token ID:', TOKEN_ID.toString());

  const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, wallet);
  
  // Check liquidity
  const liquidityToRemove = await positionManager.getPositionLiquidity(TOKEN_ID);
  
  if (liquidityToRemove === 0n) {
    console.log('❌ Position has no liquidity to remove');
    return;
  }

  console.log('Liquidity to remove:', liquidityToRemove.toString());

  // Compute commitment and nullifier (we already have commitment from above)
  const commitmentHex = '0x' + BigInt(commitment).toString(16).padStart(64, '0');
  
  console.log('\n🔐 Privacy Parameters:');
  console.log('Secret:', SECRET.toString());
  console.log('Nonce:', NONCE.toString());
  console.log('Token ID:', TOKEN_ID.toString());
  console.log('Commitment:', commitmentHex);

  // Compute nullifier = Poseidon(secret, tokenId)
  const nullifier = poseidonHash([SECRET, TOKEN_ID]);
  const nullifierHex = '0x' + BigInt(nullifier).toString(16).padStart(64, '0');
  
  console.log('Nullifier:', nullifierHex);

  // Fetch NewLeafInserted events to build the Merkle tree
  console.log('\n📡 Fetching commitment leaves from contract events...');
  
  const filter = unizwapHook.filters.NewLeafInserted();
  const events = await unizwapHook.queryFilter(filter, FROM_BLOCK, 'latest') as any;
  
  console.log('  Found', events.length, 'leaf insertions');
  
  // Extract commitments from events and sort by leafIndex
  const leafMap = new Map<number, bigint>();
  for (const event of events) {
    const eventCommitment = BigInt(event.args.commitment);
    const leafIndex = Number(event.args.leafIndex);
    leafMap.set(leafIndex, eventCommitment);
    console.log(`  Leaf ${leafIndex}:`, eventCommitment.toString().substring(0, 20) + '...');
  }
  
  // Build leaves array with actual commitments
  const leaves = Array(1024).fill(0n);
  for (const [index, leafCommitment] of leafMap.entries()) {
    leaves[index] = leafCommitment;
  }
  
  // Verify our commitment is in the tree
  const commitmentBigInt = BigInt(commitment) as any;
  const ourLeafIndex = Array.from(leafMap.entries()).find(([_, c]) => c === commitmentBigInt)?.[0];
  if (ourLeafIndex === undefined) {
    console.log('');
    console.log('❌ Error: Your commitment not found in the tree!');
    console.log('  Expected commitment:', commitment);
    console.log('  Make sure you added liquidity with the same secret/nonce/tokenId');
    process.exit(1);
  }
  console.log('  ✅ Your commitment found at index:', ourLeafIndex);

  // Create Merkle tree with actual leaves from events
  const tree = new MerkleTree(TREE_LEVELS, leaves, {
    hashFunction: (a: any, b: any) => BigInt(poseidonHash([a, b])) as any,
    zeroElement: 0n as any
  });

  const { pathElements, pathIndices, pathRoot } = tree.proof(commitmentBigInt);

  console.log('\n🌳 Merkle Tree:');
  console.log('  Root:', pathRoot.toString());
  console.log('  Levels:', TREE_LEVELS);

  // Get current root from contract
  const currentRootIndex = await unizwapHook.currentRootIndex();
  const merkleRoot = await unizwapHook.roots(currentRootIndex);
  
  console.log('  Contract Root:', merkleRoot);
  console.log('  Computed Root:', '0x' + pathRoot.toString(16).padStart(64, '0'));

  // Generate ZK proof
  console.log('\n🔨 Generating ZK proof...');
  
  const input = {
    merkle_root: pathRoot.toString(),
    nullifier: nullifier.toString(),
    tokenAAddress: BigInt(TOKEN_A).toString(),
    tokenBAddress: BigInt(TOKEN_B).toString(),
    tokenId: TOKEN_ID.toString(),
    liquidityAmount: liquidityToRemove.toString(),
    secret: SECRET.toString(),
    nonce: NONCE.toString(),
    merkle_pathIndices: pathIndices.map((x: any) => x.toString()),
    merkle_path: pathElements.map((x: any) => x.toString())
  };

  const wasmPath = path.join(__dirname, '../../proof/lp/unizwap-removelp.wasm');
  const zkeyPath = path.join(__dirname, '../../proof/lp/unizwap-removelp.zkey');

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  console.log('  ✅ Proof generated successfully');
  console.log('  Public signals:', publicSignals.length);

  // Format proof for Solidity
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = calldata.replace(/["[\]\s]/g, "").split(',');
  
  const pA: [bigint, bigint] = [BigInt(argv[0]), BigInt(argv[1])];
  const pB: [[bigint, bigint], [bigint, bigint]] = [
    [BigInt(argv[2]), BigInt(argv[3])],
    [BigInt(argv[4]), BigInt(argv[5])]
  ];
  const pC: [bigint, bigint] = [BigInt(argv[6]), BigInt(argv[7])];
  const pubSignals: [bigint, bigint, bigint, bigint, bigint, bigint] = [
    BigInt(argv[8]),  // merkleRoot
    BigInt(argv[9]),  // nullifier
    BigInt(argv[10]), // tokenA
    BigInt(argv[11]), // tokenB
    BigInt(argv[12]), // tokenId
    BigInt(argv[13])  // liquidity
  ];

  // Pool parameters
  const fee = 3000;
  const tickSpacing = 60;
  const poolKey = {
    currency0: TOKEN_A,
    currency1: TOKEN_B,
    fee: fee,
    tickSpacing: tickSpacing,
    hooks: UNIZWAP_HOOK_ADDRESS
  };

  // Call hook's removeLiquidityWithProof
  console.log('\n🔄 Removing liquidity via hook...');

  const tx = await unizwapHook.removeLiquidityWithProof(
    poolKey,
    TOKEN_ID,
    liquidityToRemove,
    wallet.address, // Tokens sent to THIS wallet (different from LP adder)
    pA,
    pB,
    pC,
    pubSignals,
    {
      maxFeePerGas: ethers.parseUnits('5', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei')
    }
  );

  console.log('Transaction hash:', tx.hash);
  const receipt = await tx.wait();
  console.log('✅ Liquidity removed! Block:', receipt.blockNumber);

  // Check token balances
  const token0 = new ethers.Contract(TOKEN_A, ['function balanceOf(address) view returns (uint256)'], provider);
  const token1 = new ethers.Contract(TOKEN_B, ['function balanceOf(address) view returns (uint256)'], provider);

  const balance0 = await token0.balanceOf(wallet.address);
  const balance1 = await token1.balanceOf(wallet.address);

  console.log('\n💰 Your token balances:');
  console.log('Token A:', ethers.formatUnits(balance0, 18));
  console.log('Token B:', ethers.formatUnits(balance1, 18));

  console.log('\n✅ SUCCESS! Cross-wallet private LP removal complete!');
  console.log('Wallet A (PRIVATE_KEY_2) added LP → Wallet B (PRIVATE_KEY) removed LP ✅');
  console.log('🔐 Privacy preserved: Only those with secret/nonce can remove liquidity!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
