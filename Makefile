ifeq (,$(wildcard .env))
  $(error .env file not found)
endif
include .env

# Deploy tokens
deploy-tokens:
	@echo "Deploying TokenA and TokenB..."
	@forge script script/TokensDeployer.s.sol:TokensDeployer \
		--rpc-url $(RPC_URL) \
		--broadcast \
		--verify \
		-vvvv

# Deploy tokens without verification
deploy-tokens-no-verify:
	@echo "Deploying TokenA and TokenB (no verification)..."
	@forge script script/TokensDeployer.s.sol:TokensDeployer \
		--rpc-url $(RPC_URL) \
		--broadcast \
		-vvvv

