# UnizwapHook Deployment & Testing Flow

## Contract Address
**UnizwapHook**: `0x6bd55870df92dA4BA69E33258b62698fda914ac4`
**Verify 0x06eea8c25560362135Ef5758F6A8dFAd1c3f8Ac4

### Dependencies
- **Withdraw Verifier**: `0x548a65DbF4B2278B073544ee62cc5735a43eDE8F`
- **Remove LP Verifier**: `0xD8cD6542b557dE6C78Cf29Ae94639265D0e83160`
- **PositionManager**: `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4`
- **Network**: Sepolia Testnet (Chain ID: 11155111)

## Features
### Swap Functionality
- `deposit()`: Deposit tokens to vault
- `swap()`: Execute vault swap
- `withdrawPrivate()`: Withdraw with ZK proof
- `beforeSwap/afterSwap`: Track & collect swap outputs

### Liquidity Functionality
- `beforeAddLiquidity`: Insert commitment into merkle tree
- `beforeRemoveLiquidity`: Verify ZK proof
- `removeLiquidityWithProof()`: Cross-wallet LP removal

### Privacy Features
- Merkle tree commitments (depth: 10)
- ZK proofs for both swaps & LP operations

---

## Deployment & Testing Steps

### Step 0: Deploy UnizwapHook
**Script**: `script/vault-hook/00_DeployUnizwapHook.s.sol`
**Run**: `forge script script/vault-hook/00_DeployUnizwapHook.s.sol --rpc-url $SEPOLIA --broadcast --private-key $PRIVATE_KEY_2`
- **Transaction**: [`0x9240fdd9067304208e6bd9c1a0eaf94d82ce32126041c6588467315a0600adf4`](https://sepolia.etherscan.io/tx/0x9240fdd9067304208e6bd9c1a0eaf94d82ce32126041c6588467315a0600adf4)
- **Block**: 10191066
- **Gas Used**: 4,212,213 (0.004517910083078805 ETH)
- **Result**: ✅ UnizwapHook deployed successfully

---

### Step 1: Create Pool
**Script**: `shortcut/unizwap-hook/00_CreatePool.ts`
**Run**: `npx tsx shortcut/unizwap-hook/00_CreatePool.ts`
- **Transaction**: [`0xf9639e49f6b400f10f14ad29ed08317874fd9c7cebdbf7bc9bd8052ae551c27f`](https://sepolia.etherscan.io/tx/0xf9639e49f6b400f10f14ad29ed08317874fd9c7cebdbf7bc9bd8052ae551c27f)
- **Block**: 10191314
- **Pool**: TOKEN_A/TOKEN_B with UnizwapHook
- **Result**: ✅ Pool created successfully

---

### Step 2: Add Liquidity with Privacy Commitment
**Script**: `shortcut/unizwap-hook/01_AddLiquidity.ts`
**Run**: `npx tsx shortcut/unizwap-hook/01_AddLiquidity.ts`
- **Transaction**: [`0x681df8c544644f8bfe443a8e164e103c8843308cfe1f7a8047d83be0c02b6688`](https://sepolia.etherscan.io/tx/0x681df8c544644f8bfe443a8e164e103c8843308cfe1f7a8047d83be0c02b6688)
- **Block**: 10191328
- **TokenId**: 22926
- **Commitment**: `0x1afd984a5fa6f69521506943b52eaddb1c96059434f334e73bdaa16947441829`
- **Secret**: 987654
- **Nonce**: 321098
- **Liquidity**: 100 ETH equivalent
- **Result**: ✅ Liquidity added with commitment stored in Merkle tree

---

### Step 3: Transfer NFT to Hook
**Script**: `shortcut/unizwap-hook/02_TransferNFT.ts`
**Run**: `npx tsx shortcut/unizwap-hook/02_TransferNFT.ts`
- **Transaction**: [`0x81ab917f275ba49fc2357aad44232b143f9fa801360537080a54c15be42bade1`](https://sepolia.etherscan.io/tx/0x81ab917f275ba49fc2357aad44232b143f9fa801360537080a54c15be42bade1)
- **Block**: 10191332
- **TokenId**: 22926
- **From**: Wallet (PRIVATE_KEY_2)
- **To**: UnizwapHook contract
- **Result**: ✅ NFT transferred to hook for privacy-preserving operations

---

### Step 4: Deposit Tokens to Vault
**Script**: `shortcut/unizwap-hook/03_DepositToken.ts`
**Run**: `npx tsx shortcut/unizwap-hook/03_DepositToken.ts`
- **Transaction**: [`0x016f1cd2bc8ccc943f749c92186bb21caf06a3975508a7bd9d525488ab38cb32`](https://sepolia.etherscan.io/tx/0x016f1cd2bc8ccc943f749c92186bb21caf06a3975508a7bd9d525488ab38cb32)
- **Amount**: 10 TOKEN_A
- **Result**: ✅ Tokens deposited to vault for swapping

---

### Step 5: Swap with Vault Pattern
**Script**: `shortcut/unizwap-hook/04_SwapWithVault.ts`
**Run**: `npx tsx shortcut/unizwap-hook/04_SwapWithVault.ts`
- **Transaction**: [`0xd9ddacdbf20a0b47878e4d603bc7fd8aae296cf0a0b05a30fb052c636db20ba4`](https://sepolia.etherscan.io/tx/0xd9ddacdbf20a0b47878e4d603bc7fd8aae296cf0a0b05a30fb052c636db20ba4)
- **Input**: TOKEN_A → TOKEN_B (vault pattern)
- **Secret**: 111111
- **Nonce**: 222222
- **Commitment**: `0x0647ca82...` (stored for private withdrawal)
- **Result**: ✅ Vault swap executed, output stored privately

---

### Step 6: Swap with Router Pattern
**Script**: `shortcut/unizwap-hook/05_SwapWithRouter.ts`
**Run**: `npx tsx shortcut/unizwap-hook/05_SwapWithRouter.ts`
- **Transaction**: [`0xafe647e83d1c2c83b47f6456663273557f018461ed541b3da677c6835f0af2b1`](https://sepolia.etherscan.io/tx/0xafe647e83d1c2c83b47f6456663273557f018461ed541b3da677c6835f0af2b1)
- **Input**: TOKEN_A → TOKEN_B (router pattern)
- **Secret**: 333333
- **Nonce**: 444444
- **Output**: 7.558 TOKEN_B deposited to vault
- **Result**: ✅ Router swap executed, output deposited to vault

---

### Step 7: Withdraw Vault Swap Output (Private)
**Script**: `shortcut/unizwap-hook/06_WithdrawPrivate_Vault.ts`
**Run**: `npx tsx shortcut/unizwap-hook/06_WithdrawPrivate_Vault.ts`
- **Transaction**: [`0x07c573a6f6fffae5a11093d976e226eb1a939a817a505b955ea97f203f5955b7`](https://sepolia.etherscan.io/tx/0x07c573a6f6fffae5a11093d976e226eb1a939a817a505b955ea97f203f5955b7)
- **Block**: 10191405
- **Gas Used**: 280,047
- **Amount**: 9.066 TOKEN_B (9066108938801491315 wei)
- **Commitment Index**: 1 (in Merkle tree)
- **ZK Proof**: ✅ Verified on-chain
- **Result**: ✅ Tokens withdrawn privately using ZK proof

---

### Step 8: Withdraw Router Swap Output (Private)
**Script**: `shortcut/unizwap-hook/07_WithdrawPrivate_Router.ts`
**Run**: `npx tsx shortcut/unizwap-hook/07_WithdrawPrivate_Router.ts`
- **Transaction**: [`0x138833065904d9b5937fb0ed5b28c87af98156b6e469e188402a0ca1578ca056`](https://sepolia.etherscan.io/tx/0x138833065904d9b5937fb0ed5b28c87af98156b6e469e188402a0ca1578ca056)
- **Block**: 10191375
- **Amount**: 7.558 TOKEN_B
- **ZK Proof**: ✅ Verified on-chain
- **Result**: ✅ Tokens withdrawn privately using ZK proof

---

## Additional Step: Remove Liquidity (Cross-Wallet)

### Step 9: Remove Liquidity with ZK Proof
**Script**: `shortcut/unizwap-hook/08_RemoveLiquidity.ts`
**Run**: `npx tsx shortcut/unizwap-hook/08_RemoveLiquidity.ts`
- **Transaction**: [`0xffa5a040b6c682ac481a29996c34b89e7159f54649ae3d58211e87b989a8fbcd`](https://sepolia.etherscan.io/tx/0xffa5a040b6c682ac481a29996c34b89e7159f54649ae3d58211e87b989a8fbcd)
- **Block**: 10191421
- **TokenId**: 22926
- **Liquidity Removed**: 100 ETH
- **Secret**: 987654
- **Nonce**: 321098
- **Commitment**: `0x1afd984a5fa6f69521506943b52eaddb1c96059434f334e73bdaa16947441829`
- **Nullifier**: `0x21cc0e773dc96af0fa635c957ad6cdd45ff499c2d4156c16ffb6a2439d17ef8a`
- **Commitment Index**: 0 (in Merkle tree)
- **Merkle Root**: `0x00d20ea0b77e13d984aa3bdaa5388d3e4623231c3e97fec6cfc20d33310dacb9`
- **ZK Proof**: ✅ Generated and verified
- **Cross-Wallet**: 
  - Added by: Wallet A (PRIVATE_KEY_2)
  - Removed by: Wallet B (PRIVATE_KEY)
- **Final Balances**: 999,224.33 TOKEN_A, 999,355.44 TOKEN_B
- **Result**: ✅ Privacy-preserving cross-wallet LP removal successful!

---

## Privacy Validation

### Key Privacy Features Demonstrated:
1. ✅ **Commitment-based LP tracking**: Liquidity positions identified by Merkle commitments, not NFT ownership
2. ✅ **ZK Proof verification**: All withdrawals and LP removals require valid ZK proofs
3. ✅ **Cross-wallet operations**: LP added by Wallet A, removed by Wallet B (only secret/nonce knowledge required)
4. ✅ **Nullifier prevention**: Double-spending prevented through on-chain nullifier tracking
5. ✅ **Private swap outputs**: Swap outputs stored as commitments, withdrawn anonymously

### Security Guarantees:
- **Anonymity**: No link between depositor and withdrawer wallets
- **Integrity**: ZK proofs ensure only legitimate commitment owners can withdraw
- **Non-repudiation**: Nullifiers prevent double-spending attacks
- **Merkle tree verification**: All commitments verified against on-chain Merkle root

---

## Summary

**Total Steps**: 9 (0-8 deployment + testing)
**All Operations**: ✅ Successful
**Privacy Preserved**: ✅ Validated through cross-wallet operations
**ZK Proofs**: ✅ All verified on-chain

The UnizwapHook contract successfully demonstrates privacy-preserving swaps and liquidity operations using ZK-SNARK proofs and Merkle tree commitments on Uniswap v4.
