// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {UnizwapHookSimple} from "../src/UnizwapHookSimple.sol";

/**
 * @title UnizwapHookSimpleTest  
 * @notice Unit tests for UnizwapHookSimple contract
 * @dev These are isolated unit tests that mock external dependencies
 */
contract UnizwapHookSimpleTest is Test {
  using PoolIdLibrary for PoolKey;

  UnizwapHookSimple hook;
  PoolKey testKey;
  PoolId poolId;

  address poolManager = makeAddr("poolManager");
  address positionManager = makeAddr("positionManager");
  address alice = makeAddr("alice");
  address bob = makeAddr("bob");
  address token0 = makeAddr("token0");
  address token1 = makeAddr("token1");

  function setUp() public {
    // Calculate hook address with proper permission flags
    // beforeAddLiquidity | beforeRemoveLiquidity | beforeSwap | afterSwap
    uint160 flags = uint160(
      Hooks.BEFORE_ADD_LIQUIDITY_FLAG | 
      Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | 
      Hooks.BEFORE_SWAP_FLAG | 
      Hooks.AFTER_SWAP_FLAG
    );
    
    address hookAddress = address(flags);
    
    // Deploy hook at the specific address with proper flags
    deployCodeTo(
      "UnizwapHookSimple.sol",
      abi.encode(IPoolManager(poolManager), IPositionManager(positionManager)),
      hookAddress
    );
    
    hook = UnizwapHookSimple(hookAddress);

    // Create a test pool key
    testKey = PoolKey({
      currency0: Currency.wrap(token0),
      currency1: Currency.wrap(token1),
      fee: 3000,
      tickSpacing: 60,
      hooks: hook
    });

    poolId = testKey.toId();
    
    console.log("=== Test Setup Complete ===");
    console.log("Hook deployed at:", address(hook));
    console.log("PoolManager:", poolManager);
    console.log("PositionManager:", positionManager);
    console.log("Pool created with ID:", uint256(PoolId.unwrap(poolId)));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Constructor & Initialization Tests
  // ═══════════════════════════════════════════════════════════════════════════

  function test_constructor() public view {
    console.log("\n=== Testing Constructor ===");
    assertEq(address(hook.poolManager()), poolManager, "PoolManager address mismatch");
    assertEq(address(hook.positionManager()), positionManager, "PositionManager address mismatch");
    console.log("[PASS] Constructor correctly set poolManager and positionManager");
  }

  function test_hookPermissions() public view {
    console.log("\n=== Testing Hook Permissions ===");
    Hooks.Permissions memory permissions = hook.getHookPermissions();

    assertFalse(permissions.beforeInitialize);
    assertFalse(permissions.afterInitialize);
    assertTrue(permissions.beforeAddLiquidity);
    assertFalse(permissions.afterAddLiquidity);
    assertTrue(permissions.beforeRemoveLiquidity);
    assertFalse(permissions.afterRemoveLiquidity);
    assertTrue(permissions.beforeSwap);
    assertTrue(permissions.afterSwap);
    assertFalse(permissions.beforeDonate);
    assertFalse(permissions.afterDonate);
    assertFalse(permissions.beforeSwapReturnDelta);
    assertFalse(permissions.afterSwapReturnDelta);
    assertFalse(permissions.afterAddLiquidityReturnDelta);
    assertFalse(permissions.afterRemoveLiquidityReturnDelta);
    
    console.log("[PASS] Hook permissions:");
    console.log("  - beforeAddLiquidity: true");
    console.log("  - beforeRemoveLiquidity: true");
    console.log("  - beforeSwap: true");
    console.log("  - afterSwap: true");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Counter Tests
  // ═══════════════════════════════════════════════════════════════════════════

  function test_initialCounters() public view {
    console.log("\n=== Testing Initial Counters ===");
    assertEq(hook.beforeSwapCount(poolId), 0, "beforeSwapCount should be 0");
    assertEq(hook.afterSwapCount(poolId), 0, "afterSwapCount should be 0");
    assertEq(hook.beforeAddLiquidityCount(poolId), 0, "before AddLiquidityCount should be 0");
    assertEq(hook.beforeRemoveLiquidityCount(poolId), 0, "beforeRemoveLiquidityCount should be 0");
    console.log("[PASS] All counters initialized to 0");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Hook Data Storage Tests
  // ═══════════════════════════════════════════════════════════════════════════

  function test_swapHookData_initiallyEmpty() public view {
    console.log("\n=== Testing Swap Hook Data ===");
    (address user, uint256 amount, string memory refCode, bool isActive, string memory pattern) =
      hook.swapHookData(poolId, alice);

    assertEq(user, address(0), "User should be zero address");
    assertEq(amount, 0, "Amount should be 0");
    assertEq(bytes(refCode).length, 0, "RefCode should be empty");
    assertFalse(isActive, "isActive should be false");
    assertEq(bytes(pattern).length, 0, "Pattern should be empty");
    console.log("[PASS] Swap hook data is empty initially");
  }

  function test_liquidityHookData_initiallyEmpty() public view {
    console.log("\n=== Testing Liquidity Hook Data ===");
    (address user, uint256 amount, string memory refCode, bool isActive, string memory pattern) =
      hook.liquidityHookData(poolId, alice);

    assertEq(user, address(0), "User should be zero address");
    assertEq(amount, 0, "Amount should be 0");
    assertEq(bytes(refCode).length, 0, "RefCode should be empty");
    assertFalse(isActive, "isActive should be false");
    assertEq(bytes(pattern).length, 0, "Pattern should be empty");
    console.log("[PASS] Liquidity hook data is empty initially");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PoolId Generation Tests
  // ═══════════════════════════════════════════════════════════════════════════

  function test_poolId_generation() public view {
    console.log("\n=== Testing PoolId Generation ===");
    PoolId generatedId = testKey.toId();
    assertEq(PoolId.unwrap(generatedId), PoolId.unwrap(poolId), "PoolId mismatch");
    console.log("[PASS] PoolId generated correctly from PoolKey");
    console.log("  PoolId:", uint256(PoolId.unwrap(poolId)));
  }

  function test_multiplePoolIds_unique() public view {
    console.log("\n=== Testing Multiple PoolIds ===");
    
    // Create another pool key with different fee
    PoolKey memory anotherKey = PoolKey({
      currency0: testKey.currency0,
      currency1: testKey.currency1,
      fee: 10000, // Different fee
      tickSpacing: 60,
      hooks: hook
    });

    PoolId anotherId = anotherKey.toId();
    
    assertTrue(PoolId.unwrap(poolId) != PoolId.unwrap(anotherId), "PoolIds should be different");
    console.log("[PASS] Different pool configs generate different PoolIds");
    console.log("  Pool 1 ID:", uint256(PoolId.unwrap(poolId)));
    console.log("  Pool 2 ID:", uint256(PoolId.unwrap(anotherId)));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Integration Note
  // ═══════════════════════════════════════════════════════════════════════════

  function test_integrationNote() public pure {
    // This test serves as documentation
    // For full integration tests with real PoolManager and swaps, see:
    // - Integration test files in test/ directory
    // - Scripts in shortcut/ directory for manual testing
  }
}
