ifeq (,$(wildcard .env))
  $(error .env file not found)
endif
include .env

#################################
# Deploy & Verify Commands
#################################

build:
	forge build src/UnizwapHook.sol

deploy:
	forge script script/vault-hook/00_DeployUnizwapHook.s.sol:DeployUnizwapHook --broadcast --rpc-url $(SEPOLIA) --private-key $(PRIVATE_KEY) -vvv 

verify:
	forge verify-contract $(UNIZWAP_HOOK_ADDRESS) src/UnizwapHook.sol:UnizwapHook --chain sepolia --verifier sourcify --watch

#################################
# UnizwapHook Shortcut Commands
#################################

# Step 1: Create Pool
cp:
	npx tsx shortcut/unizwap-hook/00_CreatePool.ts

# Step 2: Add Liquidity
ap:
	npx tsx shortcut/unizwap-hook/01_AddLiquidity.ts

# Step 3: Transfer NFT
transfer-nft:
	npx tsx shortcut/unizwap-hook/02_TransferNFT.ts

# Step 4: Deposit Tokens
deposit:
	npx tsx shortcut/unizwap-hook/03_DepositToken.ts

# Step 5: Swap with Vault
swap-vault:
	npx tsx shortcut/unizwap-hook/04_SwapWithVault.ts

# Step 6: Swap with Router
sr:
	npx tsx shortcut/unizwap-hook/05_SwapWithRouter.ts

# Step 7: Withdraw Private (Vault)
withdraw-vault:
	npx tsx shortcut/unizwap-hook/06_WithdrawPrivate_Vault.ts

# Step 8: Withdraw Private (Router)
wr:
	npx tsx shortcut/unizwap-hook/07_WithdrawPrivate_Router.ts

# Step 9: Remove Liquidity
rl:
	npx tsx shortcut/unizwap-hook/08_RemoveLiquidity.ts

# Complete Flow (all steps)
full-flow: create-pool add-liquidity transfer-nft deposit swap-vault withdraw-vault remove-liquidity
	@echo "✅ Complete UnizwapHook flow executed!"

#################################
# Help
#################################

help:
	@echo "Deploy & Verify:"
	@echo "  make deploy               - Deploy UnizwapHook contract"
	@echo "  make verify               - Verify UnizwapHook on Sourcify"
	@echo ""
	@echo "UnizwapHook Shortcuts:"
	@echo "  make create-pool          - Create pool"
	@echo "  make add-liquidity        - Add liquidity"
	@echo "  make transfer-nft         - Transfer NFT"
	@echo "  make deposit              - Deposit tokens"
	@echo "  make swap-vault           - Swap with vault pattern"
	@echo "  make swap-router          - Swap with router pattern"
	@echo "  make withdraw-vault       - Withdraw private (vault)"
	@echo "  make withdraw-router      - Withdraw private (router)"
	@echo "  make remove-liquidity     - Remove liquidity"
	@echo "  make full-flow            - Run complete flow"