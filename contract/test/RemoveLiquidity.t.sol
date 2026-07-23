// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

import {UnizwapHookSimple} from "../src/UnizwapHookSimple.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

/**
 * @title RemoveLiquidityTest
 * @notice Focused tests for the removeLiquidity helper function
 * @dev These tests verify the removeLiquidity wrapper function behavior
 */
contract RemoveLiquidityTest is Test {
  UnizwapHookSimple hook;

  address poolManager = makeAddr("poolManager");
  address positionManager = makeAddr("positionManager");
  address alice = makeAddr("alice");
  address bob = makeAddr("bob");

  PoolKey testKey;

  function setUp() public {
    hook = new UnizwapHookSimple(IPoolManager(poolManager), IPositionManager(positionManager));

    // Create a test pool key
    testKey = PoolKey({
      currency0: Currency.wrap(makeAddr("token0")),
      currency1: Currency.wrap(makeAddr("token1")),
      fee: 3000,
      tickSpacing: 60,
      hooks: hook
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // removeLiquidity Function Tests
  // ═══════════════════════════════════════════════════════════════════════════

  function test_removeLiquidity_revertsIfNotNFTOwner() public {
    uint256 tokenId = 1;
    uint128 liquidity = 1000;

    // Mock that bob owns the NFT, but alice tries to call
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("ownerOf(uint256)")), tokenId),
      abi.encode(bob)
    );

    vm.expectRevert("Not NFT owner");
    vm.prank(alice);
    hook.removeLiquidity(testKey, tokenId, liquidity, alice);
  }

  function test_removeLiquidity_successWhenOwnerCallsIt() public {
    uint256 tokenId = 1;
    uint128 liquidity = 1000;

    // Mock that alice owns the NFT
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("ownerOf(uint256)")), tokenId),
      abi.encode(alice)
    );

    // Mock the modifyLiquidities call to succeed
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("modifyLiquidities(bytes,uint256)"))),
      abi.encode(true)
    );

    // Should not revert
    vm.prank(alice);
    hook.removeLiquidity(testKey, tokenId, liquidity, alice);
  }

  function test_removeLiquidity_emitsLiquidityRemovedEvent() public {
    uint256 tokenId = 1;
    uint128 liquidity = 1000;

    // Mock that alice owns the NFT
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("ownerOf(uint256)")), tokenId),
      abi.encode(alice)
    );

    // Mock the modifyLiquidities call
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("modifyLiquidities(bytes,uint256)"))),
      abi.encode(true)
    );

    // Expect the LiquidityRemoved event
    vm.expectEmit(true, true, false, true);
    emit UnizwapHookSimple.LiquidityRemoved(alice, tokenId, liquidity);

    vm.prank(alice);
    hook.removeLiquidity(testKey, tokenId, liquidity, alice);
  }

  function test_removeLiquidity_canSpecifyDifferentRecipient() public {
    uint256 tokenId = 1;
    uint128 liquidity = 1000;

    // Mock that alice owns the NFT
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("ownerOf(uint256)")), tokenId),
      abi.encode(alice)
    );

    // Mock the modifyLiquidities call
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("modifyLiquidities(bytes,uint256)"))),
      abi.encode(true)
    );

    // Alice can remove liquidity but send tokens to bob
    vm.prank(alice);
    hook.removeLiquidity(testKey, tokenId, liquidity, bob);
  }

  function test_removeLiquidity_fuzz_variousLiquidityAmounts(uint128 liquidity) public {
    vm.assume(liquidity > 0 && liquidity < type(uint128).max);

    uint256 tokenId = 1;

    // Mock that alice owns the NFT
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("ownerOf(uint256)")), tokenId),
      abi.encode(alice)
    );

    // Mock the modifyLiquidities call
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("modifyLiquidities(bytes,uint256)"))),
      abi.encode(true)
    );

    // Should work with any valid liquidity amount
    vm.prank(alice);
    hook.removeLiquidity(testKey, tokenId, liquidity, alice);
  }

  function test_removeLiquidity_fuzz_variousTokenIds(uint256 tokenId) public {
    vm.assume(tokenId > 0 && tokenId < type(uint256).max);

    uint128 liquidity = 1000;

    // Mock that alice owns the NFT
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("ownerOf(uint256)")), tokenId),
      abi.encode(alice)
    );

    // Mock the modifyLiquidities call
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("modifyLiquidities(bytes,uint256)"))),
      abi.encode(true)
    );

    // Should work with any valid token ID
    vm.prank(alice);
    hook.removeLiquidity(testKey, tokenId, liquidity, alice);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  function test_removeLiquidity_multipleUsersWithDifferentNFTs() public {
    uint256 aliceTokenId = 1;
    uint256 bobTokenId = 2;
    uint128 liquidity = 1000;

    // Mock that alice owns tokenId 1
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("ownerOf(uint256)")), aliceTokenId),
      abi.encode(alice)
    );

    // Mock that bob owns tokenId 2
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("ownerOf(uint256)")), bobTokenId),
      abi.encode(bob)
    );

    // Mock the modifyLiquidities calls
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("modifyLiquidities(bytes,uint256)"))),
      abi.encode(true)
    );

    // Alice removes her liquidity
    vm.prank(alice);
    hook.removeLiquidity(testKey, aliceTokenId, liquidity, alice);

    // Bob removes his liquidity
    vm.prank(bob);
    hook.removeLiquidity(testKey, bobTokenId, liquidity, bob);
  }

  function test_removeLiquidity_revertsIfZeroLiquidity() public {
    uint256 tokenId = 1;
    uint128 liquidity = 0;

    // Mock that alice owns the NFT
    vm.mockCall(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("ownerOf(uint256)")), tokenId),
      abi.encode(alice)
    );

    // Mock will handle this - in real scenario PositionManager would revert
    vm.mockCallRevert(
      positionManager,
      abi.encodeWithSelector(bytes4(keccak256("modifyLiquidities(bytes,uint256)"))),
      "Invalid liquidity"
    );

    vm.expectRevert();
    vm.prank(alice);
    hook.removeLiquidity(testKey, tokenId, liquidity, alice);
  }
}
