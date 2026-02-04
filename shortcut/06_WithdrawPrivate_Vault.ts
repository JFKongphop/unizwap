import { ethers } from 'ethers';
import dotenv from 'dotenv';
import * as snarkjs from 'snarkjs';
import * as circomlibjs from 'circomlibjs';
import { MerkleTree } from 'fixed-merkle-tree';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TREE_LEVELS = 10;

// ABIs
const UNIZWAP_HOOK_ABI = [
  'function withdrawPrivate(bytes32 commitment, uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[4] calldata _pubSignals) external',
  'function userDeposits(address user, address token) external view returns (uint256)',
  'function commitmentDeposits(bytes32 commitment, address token) external view returns (uint256)',
  'function nullifiers(bytes32) external view returns (bool)',
  'function isKnownRoot(bytes32 _root) external view returns (bool)',
  'function roots(uint256) external view returns (bytes32)',
  'function currentRootIndex() external view returns (uint32)',
  'event Withdraw(address indexed user, address indexed token, uint256 amount)',
  'event NullifierUsed(bytes32 indexed nullifier)',
  'event NewLeafInserted(bytes32 indexed commitment, uint32 indexed leafIndex, bytes32 root)'
];

async function main() {
  console.log('='.repeat(60));
  console.log('UNIZWAPHOOK PRIVATE WITHDRAWAL - VAULT SWAP');
  console.log('='.repeat(60));
  console.log('');

  // Configuration
  const SEPOLIA_RPC = process.env.SEPOLIA!;
  const PRIVATE_KEY = process.env.PRIVATE_KEY_2!;
  const TOKEN_B = process.env.TOKEN_B!; // Output token from swap
  const UNIZWAP_HOOK_ADDRESS = process.env.UNIZWAP_HOOK_ADDRESS!;

  // Setup provider and wallets
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const depositWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const withdrawWallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('🔐 Privacy Withdrawal Setup:');
  console.log('  Wallet Address:', withdrawWallet.address);
  console.log('  UnizwapHook:', UNIZWAP_HOOK_ADDRESS);
  console.log('');

  // Initialize Poseidon hash
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  const poseidonHash = (inputs: any) => {
    if (!Array.isArray(inputs)) inputs = [inputs];
    const bigints = inputs.map(BigInt);
    const res = poseidon(bigints);
    return BigInt(F.toString(res));
  };

  // Private inputs (VAULT SWAP values from 04_SwapWithVault.ts)
  const secret = 111111n;
  const nonce = 222222n;
  const token_address = BigInt(TOKEN_B); // Output token from swap (TOKEN_B)
  const deposit_amount = 1000n; // Symbolic amount (commitment doesn't reveal actual amount)

  // Calculate commitment: H(token_address, deposit_amount, H(secret, nonce))
  const secretHash = poseidonHash([secret, nonce]);
  const commitment = poseidonHash([token_address, deposit_amount, secretHash]) as any;

  console.log('💰 Deposit Details:');
  console.log('  Token Address:', TOKEN_B);
  console.log('  Amount:', deposit_amount.toString());
  console.log('  Secret:', secret.toString());
  console.log('  Nonce:', nonce.toString());
  console.log('  Commitment:', commitment.toString());
  console.log('');

  // Fetch NewLeafInserted events to build the correct Merkle tree
  console.log('📡 Fetching commitment leaves from contract events...');
  const unizwapHook = new ethers.Contract(UNIZWAP_HOOK_ADDRESS, UNIZWAP_HOOK_ABI, withdrawWallet);
  
  const filter = unizwapHook.filters.NewLeafInserted();
  const events = await unizwapHook.queryFilter(filter, 10178301, 'latest') as any;
  
  console.log('  Found', events.length, 'leaf insertions');
  
  // Extract commitments from events and sort by leafIndex
  const leafMap = new Map<number, bigint>();
  for (const event of events) {
    const eventCommitment = BigInt(event.args.commitment);
    const leafIndex = Number(event.args.leafIndex);
    leafMap.set(leafIndex, eventCommitment);
    console.log(`  Leaf ${leafIndex}:`, eventCommitment.toString());
  }
  
  // Build leaves array with actual commitments
  const leaves = Array(1024).fill(0n);
  for (const [index, leafCommitment] of leafMap.entries()) {
    leaves[index] = leafCommitment;
  }
  
  // Verify our commitment is in the tree
  const ourLeafIndex = Array.from(leafMap.entries()).find(([_, c]) => c === commitment)?.[0];
  if (ourLeafIndex === undefined) {
    console.log('');
    console.log('❌ Error: Your commitment not found in the tree!');
    console.log('  Expected commitment:', commitment.toString());
    console.log('  Make sure you ran 05_SwapWithVault.ts first');
    process.exit(1);
  }
  console.log('  ✅ Your commitment found at index:', ourLeafIndex);
  console.log('');

  // Create Merkle tree with actual leaves from events
  const tree = new MerkleTree(TREE_LEVELS, leaves, {
    hashFunction: (a: any, b: any) => poseidonHash([a, b]) as any,
    zeroElement: 0n as any
  });

  const { pathElements, pathIndices, pathRoot } = tree.proof(commitment);

  console.log('🌳 Merkle Tree:');
  console.log('  Root:', pathRoot.toString());
  console.log('  Levels:', TREE_LEVELS);
  console.log('');

  // Public inputs
  const input = {
    merkle_root: pathRoot.toString(),
    nullifier: nonce.toString(),
    token_address: token_address.toString(),
    deposit_amount: deposit_amount.toString(),
    secret: secret.toString(),
    nonce: nonce.toString(),
    merkle_pathIndices: pathIndices.map((x: any) => x.toString()),
    merkle_path: pathElements.map((x: any) => x.toString())
  };

  const wasmPath = path.join(__dirname, '..', '..', 'proof', 'swap', 'unizwap.wasm');
  const zkeyPath = path.join(__dirname, '..', '..', 'proof', 'swap', 'unizwap.zkey');
  const vkeyPath = path.join(__dirname, '..', '..', 'proof', 'swap', 'verification_key.json');

  console.log('🔨 Generating proof...');
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  console.log('📋 Public Signals:');
  console.log('  [0] Merkle Root:', publicSignals[0]);
  console.log('  [1] Nullifier:', publicSignals[1]);
  console.log('  [2] Token Address:', publicSignals[2]);
  console.log('  [3] Deposit Amount:', publicSignals[3]);
  console.log('');

  // Verify off-chain first
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf-8'));
  console.log('🔍 Verifying proof off-chain...');
  const isValidOffChain = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  if (isValidOffChain) {
    console.log('✅ Off-chain verification: VALID');
  } else {
    console.log('❌ Off-chain verification: INVALID');
    process.exit(1);
  }
  console.log('');

  // Call UnizwapHook's withdrawPrivate function
  console.log('🌐 Calling UnizwapHook.withdrawPrivate() on-chain...');
  console.log('  Network: Sepolia');
  console.log('  UnizwapHook:', UNIZWAP_HOOK_ADDRESS);
  console.log('');

  // Format proof for Solidity
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = calldata.replace(/["[\]\s]/g, "").split(',');
  
  const pA: [string, string] = [argv[0], argv[1]];
  const pB: [[string, string], [string, string]] = [[argv[2], argv[3]], [argv[4], argv[5]]];
  const pC: [string, string] = [argv[6], argv[7]];
  const pubSignals: [string, string, string, string] = [argv[8], argv[9], argv[10], argv[11]];

  console.log('📤 Proof Parameters:');
  console.log('  pA:', pA);
  console.log('  pB:', pB);
  console.log('  pC:', pC);
  console.log('  pubSignals:', pubSignals);
  console.log('');

  try {
    // Convert token address from pubSignals
    const tokenAddress = '0x' + BigInt(pubSignals[2]).toString(16).padStart(40, '0');
    // The nullifier is bytes32(_pubSignals[1]) directly, not hashed
    const nullifierBytes32 = ethers.toBeHex(BigInt(pubSignals[1]), 32);
    const merkleRootBytes32 = ethers.toBeHex(BigInt(pubSignals[0]), 32);

    console.log('💰 Pre-withdrawal checks...');
    console.log('  Token:', tokenAddress);
    console.log('  Withdraw to:', withdrawWallet.address);
    console.log('  Nullifier:', nullifierBytes32);
    console.log('  Merkle Root:', merkleRootBytes32);
    
    // Check if contract is deployed
    const code = await provider.getCode(UNIZWAP_HOOK_ADDRESS);
    if (code === '0x') {
      console.log('');
      console.log('❌ Error: UnizwapHook contract not deployed at', UNIZWAP_HOOK_ADDRESS);
      console.log('');
      console.log('📝 To fix this:');
      console.log('  1. Deploy UnizwapHook');
      console.log('  2. Update UNIZWAP_HOOK_ADDRESS in .env with the deployed address');
      process.exit(1);
    }
    console.log('  ✅ Contract deployed');
    
    // Check if merkle root is known
    const isRootKnown = await unizwapHook.isKnownRoot(merkleRootBytes32);
    console.log('  Merkle root known:', isRootKnown);
    
    if (!isRootKnown) {
      console.log('');
      console.log('❌ Error: Merkle root not found in contract!');
      console.log('');
      console.log('📝 This means you need to swap first:');
      console.log('  1. Run: npx tsx shortcut/unizwap-hook/04_DepositToken.ts');
      console.log('  2. Run: npx tsx shortcut/unizwap-hook/05_SwapWithVault.ts');
      console.log('  3. The swap will insert a commitment into the Merkle tree');
      console.log('  4. Make sure your swap uses the same secret/nonce values in this script');
      console.log('');
      console.log('💡 Or update this script to use the actual secret/nonce from your swap');
      process.exit(1);
    }
    
    // Check if nullifier already used
    const isNullifierUsed = await unizwapHook.nullifiers(nullifierBytes32);
    console.log('  Nullifier used:', isNullifierUsed);
    
    if (isNullifierUsed) {
      console.log('');
      console.log('❌ Error: This nullifier has already been used!');
      console.log('  Change the nonce value to generate a new nullifier');
      process.exit(1);
    }

    // Check balance before withdrawal (using commitment-based storage)
    const commitmentBytes32 = ethers.toBeHex(commitment, 32);
    const balanceBefore = await unizwapHook.commitmentDeposits(commitmentBytes32, tokenAddress);
    console.log('  Balance:', balanceBefore.toString());
    
    if (balanceBefore === 0n) {
      console.log('');
      console.log('❌ Error: No balance to withdraw!');
      console.log('  Run: npx tsx shortcut/unizwap-hook/05_SwapWithVault.ts first to create a commitment');
      console.log('  Commitment:', commitment.toString());
      console.log('  Make sure the secret/nonce values match your swap');
      process.exit(1);
    }
    console.log('');

    console.log('⏳ Sending transaction...');
    const tx = await unizwapHook.withdrawPrivate(
      commitmentBytes32,
      pA,
      pB,
      pC,
      pubSignals,
      {
        gasLimit: 500000
      }
    );

    console.log('  Transaction hash:', tx.hash);
    console.log('  Waiting for confirmation...');
    
    const receipt = await tx.wait();
    
    console.log('');
    console.log('✅ WITHDRAWAL SUCCESS!');
    console.log('  Block:', receipt?.blockNumber);
    console.log('  Gas used:', receipt?.gasUsed.toString());
    console.log('');
    
    // Parse events
    const withdrawEvent = receipt?.logs.find((log: any) => {
      try {
        return unizwapHook.interface.parseLog(log)?.name === 'Withdraw';
      } catch {
        return false;
      }
    });
    
    if (withdrawEvent) {
      const parsed = unizwapHook.interface.parseLog(withdrawEvent);
      console.log('📤 Withdrawal Event:');
      console.log('  User:', parsed?.args.user);
      console.log('  Token:', parsed?.args.token);
      console.log('  Amount:', parsed?.args.amount.toString());
      console.log('');
    }
    
    // Check balance after withdrawal
    const balanceAfter = await unizwapHook.userDeposits(withdrawWallet.address, tokenAddress);
    console.log('💰 Balance after withdrawal:', balanceAfter.toString());
    console.log('');
    console.log('='.repeat(60));
    console.log('PRIVATE WITHDRAWAL COMPLETE!');
    console.log('Withdrawn to:', withdrawWallet.address);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.log('❌ Withdrawal failed:');
    console.log('  Error:', error.message);
    if (error.data) {
      console.log('  Error data:', error.data);
    }
    if (error.error) {
      console.log('  Detailed error:', error.error);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
