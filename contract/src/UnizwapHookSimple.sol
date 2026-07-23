// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IERC721} from "forge-std/interfaces/IERC721.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
  BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

/**
 * @title UnizwapHookSimple
 * @notice Simplified hook with basic swap and liquidity management (no ZK proofs)
 * @dev Router pattern only - users interact via Uniswap V4 SwapRouter and PositionManager
 */
contract UnizwapHookSimple is BaseHook {
  using PoolIdLibrary for PoolKey;
  using CurrencyLibrary for Currency;

  struct HookData {
    address user;
    uint256 amount;
    string refCode;
    bool isActive;
    string pattern; // "vault" or "router"
  }

  IPositionManager public immutable positionManager;

  // Hook counters
  mapping(PoolId => uint256 count) public beforeSwapCount;
  mapping(PoolId => uint256 count) public afterSwapCount;
  mapping(PoolId => uint256 count) public beforeAddLiquidityCount;
  mapping(PoolId => uint256 count) public beforeRemoveLiquidityCount;

  // Hook data storage
  mapping(PoolId => mapping(address => HookData)) public swapHookData;
  mapping(PoolId => mapping(address => HookData)) public liquidityHookData;

  // Events - Swap
  event SwapExecuted(
    address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut
  );

  // Events - Liquidity
  event LiquidityAdded(address indexed user, uint256 indexed tokenId, uint128 liquidity);
  event LiquidityRemoved(address indexed user, uint256 indexed tokenId, uint128 liquidity);

  constructor(IPoolManager _poolManager, IPositionManager _positionManager) BaseHook(_poolManager) {
    positionManager = _positionManager;
  }

  function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
    return Hooks.Permissions({
      beforeInitialize: false,
      afterInitialize: false,
      beforeAddLiquidity: true, // Track liquidity additions
      afterAddLiquidity: false,
      beforeRemoveLiquidity: true, // Track liquidity removals
      afterRemoveLiquidity: false,
      beforeSwap: true, // Track swap intent
      afterSwap: true, // Track swap execution
      beforeDonate: false,
      afterDonate: false,
      beforeSwapReturnDelta: false,
      afterSwapReturnDelta: false,
      afterAddLiquidityReturnDelta: false,
      afterRemoveLiquidityReturnDelta: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWAP HOOKS (Router Pattern)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @notice beforeSwap hook - tracks swap intent
   */
  function _beforeSwap(
    address,
    PoolKey calldata key,
    SwapParams calldata,
    bytes calldata
  )
    internal
    override
    returns (bytes4, BeforeSwapDelta, uint24)
  {
    beforeSwapCount[key.toId()]++;
    return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
  }

  /**
   * @notice afterSwap hook - tracks swap execution and stores hook data
   */
  function _afterSwap(
    address sender,
    PoolKey calldata key,
    SwapParams calldata params,
    BalanceDelta delta,
    bytes calldata hookData
  )
    internal
    override
    returns (bytes4, int128)
  {
    afterSwapCount[key.toId()]++;

    // Store hook data if provided
    if (hookData.length > 0) {
      (address user, uint256 amount, string memory refCode, bool isActive, string memory pattern) =
        abi.decode(hookData, (address, uint256, string, bool, string));

      swapHookData[key.toId()][sender] =
        HookData({user: user, amount: amount, refCode: refCode, isActive: isActive, pattern: pattern});
    }

    // Calculate amounts for event
    int128 outputDelta = params.zeroForOne ? delta.amount1() : delta.amount0();
    uint256 amountOut = outputDelta > 0 ? uint256(int256(outputDelta)) : 0;
    uint256 amountIn = params.amountSpecified > 0 ? uint256(params.amountSpecified) : uint256(-params.amountSpecified);

    // Emit event for tracking
    emit SwapExecuted(
      sender,
      params.zeroForOne ? Currency.unwrap(key.currency0) : Currency.unwrap(key.currency1),
      params.zeroForOne ? Currency.unwrap(key.currency1) : Currency.unwrap(key.currency0),
      amountIn,
      amountOut
    );

    return (BaseHook.afterSwap.selector, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIQUIDITY FUNCTIONALITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @notice beforeAddLiquidity: Track liquidity additions
   * @param hookData Contains user information
   */
  function _beforeAddLiquidity(
    address sender,
    PoolKey calldata key,
    ModifyLiquidityParams calldata,
    bytes calldata hookData
  )
    internal
    override
    returns (bytes4)
  {
    beforeAddLiquidityCount[key.toId()]++;

    // Store liquidity addition data if provided
    if (hookData.length > 0) {
      (address user, uint256 amount, string memory refCode, bool isActive, string memory pattern) =
        abi.decode(hookData, (address, uint256, string, bool, string));

      liquidityHookData[key.toId()][sender] =
        HookData({user: user, amount: amount, refCode: refCode, isActive: isActive, pattern: pattern});
    }

    return BaseHook.beforeAddLiquidity.selector;
  }

  /**
   * @notice beforeRemoveLiquidity: Track liquidity removals
   * @param hookData Contains user information
   */
  function _beforeRemoveLiquidity(
    address sender,
    PoolKey calldata key,
    ModifyLiquidityParams calldata params,
    bytes calldata hookData
  )
    internal
    override
    returns (bytes4)
  {
    beforeRemoveLiquidityCount[key.toId()]++;

    // Store liquidity removal data if provided
    if (hookData.length > 0 && params.liquidityDelta < 0) {
      (address user, uint256 amount, string memory refCode, bool isActive, string memory pattern) =
        abi.decode(hookData, (address, uint256, string, bool, string));

      liquidityHookData[key.toId()][sender] =
        HookData({user: user, amount: amount, refCode: refCode, isActive: isActive, pattern: pattern});
    }

    return BaseHook.beforeRemoveLiquidity.selector;
  }

  /**
   * @notice Remove liquidity directly - user must own the NFT
   * @param key The pool key
   * @param tokenId The NFT token ID
   * @param liquidity Amount of liquidity to remove
   * @param recipient Address to receive the tokens
   */
  function removeLiquidity(PoolKey calldata key, uint256 tokenId, uint128 liquidity, address recipient) external {
    // Verify caller owns the NFT
    require(IERC721(address(positionManager)).ownerOf(tokenId) == msg.sender, "Not NFT owner");

    // Encode hookData for tracking
    bytes memory hookData = abi.encode(msg.sender, uint256(liquidity), "", false, "standard");

    // Encode actions: DECREASE_LIQUIDITY, TAKE, TAKE
    bytes memory actions =
      abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE), uint8(Actions.TAKE));

    // Encode params - tokens go to recipient
    bytes[] memory params = new bytes[](3);
    params[0] = abi.encode(tokenId, liquidity, 0, 0, hookData);
    params[1] = abi.encode(key.currency0, recipient, uint256(0)); // TAKE: (currency, recipient, amount)
    params[2] = abi.encode(key.currency1, recipient, uint256(0)); // TAKE: (currency, recipient, amount)

    bytes memory unlockData = abi.encode(actions, params);

    // Call PositionManager
    positionManager.modifyLiquidities(unlockData, block.timestamp + 3600);

    emit LiquidityRemoved(msg.sender, tokenId, liquidity);
  }
}
