pragma circom 2.1.6;

/*
==============================================================
 Withdraw Circuit (VaultHook)
 Merkle depth: 10 (FIXED)
 Curve: BN254
 Hash: Poseidon
==============================================================
*/

include "../node_modules/circomlib/circuits/poseidon.circom";

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

/* 
============================================================
  COMMITMENT HASHER
  commitment = H(token_address, deposit_amount, H(secret, nonce))
============================================================ 
*/

template CommitmentHasher() {
  signal input token_address;
  signal input deposit_amount;
  signal input secret;
  signal input nonce;

  signal output commitment;

  // H(secret, nonce)
  component h1 = Poseidon(2);
  h1.inputs[0] <== secret;
  h1.inputs[1] <== nonce;

  // H(token_address, deposit_amount, secret_hash)
  component h2 = Poseidon(3);
  h2.inputs[0] <== token_address;
  h2.inputs[1] <== deposit_amount;
  h2.inputs[2] <== h1.out;

  commitment <== h2.out;
}

/* 
============================================================
  MAIN WITHDRAW CIRCUIT
============================================================ 
*/

template Withdraw() {
  /* ---------- Public inputs ---------- */
  signal input merkle_root;
  signal input nullifier;
  signal input token_address;
  signal input deposit_amount;

  /* ---------- Private inputs ---------- */
  signal input secret;
  signal input nonce;
  signal input merkle_pathIndices[10];
  signal input merkle_path[10];

  /* ---------- 1. Nullifier check ---------- */
  nullifier === nonce;

  /* ---------- 2. Commitment reconstruction ---------- */
  component commit = CommitmentHasher();
  commit.token_address <== token_address;
  commit.deposit_amount <== deposit_amount;
  commit.secret <== secret;
  commit.nonce <== nonce;

  /* ---------- 3. Merkle inclusion proof ---------- */
  component merkle = MerkleTreeInclusionProof(10);
  merkle.leaf <== commit.commitment;

  for (var i = 0; i < 10; i++) {
    merkle.pathElements[i] <== merkle_path[i];
    merkle.pathIndices[i] <== merkle_pathIndices[i];
  }

  merkle.root === merkle_root;
}

/* 
============================================================
  ENTRY POINT
============================================================ 
*/

component main {public [merkle_root, nullifier, token_address, deposit_amount]} = Withdraw();