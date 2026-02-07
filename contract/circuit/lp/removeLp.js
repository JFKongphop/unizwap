import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';
import * as circomlibjs from 'circomlibjs';
import { MerkleTree } from 'fixed-merkle-tree';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TREE_LEVELS = 10;

async function main() {
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
  const tokenId = 999n;

  // Public inputs
  const tokenAAddress = 0x1234567890ABCDEFn;
  const tokenBAddress = 0xFEDCBA0987654321n;
  const liquidityAmount = 5000n;

  // Calculate commitment: H(secret, nonce, tokenId)
  const commitment = poseidonHash([secret, nonce, tokenId]);

  // Calculate nullifier: H(secret, tokenId)
  const nullifier = poseidonHash([secret, tokenId]);

  console.log('🏊 Remove LP Details:');
  console.log('  Token A Address:', tokenAAddress.toString());
  console.log('  Token B Address:', tokenBAddress.toString());
  console.log('  Token ID:', tokenId.toString());
  console.log('  Liquidity Amount:', liquidityAmount.toString());
  console.log('  Secret:', secret.toString());
  console.log('  Nonce:', nonce.toString());
  console.log('  Commitment:', commitment.toString());
  console.log('  Nullifier:', nullifier.toString());
  console.log('');

  // Create Merkle tree with the commitment
  const leaves = Array(1024).fill(0n); // 2^10 = 1024 leaves
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

  // Public inputs: merkle_root, nullifier, tokenAAddress, tokenBAddress, tokenId, liquidityAmount
  // Private inputs: secret, nonce, merkle_pathIndices, merkle_path
  const input = {
    merkle_root: pathRoot.toString(),
    nullifier: nullifier.toString(),
    tokenAAddress: tokenAAddress.toString(),
    tokenBAddress: tokenBAddress.toString(),
    tokenId: tokenId.toString(),
    liquidityAmount: liquidityAmount.toString(),
    secret: secret.toString(),
    nonce: nonce.toString(),
    merkle_pathIndices: pathIndices.map((x) => x.toString()),
    merkle_path: pathElements.map((x) => x.toString())
  };

  const wasmPath = path.join(__dirname, 'unizwap-removelp.wasm');
  const zkeyPath = path.join(__dirname, 'unizwap-removelp.zkey');
  const vkeyPath = path.join(__dirname, 'verification_key.json');

  console.log('🔨 Generating proof...');
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  console.log('📋 Public Signals:');
  console.log('  [0] Merkle Root:', publicSignals[0]);
  console.log('  [1] Nullifier:', publicSignals[1]);
  console.log('  [2] Token A Address:', publicSignals[2]);
  console.log('  [3] Token B Address:', publicSignals[3]);
  console.log('  [4] Token ID:', publicSignals[4]);
  console.log('  [5] Liquidity Amount:', publicSignals[5]);
  console.log('');

  // Generate Solidity calldata
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const parsed = JSON.parse(`[${calldata}]`);
  
  console.log('📞 Solidity Calldata:');
  console.log('  pA:', parsed[0]);
  console.log('  pB:', parsed[1]);
  console.log('  pC:', parsed[2]);
  console.log('  publicSignals:', parsed[3]);
  console.log('');

  const vkey = JSON.parse(fs.readFileSync(vkeyPath));
  console.log('🔍 Verifying proof...');
  const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  if (isValid) {
    console.log('✅ Proof is valid!');
  } else {
    console.log('❌ Invalid proof!');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
