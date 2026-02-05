import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';
import * as circomlibjs from 'circomlibjs';
import { MerkleTree } from 'fixed-merkle-tree';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TREE_LEVELS = 10;
const VERIFIER_ADDRESS = '0x548a65DbF4B2278B073544ee62cc5735a43eDE8F';
const RPC_URL = process.env.SEPOLIA;

async function main() {
  console.log('='.repeat(60));
  console.log('GENERATE PROOF AND VERIFY ON-CHAIN');
  console.log('='.repeat(60));
  console.log('');

  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  const poseidonHash = (inputs) => {
    if (!Array.isArray(inputs)) inputs = [inputs];
    const bigints = inputs.map(BigInt);
    const res = poseidon(bigints);
    return BigInt(F.toString(res));
  };

  // Private inputs
  const secret = 123456n;
  const nonce = 789012n;
  const token_address = 0x1234567890ABCDEFn;
  const deposit_amount = 1000n;

  // Calculate commitment: H(token_address, deposit_amount, H(secret, nonce))
  const secretHash = poseidonHash([secret, nonce]);
  const commitment = poseidonHash([token_address, deposit_amount, secretHash]);

  console.log('💰 Deposit Details:');
  console.log('  Token Address:', token_address.toString());
  console.log('  Amount:', deposit_amount.toString());
  console.log('  Secret:', secret.toString());
  console.log('  Nonce:', nonce.toString());
  console.log('  Commitment:', commitment.toString());
  console.log('');

  // Create Merkle tree with the commitment
  const leaves = Array(1024).fill(0n);
  leaves[0] = commitment;

  const tree = new MerkleTree(TREE_LEVELS, leaves, {
    hashFunction: (a, b) => poseidonHash([a, b]),
    zeroElement: 0n
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
    merkle_pathIndices: pathIndices.map((x) => x.toString()),
    merkle_path: pathElements.map((x) => x.toString())
  };

  const wasmPath = path.join(__dirname, 'unizwap.wasm');
  const zkeyPath = path.join(__dirname, 'unizwap.zkey');
  const vkeyPath = path.join(__dirname, 'verification_key.json');

  console.log('🔨 Generating proof off-chain...');
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  console.log('📋 Public Signals:');
  console.log('  [0] Merkle Root:', publicSignals[0]);
  console.log('  [1] Nullifier:', publicSignals[1]);
  console.log('  [2] Token Address:', publicSignals[2]);
  console.log('  [3] Deposit Amount:', publicSignals[3]);
  console.log('');

  // Verify off-chain first
  const vkey = JSON.parse(fs.readFileSync(vkeyPath));
  console.log('🔍 Verifying proof off-chain...');
  const isValidOffChain = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  if (isValidOffChain) {
    console.log('✅ Off-chain verification: VALID');
  } else {
    console.log('❌ Off-chain verification: INVALID');
    process.exit(1);
  }
  console.log('');

  // Verify on-chain
  console.log('🌐 Verifying proof on-chain...');
  console.log('  Network: Sepolia');
  console.log('  Verifier:', VERIFIER_ADDRESS);
  console.log('');

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Groth16Verifier ABI
  const verifierAbi = [
    "function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[4] calldata _pubSignals) external view returns (bool)"
  ];

  const verifier = new ethers.Contract(VERIFIER_ADDRESS, verifierAbi, provider);

  // Format proof for Solidity
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = calldata.replace(/["[\]\s]/g, "").split(',');
  
  const pA = [argv[0], argv[1]];
  const pB = [[argv[2], argv[3]], [argv[4], argv[5]]];
  const pC = [argv[6], argv[7]];
  const pubSignals = [argv[8], argv[9], argv[10], argv[11]];

  try {
    console.log('⏳ Calling verifyProof()...');
    const isValidOnChain = await verifier.verifyProof(pA, pB, pC, pubSignals);

    console.log('');
    if (isValidOnChain) {
      console.log('✅ ON-CHAIN VERIFICATION: VALID');
      console.log('');
      console.log('='.repeat(60));
      console.log('SUCCESS! Proof verified on Sepolia');
      console.log('='.repeat(60));
    } else {
      console.log('❌ ON-CHAIN VERIFICATION: INVALID');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ On-chain verification failed:');
    console.log('  Error:', error.message);
    if (error.data) {
      console.log('  Error data:', error.data);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
