// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IERC721} from "forge-std/interfaces/IERC721.sol";
import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";

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

interface IVerifierWithdraw {
  function verifyProof(
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[4] calldata _pubSignals
  )
    external
    view
    returns (bool);
}

interface IVerifierRemoveLiquidity {
  function verifyProof(
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[6] calldata _pubSignals
  )
    external
    view
    returns (bool);
}

/**
 * @title UnizwapHook
 * @notice Unified hook combining private swaps and private liquidity management
 * @dev Merges VaultHook (swap functionality) and VaultHookHybrid (liquidity functionality)
 */
contract UnizwapHook is BaseHook, MerkleTreeWithHistory(10) {
  using PoolIdLibrary for PoolKey;
  using CurrencyLibrary for Currency;

  struct HookData {
    address user;
    uint256 amount;
    string refCode;
    bool isActive;
    string pattern; // "vault" or "router"
    bytes32 commitment; // Merkle tree commitment for privacy
  }

  // Verifiers
  IVerifierWithdraw public immutable _verifierWithdraw;
  IVerifierRemoveLiquidity public immutable _verifierRemoveLq;
  IPositionManager public immutable positionManager;

  // User deposits for swap functionality
  mapping(address => mapping(address => uint256)) public userDeposits; // user => token => amount

  // Commitment-based deposits for privacy withdrawals
  mapping(bytes32 => mapping(address => uint256)) public commitmentDeposits; // commitment => token => amount

  // Privacy: Commitments and nullifiers
  mapping(bytes32 => bool) public commitments; // Liquidity commitments
  mapping(bytes32 => bool) public nullifiers; // Prevents double-spending (swap & liquidity)

  // Hook counters
  mapping(PoolId => uint256 count) public beforeSwapCount;
  mapping(PoolId => uint256 count) public afterSwapCount;
  mapping(PoolId => uint256 count) public beforeAddLiquidityCount;
  mapping(PoolId => uint256 count) public beforeRemoveLiquidityCount;

  // Hook data storage
  mapping(PoolId => mapping(address => HookData)) public swapHookData;
  mapping(PoolId => mapping(address => HookData)) public liquidityHookData;

  // Events - Swap
  event Deposit(address indexed user, address indexed token, uint256 amount);
  event Withdraw(address indexed user, address indexed token, uint256 amount);
  event SwapWithVault(
    address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut
  );

  // Events - Liquidity
  event LiquidityAdded(
    bytes32 indexed commitment, uint256 indexed tokenId, address indexed depositor, uint128 liquidity
  );
  event LiquidityRemoved(
    bytes32 indexed nullifier, uint256 indexed tokenId, address indexed recipient, uint128 liquidity
  );
  event NewLeafInserted(bytes32 indexed commitment, uint32 indexed leafIndex, bytes32 root);
  event NullifierUsed(bytes32 indexed nullifier);

  constructor(
    IPoolManager _poolManager,
    IPositionManager _positionManager,
    address verifierWithdrawAddress,
    address verifierRemoveLiquidityAddress
  )
    BaseHook(_poolManager)
  {
    _verifierWithdraw = IVerifierWithdraw(verifierWithdrawAddress);
    _verifierRemoveLq = IVerifierRemoveLiquidity(verifierRemoveLiquidityAddress);
    positionManager = _positionManager;
  }

  function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
    return Hooks.Permissions({
      beforeInitialize: false,
      afterInitialize: false,
      beforeAddLiquidity: true, // Insert commitment for private LP
      afterAddLiquidity: false,
      beforeRemoveLiquidity: true, // Verify ZK proof for private LP removal
      afterRemoveLiquidity: false,
      beforeSwap: true, // Track swap intent
      afterSwap: true, // Execute vault swap
      beforeDonate: false,
      afterDonate: false,
      beforeSwapReturnDelta: false,
      afterSwapReturnDelta: true, // Return delta for vault swaps
      afterAddLiquidityReturnDelta: false,
      afterRemoveLiquidityReturnDelta: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWAP FUNCTIONALITY (from VaultHook)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @notice Deposit tokens into the contract before swapping
   * @param token The token address to deposit
   * @param amount The amount to deposit
   */
  function deposit(address token, uint256 amount) external {
    require(amount > 0, "Amount must be greater than 0");
    require(token != address(0), "Invalid token address");

    IERC20(token).transferFrom(msg.sender, address(this), amount);
    userDeposits[msg.sender][token] += amount;

    emit Deposit(msg.sender, token, amount);
  }

  /**
   * @notice Swap using deposited vault tokens
   * @param key The pool key
   * @param zeroForOne Direction of swap
   * @param amountSpecified Amount to swap (negative for exact input)
   * @param hookData Custom data to pass to hooks
   * @return delta The balance delta from the swap
   */
  function swap(
    PoolKey calldata key,
    bool zeroForOne,
    int256 amountSpecified,
    bytes calldata hookData
  )
    external
    returns (BalanceDelta delta)
  {
    // Process hookData BEFORE swap execution
    if (hookData.length > 0) {
      // Decode hookData for validation
      (address user, uint256 minOutput, string memory refCode, bool isActive, string memory pattern, bytes32 commitment)
      = abi.decode(hookData, (address, uint256, string, bool, string, bytes32));

      // Validate user matches caller
      require(user == msg.sender, "User mismatch");

      // Validate pattern is "vault"
      require(keccak256(bytes(pattern)) == keccak256(bytes("vault")), "Invalid pattern for vault swap");
    }

    // Verify user has sufficient deposit
    address tokenIn = zeroForOne ? Currency.unwrap(key.currency0) : Currency.unwrap(key.currency1);
    uint256 amountIn = amountSpecified > 0 ? uint256(amountSpecified) : uint256(-amountSpecified);
    require(userDeposits[msg.sender][tokenIn] >= amountIn, "Insufficient vault balance");

    // Deduct from vault balance
    userDeposits[msg.sender][tokenIn] -= amountIn;

    // Prepare swap params
    SwapParams memory params = SwapParams({
      zeroForOne: zeroForOne,
      amountSpecified: amountSpecified,
      sqrtPriceLimitX96: zeroForOne ? 4_295_128_740 : 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_341
    });

    // Execute swap via poolManager.unlock (pass hookData through)
    bytes memory unlockData = abi.encode(key, params, msg.sender, hookData);
    delta = abi.decode(poolManager.unlock(unlockData), (BalanceDelta));

    return delta;
  }

  /**
   * @notice Callback for poolManager.unlock during swap
   */
  function unlockCallback(bytes calldata data) external returns (bytes memory) {
    require(msg.sender == address(poolManager), "Only pool manager");

    // Check if this is a liquidity removal callback vs swap callback
    if (data.length < 500) {
      // Try to decode as liquidity removal first (shorter encoding)
      try this.decodeLiquidityData(data) returns (
        PoolKey memory liquidityKey, ModifyLiquidityParams memory liquidityParams, address recipient
      ) {
        return this.handleLiquidityRemoval(liquidityKey, liquidityParams, recipient);
      } catch {
        // Fall through to swap logic
      }
    }

    // Decode as swap callback data
    (PoolKey memory key, SwapParams memory params, address user, bytes memory hookData) =
      abi.decode(data, (PoolKey, SwapParams, address, bytes));

    // Execute the swap with custom hookData
    BalanceDelta delta = poolManager.swap(key, params, hookData);

    // Process hookData AFTER swap execution
    if (hookData.length > 0) {
      (
        address hookUser,
        uint256 minOutput,
        string memory refCode,
        bool isActive,
        string memory pattern,
        bytes32 commitment
      ) = abi.decode(hookData, (address, uint256, string, bool, string, bytes32));

      // Check if swap met minimum output
      int128 actualOutputDelta = params.zeroForOne ? delta.amount1() : delta.amount0();
      uint256 actualOutput = actualOutputDelta > 0 ? uint256(int256(actualOutputDelta)) : 0;

      require(actualOutput >= minOutput, "Output below minimum");

      // Store hookData after successful swap with actual results
      swapHookData[key.toId()][user] = HookData({
        user: hookUser,
        amount: actualOutput, // Store actual output, not minOutput
        refCode: refCode,
        isActive: isActive,
        pattern: pattern,
        commitment: commitment
      });
    }

    // Handle input token (transfer from vault to pool)
    address tokenIn = params.zeroForOne ? Currency.unwrap(key.currency0) : Currency.unwrap(key.currency1);
    int128 inputDelta = params.zeroForOne ? delta.amount0() : delta.amount1();
    if (inputDelta < 0) {
      uint256 amountIn = uint256(int256(-inputDelta));
      Currency currencyIn = params.zeroForOne ? key.currency0 : key.currency1;
      poolManager.sync(currencyIn);
      IERC20(tokenIn).transfer(address(poolManager), amountIn);
      poolManager.settle();
    }

    // Handle output token (take from pool to vault)
    address tokenOut = params.zeroForOne ? Currency.unwrap(key.currency1) : Currency.unwrap(key.currency0);
    int128 outputDelta = params.zeroForOne ? delta.amount1() : delta.amount0();
    if (outputDelta > 0) {
      poolManager.take(Currency.wrap(tokenOut), address(this), uint256(int256(outputDelta)));

      // Insert commitment to Merkle tree for vault pattern privacy
      if (hookData.length > 0) {
        (,,,,, bytes32 commitment) = abi.decode(hookData, (address, uint256, string, bool, string, bytes32));
        if (commitment != bytes32(0)) {
          // Store by commitment as key
          commitmentDeposits[commitment][tokenOut] = uint256(int256(outputDelta));
          // Insert to Merkle tree
          uint32 leafIndex = _insert(commitment);
          emit NewLeafInserted(commitment, leafIndex, roots[currentRootIndex]);
        }
      }
    }

    return abi.encode(delta);
  }

  /**
   * @notice Get user's deposited balance for a specific token
   * @param user The user address
   * @param token The token address
   * @return The deposited amount
   */
  function getDepositBalance(address user, address token) external view returns (uint256) {
    return userDeposits[user][token];
  }

  /**
   * @notice Helper to decode liquidity removal data
   */
  function decodeLiquidityData(bytes calldata data)
    external
    pure
    returns (PoolKey memory key, ModifyLiquidityParams memory params, address recipient)
  {
    (key, params, recipient) = abi.decode(data, (PoolKey, ModifyLiquidityParams, address));
  }

  /**
   * @notice Handle liquidity removal callback
   */
  function handleLiquidityRemoval(
    PoolKey memory key,
    ModifyLiquidityParams memory params,
    address recipient
  )
    external
    returns (bytes memory)
  {
    require(msg.sender == address(this), "Only self");

    // Remove liquidity
    (BalanceDelta delta,) = poolManager.modifyLiquidity(key, params, "");

    // Transfer tokens to recipient
    if (delta.amount0() > 0) {
      poolManager.take(key.currency0, recipient, uint256(int256(delta.amount0())));
    }
    if (delta.amount1() > 0) {
      poolManager.take(key.currency1, recipient, uint256(int256(delta.amount1())));
    }

    return abi.encode(delta);
  }

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
   * @notice afterSwap hook - handles vault swap token collection
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

    address actualUser = sender;
    uint256 amountIn;
    uint256 amountOut;

    if (hookData.length > 0) {
      (address user, uint256 amount, string memory refCode, bool isActive, string memory pattern, bytes32 commitment) =
        abi.decode(hookData, (address, uint256, string, bool, string, bytes32));
      actualUser = user;

      // Validate pattern is "router"
      require(keccak256(bytes(pattern)) == keccak256(bytes("router")), "Invalid pattern for router swap");

      // Store hookData after swap execution
      swapHookData[key.toId()][sender] = HookData({
        user: user,
        amount: amount,
        refCode: refCode,
        isActive: isActive,
        pattern: pattern,
        commitment: commitment
      });
    }

    // Calculate amounts
    int128 outputDelta = params.zeroForOne ? delta.amount1() : delta.amount0();
    amountOut = outputDelta > 0 ? uint256(int256(outputDelta)) : 0;
    amountIn = params.amountSpecified > 0 ? uint256(params.amountSpecified) : uint256(-params.amountSpecified);

    // Collect output tokens to vault instead of sending to user
    if (outputDelta > 0) {
      address tokenOut = params.zeroForOne ? Currency.unwrap(key.currency1) : Currency.unwrap(key.currency0);

      // Credit output to user's vault balance
      userDeposits[actualUser][tokenOut] += amountOut;

      // Store commitment with actual output amount
      if (hookData.length > 0) {
        (,,,,, bytes32 commitment) = abi.decode(hookData, (address, uint256, string, bool, string, bytes32));
        if (commitment != bytes32(0)) {
          commitmentDeposits[commitment][tokenOut] = amountOut;
        }
      }

      // Take tokens from pool manager to this contract
      poolManager.take(Currency.wrap(tokenOut), address(this), amountOut);

      // Insert commitment to Merkle tree and store amount for router pattern privacy
      if (hookData.length > 0) {
        (,,,,, bytes32 commitment) = abi.decode(hookData, (address, uint256, string, bool, string, bytes32));
        if (commitment != bytes32(0)) {
          // Store commitment with actual output amount
          commitmentDeposits[commitment][tokenOut] = amountOut;
          // Insert to Merkle tree
          uint32 leafIndex = _insert(commitment);
          emit NewLeafInserted(commitment, leafIndex, roots[currentRootIndex]);
        }
      }
    }

    // Emit event for tracking
    emit SwapWithVault(
      actualUser,
      params.zeroForOne ? Currency.unwrap(key.currency0) : Currency.unwrap(key.currency1),
      params.zeroForOne ? Currency.unwrap(key.currency1) : Currency.unwrap(key.currency0),
      amountIn,
      amountOut
    );

    // Return the output delta to claim the tokens
    return (BaseHook.afterSwap.selector, outputDelta);
  }

  /**
   * @notice Withdraw with ZK proof (private)
   * @param commitment The commitment to withdraw from
   * @param _pA Proof component A
   * @param _pB Proof component B
   * @param _pC Proof component C
   * @param _pubSignals Public signals [merkleRoot, nullifier, tokenAddress, depositAmount]
   */
  function withdrawPrivate(
    bytes32 commitment,
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[4] calldata _pubSignals
  )
    external
  {
    // Extract public signals (must match circuit order)
    bytes32 merkle_root = bytes32(_pubSignals[0]);
    bytes32 nullifier = bytes32(_pubSignals[1]);
    address token = address(uint160(_pubSignals[2]));

    // Validate the proof with extracted values
    require(!nullifiers[nullifier], "Already withdrawn");
    require(isKnownRoot(merkle_root), "invalid root");
    require(_verifierWithdraw.verifyProof(_pA, _pB, _pC, _pubSignals), "invalid proof");

    // The proof verifies that commitment is in the Merkle tree
    // Now get the stored amount for this commitment
    uint256 amount = commitmentDeposits[commitment][token];
    require(amount > 0, "No balance to withdraw");

    // Mark nullifier as used to prevent double withdrawal
    nullifiers[nullifier] = true;
    commitmentDeposits[commitment][token] = 0;

    // Transfer to msg.sender (the withdrawal wallet, can be different from deposit wallet)
    IERC20(token).transfer(msg.sender, amount);

    emit Withdraw(msg.sender, token, amount);
  }
}
