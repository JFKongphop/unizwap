// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager, SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

import {UnizwapHookSimple} from "../src/UnizwapHookSimple.sol";

/**
 * @title UnizwapHookSimpleFullIntegrationTest
 * @notice Complete integration tests with real tokens, swaps, and liquidity operations
 * @dev Tests the full flow: deploy tokens → add liquidity → swap → remove liquidity
 */
contract UnizwapHookSimpleFullIntegrationTest is Test, Deployers {
  using PoolIdLibrary for PoolKey;
  using CurrencyLibrary for Currency;

  UnizwapHookSimple hook;
  PoolId poolId;

  MockERC20 tokenA;
  MockERC20 tokenB;

  address alice = makeAddr("alice");
  address bob = makeAddr("bob");
  address charlie = makeAddr("charlie");

  // Test amounts
  uint256 constant INITIAL_BALANCE = 10000 ether;
  uint256 constant LIQUIDITY_AMOUNT = 100 ether;
  uint256 constant SWAP_AMOUNT = 1 ether;

  function setUp() public {
    console.log("\n========================================");
    console.log("FULL INTEGRATION TEST SETUP");
    console.log("========================================\n");

    // 1. Deploy Uniswap V4 core contracts
    console.log("1. Deploying Uniswap V4 core contracts...");
    deployFreshManagerAndRouters();
    console.log("   [DONE] PoolManager:", address(manager));
    console.log("   [DONE] SwapRouter:", address(swapRouter));
    console.log("   [DONE] ModifyLiquidityRouter:", address(modifyLiquidityRouter));

    // 2. Deploy Token A and Token B
    console.log("\n2. Deploying tokens...");
    tokenA = new MockERC20("Token A", "TKNA", 18);
    tokenB = new MockERC20("Token B", "TKNB", 18);

    // Ensure tokenA < tokenB for Uniswap V4
    if (address(tokenA) > address(tokenB)) {
      (tokenA, tokenB) = (tokenB, tokenA);
    }

    console.log("   [DONE] Token A:", address(tokenA));
    console.log("   [DONE] Token B:", address(tokenB));

    // 3. Deploy hook at correct address
    console.log("\n3. Deploying UnizwapHookSimple...");
    address hookAddress = address(
      uint160(
        Hooks.BEFORE_ADD_LIQUIDITY_FLAG | 
        Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | 
        Hooks.BEFORE_SWAP_FLAG | 
        Hooks.AFTER_SWAP_FLAG
      )
    );

    deployCodeTo("UnizwapHookSimple.sol", abi.encode(address(manager), address(0)), hookAddress);
    hook = UnizwapHookSimple(hookAddress);
    console.log("   [DONE] Hook deployed at:", address(hook));

    // 4. Initialize pool
    console.log("\n4. Initializing pool...");
    (key,) = initPool(
      Currency.wrap(address(tokenA)),
      Currency.wrap(address(tokenB)),
      hook,
      3000, // 0.3% fee
      SQRT_PRICE_1_1 // 1:1 price
    );

    poolId = key.toId();
    console.log("   [DONE] Pool initialized");
    console.log("   Pool ID:", uint256(PoolId.unwrap(poolId)));
    console.log("   Fee: 0.3%");
    console.log("   Initial Price: 1:1");

    // 5. Mint tokens to users
    console.log("\n5. Minting tokens to users...");
    tokenA.mint(alice, INITIAL_BALANCE);
    tokenB.mint(alice, INITIAL_BALANCE);
    tokenA.mint(bob, INITIAL_BALANCE);
    tokenB.mint(bob, INITIAL_BALANCE);
    tokenA.mint(charlie, INITIAL_BALANCE);
    tokenB.mint(charlie, INITIAL_BALANCE);

    console.log("   [DONE] Alice: 10000 TKNA, 10000 TKNB");
    console.log("   [DONE] Bob: 10000 TKNA, 10000 TKNB");
    console.log("   [DONE] Charlie: 10000 TKNA, 10000 TKNB");

    // 6. Approve tokens
    console.log("\n6. Approving tokens...");
    vm.startPrank(alice);
    tokenA.approve(address(swapRouter), type(uint256).max);
    tokenB.approve(address(swapRouter), type(uint256).max);
    tokenA.approve(address(modifyLiquidityRouter), type(uint256).max);
    tokenB.approve(address(modifyLiquidityRouter), type(uint256).max);
    vm.stopPrank();

    vm.startPrank(bob);
    tokenA.approve(address(swapRouter), type(uint256).max);
    tokenB.approve(address(swapRouter), type(uint256).max);
    tokenA.approve(address(modifyLiquidityRouter), type(uint256).max);
    tokenB.approve(address(modifyLiquidityRouter), type(uint256).max);
    vm.stopPrank();

    vm.startPrank(charlie);
    tokenA.approve(address(swapRouter), type(uint256).max);
    tokenB.approve(address(swapRouter), type(uint256).max);
    tokenA.approve(address(modifyLiquidityRouter), type(uint256).max);
    tokenB.approve(address(modifyLiquidityRouter), type(uint256).max);
    vm.stopPrank();

    console.log("   [DONE] All approvals completed");

    console.log("\n========================================");
    console.log("SETUP COMPLETE - READY FOR TESTING");
    console.log("========================================\n");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIQUIDITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  function test_01_addLiquidity_success() public {
    console.log("\n=== TEST: Add Liquidity ===");
    
    uint256 aliceTokenABefore = tokenA.balanceOf(alice);
    uint256 aliceTokenBBefore = tokenB.balanceOf(alice);
    uint256 beforeAddCount = hook.beforeAddLiquidityCount(poolId);

    console.log("Before adding liquidity:");
    console.log("  Alice Token A:", aliceTokenABefore);
    console.log("  Alice Token B:", aliceTokenBBefore);

    // Alice adds liquidity
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );

    uint256 aliceTokenAAfter = tokenA.balanceOf(alice);
    uint256 aliceTokenBAfter = tokenB.balanceOf(alice);

    console.log("After adding liquidity:");
    console.log("  Alice Token A:", aliceTokenAAfter);
    console.log("  Alice Token B:", aliceTokenBAfter);
    console.log("  Token A deposited:", aliceTokenABefore - aliceTokenAAfter);
    console.log("  Token B deposited:", aliceTokenBBefore - aliceTokenBAfter);

    // Verify hook was called
    assertEq(hook.beforeAddLiquidityCount(poolId), beforeAddCount + 1, "beforeAddLiquidity not called");
    console.log("  Hook beforeAddLiquidity called: YES");

    // Verify tokens were transferred
    assertTrue(aliceTokenAAfter < aliceTokenABefore, "Token A not transferred");
    assertTrue(aliceTokenBAfter < aliceTokenBBefore, "Token B not transferred");
    console.log("\n[PASS] Liquidity added successfully");
  }

  function test_02_addLiquidity_withHookData() public {
    console.log("\n=== TEST: Add Liquidity with Hook Data ===");

    bytes memory hookData = abi.encode(alice, uint256(LIQUIDITY_AMOUNT), "LP_REF_001", true, "standard");

    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      hookData
    );

    // Verify hook data was stored
    (address user, uint256 amount, string memory refCode, bool isActive, string memory pattern) =
      hook.liquidityHookData(poolId, address(modifyLiquidityRouter));

    assertEq(user, alice);
    assertEq(amount, LIQUIDITY_AMOUNT);
    assertEq(refCode, "LP_REF_001");
    assertTrue(isActive);
    assertEq(pattern, "standard");

    console.log("Hook data stored:");
    console.log("  User:", user);
    console.log("  Amount:", amount);
    console.log("  RefCode:", refCode);
    console.log("  Active:", isActive);
    console.log("  Pattern:", pattern);
    console.log("\n[PASS] Hook data stored correctly");
  }

  function test_03_addLiquidity_multipleUsers() public {
    console.log("\n=== TEST: Multiple Users Add Liquidity ===");

    uint256 beforeAddCount = hook.beforeAddLiquidityCount(poolId);

    // Alice adds liquidity
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );

    // Bob adds liquidity
    vm.prank(bob);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(uint256(1))
      }),
      ZERO_BYTES
    );

    // Verify both operations called the hook
    assertEq(hook.beforeAddLiquidityCount(poolId), beforeAddCount + 2);
    console.log("  Alice added liquidity");
    console.log("  Bob added liquidity");
    console.log("  Hook called 2 times");
    console.log("\n[PASS] Multiple users can add liquidity");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWAP TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  function test_04_swap_tokenAForTokenB() public {
    console.log("\n=== TEST: Swap Token A for Token B ===");

    // First add liquidity
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );

    uint256 bobTokenABefore = tokenA.balanceOf(bob);
    uint256 bobTokenBBefore = tokenB.balanceOf(bob);
    uint256 beforeSwapCount = hook.beforeSwapCount(poolId);
    uint256 afterSwapCount = hook.afterSwapCount(poolId);

    console.log("Before swap:");
    console.log("  Bob Token A:", bobTokenABefore);
    console.log("  Bob Token B:", bobTokenBBefore);

    // Bob swaps Token A for Token B
    vm.prank(bob);
    swapRouter.swap(
      key,
      SwapParams({
        zeroForOne: true, // Token A (token0) for Token B (token1)
        amountSpecified: -int256(SWAP_AMOUNT),
        sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
      }),
      PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
      ZERO_BYTES
    );

    uint256 bobTokenAAfter = tokenA.balanceOf(bob);
    uint256 bobTokenBAfter = tokenB.balanceOf(bob);

    console.log("After swap:");
    console.log("  Bob Token A:", bobTokenAAfter);
    console.log("  Bob Token B:", bobTokenBAfter);
    console.log("  Token A spent:", bobTokenABefore - bobTokenAAfter);
    console.log("  Token B received:", bobTokenBAfter - bobTokenBBefore);

    // Verify hooks were called
    assertEq(hook.beforeSwapCount(poolId), beforeSwapCount + 1, "beforeSwap not called");
    assertEq(hook.afterSwapCount(poolId), afterSwapCount + 1, "afterSwap not called");

    // Verify swap happened
    assertLt(bobTokenAAfter, bobTokenABefore, "Token A not spent");
    assertGt(bobTokenBAfter, bobTokenBBefore, "Token B not received");

    console.log("  Hook beforeSwap called: YES");
    console.log("  Hook afterSwap called: YES");
    console.log("\n[PASS] Swap executed successfully");
  }

  function test_05_swap_tokenBForTokenA() public {
    console.log("\n=== TEST: Swap Token B for Token A ===");

    // First add liquidity
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );

    uint256 bobTokenABefore = tokenA.balanceOf(bob);
    uint256 bobTokenBBefore = tokenB.balanceOf(bob);

    console.log("Before swap:");
    console.log("  Bob Token A:", bobTokenABefore);
    console.log("  Bob Token B:", bobTokenBBefore);

    // Bob swaps Token B for Token A
    vm.prank(bob);
    swapRouter.swap(
      key,
      SwapParams({
        zeroForOne: false, // Token B (token1) for Token A (token0)
        amountSpecified: -int256(SWAP_AMOUNT),
        sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
      }),
      PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
      ZERO_BYTES
    );

    uint256 bobTokenAAfter = tokenA.balanceOf(bob);
    uint256 bobTokenBAfter = tokenB.balanceOf(bob);

    console.log("After swap:");
    console.log("  Bob Token A:", bobTokenAAfter);
    console.log("  Bob Token B:", bobTokenBAfter);
    console.log("  Token B spent:", bobTokenBBefore - bobTokenBAfter);
    console.log("  Token A received:", bobTokenAAfter - bobTokenABefore);

    // Verify swap happened
    assertGt(bobTokenAAfter, bobTokenABefore, "Token A not received");
    assertLt(bobTokenBAfter, bobTokenBBefore, "Token B not spent");

    console.log("\n[PASS] Reverse swap executed successfully");
  }

  function test_06_swap_withHookData() public {
    console.log("\n=== TEST: Swap with Hook Data ===");

    // Add liquidity first
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );

    bytes memory hookData = abi.encode(bob, uint256(100), "SWAP_REF_001", true, "router");

    // Execute swap with hook data
    vm.prank(bob);
    swapRouter.swap(
      key,
      SwapParams({
        zeroForOne: true,
        amountSpecified: -int256(SWAP_AMOUNT),
        sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
      }),
      PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
      hookData
    );

    // Verify hook data was stored
    (address user,, string memory refCode, bool isActive, string memory pattern) =
      hook.swapHookData(poolId, address(swapRouter));

    assertEq(user, bob);
    assertEq(refCode, "SWAP_REF_001");
    assertTrue(isActive);
    assertEq(pattern, "router");

    console.log("Hook data stored:");
    console.log("  User:", user);
    console.log("  RefCode:", refCode);
    console.log("  Pattern:", pattern);
    console.log("\n[PASS] Swap hook data stored correctly");
  }

  function test_07_swap_multipleSwaps() public {
    console.log("\n=== TEST: Multiple Sequential Swaps ===");

    // Add liquidity
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT * 10),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );

    uint256 initialBeforeSwapCount = hook.beforeSwapCount(poolId);
    uint256 initialAfterSwapCount = hook.afterSwapCount(poolId);

    // Execute 5 swaps
    for (uint256 i = 0; i < 5; i++) {
      vm.prank(bob);
      swapRouter.swap(
        key,
        SwapParams({
          zeroForOne: i % 2 == 0,
          amountSpecified: -int256(SWAP_AMOUNT / 10),
          sqrtPriceLimitX96: i % 2 == 0 ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        }),
        PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
        ZERO_BYTES
      );
    }

    assertEq(hook.beforeSwapCount(poolId), initialBeforeSwapCount + 5);
    assertEq(hook.afterSwapCount(poolId), initialAfterSwapCount + 5);

    console.log("  Executed 5 swaps");
    console.log("  beforeSwap called 5 times");
    console.log("  afterSwap called 5 times");
    console.log("\n[PASS] Multiple swaps executed successfully");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REMOVE LIQUIDITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  function test_08_removeLiquidity_success() public {
    console.log("\n=== TEST: Remove Liquidity ===");

    // Add liquidity first
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );

    uint256 aliceTokenABefore = tokenA.balanceOf(alice);
    uint256 aliceTokenBBefore = tokenB.balanceOf(alice);
    uint256 beforeRemoveCount = hook.beforeRemoveLiquidityCount(poolId);

    console.log("Before removing liquidity:");
    console.log("  Alice Token A:", aliceTokenABefore);
    console.log("  Alice Token B:", aliceTokenBBefore);

    // Remove half of the liquidity
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: -int256(LIQUIDITY_AMOUNT / 2),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );

    uint256 aliceTokenAAfter = tokenA.balanceOf(alice);
    uint256 aliceTokenBAfter = tokenB.balanceOf(alice);

    console.log("After removing liquidity:");
    console.log("  Alice Token A:", aliceTokenAAfter);
    console.log("  Alice Token B:", aliceTokenBAfter);
    console.log("  Token A withdrawn:", aliceTokenAAfter - aliceTokenABefore);
    console.log("  Token B withdrawn:", aliceTokenBAfter - aliceTokenBBefore);

    // Verify hook was called
    assertEq(hook.beforeRemoveLiquidityCount(poolId), beforeRemoveCount + 1);
    
    // Verify tokens were returned
    assertGt(aliceTokenAAfter, aliceTokenABefore, "Token A not returned");
    assertGt(aliceTokenBAfter, aliceTokenBBefore, "Token B not returned");

    console.log("  Hook beforeRemoveLiquidity called: YES");
    console.log("\n[PASS] Liquidity removed successfully");
  }

  function test_09_removeLiquidity_withHookData() public {
    console.log("\n=== TEST: Remove Liquidity with Hook Data ===");

    // Add liquidity
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );

    bytes memory hookData = abi.encode(alice, uint256(LIQUIDITY_AMOUNT / 2), "REMOVE_REF_001", true, "standard");

    // Remove liquidity with hook data
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: -int256(LIQUIDITY_AMOUNT / 2),
        salt: bytes32(0)
      }),
      hookData
    );

    // Verify hook data was stored
    (address user, uint256 amount, string memory refCode, bool isActive, string memory pattern) =
      hook.liquidityHookData(poolId, address(modifyLiquidityRouter));

    assertEq(user, alice);
    assertEq(amount, LIQUIDITY_AMOUNT / 2);
    assertEq(refCode, "REMOVE_REF_001");
    assertTrue(isActive);
    assertEq(pattern, "standard");

    console.log("Hook data stored:");
    console.log("  User:", user);
    console.log("  Amount:", amount);
    console.log("  RefCode:", refCode);
    console.log("\n[PASS] Remove liquidity hook data stored correctly");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  function test_10_fullCycle_addSwapRemove() public {
    console.log("\n=== TEST: Full Cycle (Add -> Swap -> Remove) ===");

    // 1. Alice adds liquidity
    console.log("Step 1: Alice adds liquidity");
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );
    console.log("  [DONE] Liquidity added");

    // 2. Bob swaps
    console.log("Step 2: Bob swaps Token A for Token B");
    vm.prank(bob);
    swapRouter.swap(
      key,
      SwapParams({
        zeroForOne: true,
        amountSpecified: -int256(SWAP_AMOUNT),
        sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
      }),
      PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
      ZERO_BYTES
    );
    console.log("  [DONE] Swap executed");

    // 3. Charlie swaps reverse
    console.log("Step 3: Charlie swaps Token B for Token A");
    vm.prank(charlie);
    swapRouter.swap(
      key,
      SwapParams({
        zeroForOne: false,
        amountSpecified: -int256(SWAP_AMOUNT),
        sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
      }),
      PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
      ZERO_BYTES
    );
    console.log("  [DONE] Reverse swap executed");

    // 4. Alice removes liquidity
    console.log("Step 4: Alice removes liquidity");
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: -int256(LIQUIDITY_AMOUNT),
        salt: bytes32(0)
      }),
      ZERO_BYTES
    );
    console.log("  [DONE] Liquidity removed");

    // Verify all hooks were called
    assertGt(hook.beforeAddLiquidityCount(poolId), 0);
    assertGt(hook.beforeSwapCount(poolId), 0);
    assertGt(hook.afterSwapCount(poolId), 0);
    assertGt(hook.beforeRemoveLiquidityCount(poolId), 0);

    console.log("\nHook calls summary:");
    console.log("  beforeAddLiquidity:", hook.beforeAddLiquidityCount(poolId));
    console.log("  beforeSwap:", hook.beforeSwapCount(poolId));
    console.log("  afterSwap:", hook.afterSwapCount(poolId));
    console.log("  beforeRemoveLiquidity:", hook.beforeRemoveLiquidityCount(poolId));
    console.log("\n[PASS] Full cycle completed successfully");
  }

  function test_11_stressTest_multipleUsersAndOperations() public {
    console.log("\n=== TEST: Stress Test - Multiple Users & Operations ===");

    // Alice, Bob, and Charlie all add liquidity
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: int256(LIQUIDITY_AMOUNT), salt: bytes32(uint256(1))}),
      ZERO_BYTES
    );

    vm.prank(bob);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: int256(LIQUIDITY_AMOUNT), salt: bytes32(uint256(2))}),
      ZERO_BYTES
    );

    vm.prank(charlie);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: int256(LIQUIDITY_AMOUNT), salt: bytes32(uint256(3))}),
      ZERO_BYTES
    );

    console.log("  3 users added liquidity");

    // Multiple swaps
    for (uint256 i = 0; i < 10; i++) {
      address swapper = i % 3 == 0 ? alice : (i % 3 == 1 ? bob : charlie);
      vm.prank(swapper);
      swapRouter.swap(
        key,
        SwapParams({
          zeroForOne: i % 2 == 0,
          amountSpecified: -int256(SWAP_AMOUNT / 20),
          sqrtPriceLimitX96: i % 2 == 0 ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        }),
        PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
        ZERO_BYTES
      );
    }

    console.log("  10 swaps executed by 3 users");

    // All users remove liquidity
    vm.prank(alice);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: -int256(LIQUIDITY_AMOUNT / 2), salt: bytes32(uint256(1))}),
      ZERO_BYTES
    );

    vm.prank(bob);
    modifyLiquidityRouter.modifyLiquidity(
      key,
      ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: -int256(LIQUIDITY_AMOUNT / 2), salt: bytes32(uint256(2))}),
      ZERO_BYTES
    );

    console.log("  2 users removed partial liquidity");

    console.log("\nFinal hook counts:");
    console.log("  beforeAddLiquidity:", hook.beforeAddLiquidityCount(poolId));
    console.log("  beforeSwap:", hook.beforeSwapCount(poolId));
    console.log("  afterSwap:", hook.afterSwapCount(poolId));
    console.log("  beforeRemoveLiquidity:", hook.beforeRemoveLiquidityCount(poolId));

    // Verify counts
    assertEq(hook.beforeAddLiquidityCount(poolId), 3);
    assertEq(hook.beforeSwapCount(poolId), 10);
    assertEq(hook.afterSwapCount(poolId), 10);
    assertEq(hook.beforeRemoveLiquidityCount(poolId), 2);

    console.log("\n[PASS] Stress test completed successfully");
  }
}
