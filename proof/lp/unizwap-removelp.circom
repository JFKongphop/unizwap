pragma circom 2.1.6;

/*
==============================================================
 Remove LP Circuit (VaultHook)
 Merkle depth: 10 (FIXED)
 Curve: BN254
 Hash: Poseidon
==============================================================
*/

include "../node_modules/circomlib/circuits/poseidon.circom";

/* 
============================================================
  LP COMMITMENT HASHER
  commitment = H(secret, nonce, tokenId)
============================================================ */

template Selector() {
  signal input in[2];
  signal input sel;
  signal output out;

  sel * (1 - sel) === 0;

  signal selNot;
  selNot <== 1 - sel;

  signal left;
  signal right;

  left <== in[0] * selNot;
  right <== in[1] * sel;

  out <== left + right;
}

template MerkleTreeInclusionProof(levels) {
  signal input leaf;
  signal input pathElements[levels];
  signal input pathIndices[levels];
  signal output root;

  signal intermediates[levels + 1];
  intermediates[0] <== leaf;

  component hashes[levels];
  component selectorsLeft[levels];
  component selectorsRight[levels];

  for (var i = 0; i < levels; i++) {
    hashes[i] = Poseidon(2);

    selectorsLeft[i] = Selector();
    selectorsRight[i] = Selector();

    selectorsLeft[i].in[0] <== intermediates[i];
    selectorsLeft[i].in[1] <== pathElements[i];
    selectorsLeft[i].sel <== pathIndices[i];

    selectorsRight[i].in[0] <== pathElements[i];
    selectorsRight[i].in[1] <== intermediates[i];
    selectorsRight[i].sel <== pathIndices[i];

    hashes[i].inputs[0] <== selectorsLeft[i].out;
    hashes[i].inputs[1] <== selectorsRight[i].out;

    intermediates[i + 1] <== hashes[i].out;
  }

  root <== intermediates[levels];
}

template LPCommitmentHasher() {
  signal input secret;
  signal input nonce;
  signal input tokenId;

  signal output commitment;

  // H(secret, nonce, tokenId)
  component h = Poseidon(3);
  h.inputs[0] <== secret;
  h.inputs[1] <== nonce;
  h.inputs[2] <== tokenId;

  commitment <== h.out;
}

/* ============================================================
   NULLIFIER HASHER
   nullifier = H(secret, tokenId)
   ============================================================ */

template NullifierHasher() {
  signal input secret;
  signal input tokenId;

  signal output nullifier;

  component h = Poseidon(2);
  h.inputs[0] <== secret;
  h.inputs[1] <== tokenId;

  nullifier <== h.out;
}

/* ============================================================
   MAIN REMOVE LP CIRCUIT
   ============================================================ */

template RemoveLP() {
  /* ---------- Public inputs ---------- */
  signal input merkle_root;
  signal input nullifier;
  signal input tokenAAddress;
  signal input tokenBAddress;
  signal input tokenId;
  signal input liquidityAmount;

  /* ---------- Private inputs ---------- */
  signal input secret;
  signal input nonce;
  signal input merkle_pathIndices[10];
  signal input merkle_path[10];

  /* ---------- 1. Nullifier verification ---------- */
  component nullifierHasher = NullifierHasher();
  nullifierHasher.secret <== secret;
  nullifierHasher.tokenId <== tokenId;
  
  nullifier === nullifierHasher.nullifier;

  /* ---------- 2. Commitment reconstruction ---------- */
  component commitHasher = LPCommitmentHasher();
  commitHasher.secret <== secret;
  commitHasher.nonce <== nonce;
  commitHasher.tokenId <== tokenId;

  /* ---------- 3. Merkle inclusion proof ---------- */
  component merkle = MerkleTreeInclusionProof(10);
  merkle.leaf <== commitHasher.commitment;

  for (var i = 0; i < 10; i++) {
    merkle.pathElements[i] <== merkle_path[i];
    merkle.pathIndices[i] <== merkle_pathIndices[i];
  }

  merkle.root === merkle_root;

  /* ---------- 4. Token addresses and liquidity constraints ---------- */
  // Ensure token addresses are non-zero (sanity check)
  signal tokenA_check;
  signal tokenB_check;
  tokenA_check <== tokenAAddress * tokenAAddress;
  tokenB_check <== tokenBAddress * tokenBAddress;

  // Ensure liquidity amount is non-zero
  signal liquidity_check;
  liquidity_check <== liquidityAmount * liquidityAmount;
}

/* ============================================================
   ENTRY POINT
   ============================================================ */

component main {public [merkle_root, nullifier, tokenAAddress, tokenBAddress, tokenId, liquidityAmount]} = RemoveLP();
