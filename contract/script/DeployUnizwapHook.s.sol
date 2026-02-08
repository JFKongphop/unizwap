// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console} from "forge-std/console.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {BaseScript} from "./BaseScript.sol";

import {UnizwapHook} from "../src/UnizwapHook.sol";

/// @notice Deploys UnizwapHook - Unified hook with swap + liquidity functionality
contract DeployUnizwapHook is BaseScript {
  function run() public {
    address withdrawVerifier = 0x548a65DbF4B2278B073544ee62cc5735a43eDE8F;
    address removeLqVerifier = 0xD8cD6542b557dE6C78Cf29Ae94639265D0e83160;

    console.log("=== Deploying UnizwapHook ===");
    console.log("withdrawVerifier address:", withdrawVerifier);
    console.log("removeLqVerifier address:", removeLqVerifier);
    console.log("PositionManager:", address(positionManager));

    // Hook flags: swap + liquidity hooks
    uint160 flags = uint160(
      Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
    );

    // Mine a salt that will produce a hook address with the correct flags
    bytes memory constructorArgs = abi.encode(poolManager, positionManager, withdrawVerifier, removeLqVerifier);
    (address hookAddress, bytes32 salt) =
      HookMiner.find(CREATE2_FACTORY, flags, type(UnizwapHook).creationCode, constructorArgs);

    console.log("Target hook address:", hookAddress);
    console.log("Salt:", vm.toString(salt));

    // Deploy UnizwapHook using CREATE2
    vm.startBroadcast();
    UnizwapHook hook = new UnizwapHook{salt: salt}(poolManager, positionManager, withdrawVerifier, removeLqVerifier);
    vm.stopBroadcast();

    require(address(hook) == hookAddress, "DeployUnizwapHook: Hook Address Mismatch");

    console.log("\n=== Deployment Summary ===");
    console.log("UnizwapHook:", address(hook));
    console.log("Merkle tree depth:", hook.levels());
    console.log("\n=== Features ===");
    console.log("SWAP FUNCTIONALITY:");
    console.log("- deposit(): Deposit tokens to vault");
    console.log("- swap(): Execute vault swap");
    console.log("- withdrawPrivate(): Withdraw with ZK proof");
    console.log("- beforeSwap/afterSwap: Track & collect swap outputs");
    console.log("\nLIQUIDITY FUNCTIONALITY:");
    console.log("- beforeAddLiquidity: Insert commitment into merkle tree");
    console.log("- beforeRemoveLiquidity: Verify ZK proof");
    console.log("- removeLiquidityWithProof(): Cross-wallet LP removal");
    console.log("\nPrivacy: Merkle tree commitments + ZK proofs for both swaps & LP");
  }
}
