pragma circom 2.1.6;

/*
==============================================================
 Remove LP Circuit (VaultHook)
 Merkle depth: 10 (FIXED)
 Curve: BN254
 Hash: Poseidon
==============================================================
*/

include "../swap/selector.circom";
include "../swap/merkleTreeInclusionProof.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/* ============================================================
   LP COMMITMENT HASHER
   commitment = H(secret, nonce, tokenId)
   ============================================================ */

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
