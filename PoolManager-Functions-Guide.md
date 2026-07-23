# Uniswap v4 PoolManager Functions Guide

Complete reference for all PoolManager functions with practical examples.

---

## Table of Contents
- [Core Concepts](#core-concepts)
- [The Unlock Pattern](#the-unlock-pattern)
- [Swap Functions](#swap-functions)
- [Liquidity Functions](#liquidity-functions)
- [Token Settlement Functions](#token-settlement-functions)
- [Advanced Functions](#advanced-functions)
- [Complete Examples](#complete-examples)

---

## Core Concepts

### Balance Deltas

PoolManager uses **signed integers** to track who owes what:
- **Negative (`< 0`)**: You owe tokens to PoolManager
- **Positive (`> 0`)**: PoolManager owes you tokens
- **Zero (`= 0`)**: No balance change

```solidity
BalanceDelta delta = poolManager.swap(...);

int128 amount0 = delta.amount0();
// amount0 = -10e18  →  You owe 10 tokenA
// amount0 = +5e18   →  You receive 5 tokenA
```

---

## The Unlock Pattern

### `unlock(bytes calldata data)`

**The foundation of all PoolManager interactions.**

```solidity
function unlock(bytes calldata data) external returns (bytes memory)
```

**What it does:**
- Unlocks PoolManager for atomic operations
- Calls your `unlockCallback()` function
- Ensures all debts are settled before completing
- Provides reentrancy protection

**Usage Pattern:**

```solidity
// Step 1: Encode your operation data
bytes memory unlockData = abi.encode(key, params, recipient);

// Step 2: Call unlock
bytes memory result = poolManager.unlock(unlockData);

// Step 3: Implement the callback
function unlockCallback(bytes calldata data) external returns (bytes memory) {
    require(msg.sender == address(poolManager), "Only PoolManager");
    
    // Decode data
    (PoolKey memory key, SwapParams memory params, address recipient) = 
        abi.decode(data, (PoolKey, SwapParams, address));
    
    // Perform operations inside unlock
    BalanceDelta delta = poolManager.swap(key, params, "");
    
    // Settle debts
    _settleDeltas(delta, key);
    
    return abi.encode(delta);
}
```

**Why unlock is required:**
- **Flash accounting**: Temporary negative balances allowed during unlock
- **Atomicity**: All operations succeed or fail together
- **Gas efficiency**: Batch multiple operations before settling

---

## Swap Functions

### `swap(PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)`

Executes a token swap in the pool.

```solidity
function swap(
    PoolKey calldata key,
    SwapParams calldata params,
    bytes calldata hookData
) external returns (BalanceDelta delta)
```

**Parameters:**
- `key`: Pool identifier (tokens, fee, tickSpacing, hooks)
- `params`: Swap parameters (direction, amount, price limit)
- `hookData`: Custom data passed to your hooks

**Example: Basic Swap**

```solidity
function executeSwap(
    PoolKey calldata key,
    bool zeroForOne,
    int256 amountSpecified
) external returns (BalanceDelta) {
    // Prepare swap parameters
    SwapParams memory params = SwapParams({
        zeroForOne: zeroForOne,          // true: token0 → token1
        amountSpecified: amountSpecified, // negative = exact input
        sqrtPriceLimitX96: zeroForOne 
            ? 4295128740                  // MIN_PRICE_LIMIT
            : 1461446703485210103287273052203988822378723970341 // MAX_PRICE_LIMIT
    });
    
    // Encode data for unlock callback
    bytes memory unlockData = abi.encode(key, params, msg.sender);
    
    // Execute via unlock
    return abi.decode(poolManager.unlock(unlockData), (BalanceDelta));
}

function unlockCallback(bytes calldata data) external returns (bytes memory) {
    require(msg.sender == address(poolManager), "Only PoolManager");
    
    (PoolKey memory key, SwapParams memory params, address user) = 
        abi.decode(data, (PoolKey, SwapParams, address));
    
    // Execute the swap
    BalanceDelta delta = poolManager.swap(key, params, "");
    
    // Handle input token (negative delta = you owe)
    if (params.zeroForOne && delta.amount0() < 0) {
        uint256 amountOwed = uint256(-delta.amount0());
        _settleDebt(key.currency0, amountOwed);
    } else if (!params.zeroForOne && delta.amount1() < 0) {
        uint256 amountOwed = uint256(-delta.amount1());
        _settleDebt(key.currency1, amountOwed);
    }
    
    // Handle output token (positive delta = you receive)
    if (params.zeroForOne && delta.amount1() > 0) {
        poolManager.take(key.currency1, user, uint256(delta.amount1()));
    } else if (!params.zeroForOne && delta.amount0() > 0) {
        poolManager.take(key.currency0, user, uint256(delta.amount0()));
    }
    
    return abi.encode(delta);
}
```

**Example: Swap with Hook Data**

```solidity
function swapWithCommitment(
    PoolKey calldata key,
    int256 amountIn,
    bytes32 commitment
) external {
    SwapParams memory params = SwapParams({
        zeroForOne: true,
        amountSpecified: -amountIn, // Negative = exact input
        sqrtPriceLimitX96: 4295128740
    });
    
    // Encode hook data
    bytes memory hookData = abi.encode(
        msg.sender,    // user
        commitment     // privacy commitment
    );
    
    bytes memory unlockData = abi.encode(key, params, hookData);
    poolManager.unlock(unlockData);
}
```

---

## Liquidity Functions

### `initialize(PoolKey calldata key, uint160 sqrtPriceX96, bytes calldata hookData)`

Creates a new liquidity pool.

```solidity
function initialize(
    PoolKey calldata key,
    uint160 sqrtPriceX96,
    bytes calldata hookData
) external returns (int24 tick)
```

**Example: Create Pool at 1:1 Price**

```solidity
function createPool(
    address tokenA,
    address tokenB,
    address hookAddress
) external {
    // Sort tokens (token0 < token1)
    (address token0, address token1) = tokenA < tokenB 
        ? (tokenA, tokenB) 
        : (tokenB, tokenA);
    
    PoolKey memory key = PoolKey({
        currency0: Currency.wrap(token0),
        currency1: Currency.wrap(token1),
        fee: 3000,                  // 0.3% fee
        tickSpacing: 60,
        hooks: IHooks(hookAddress)
    });
    
    // Price = 1:1 → sqrtPrice = sqrt(1) * 2^96
    uint160 sqrtPriceX96 = 79228162514264337593543950336;
    
    int24 tick = poolManager.initialize(key, sqrtPriceX96, "");
}
```

**Example: Initialize at Custom Price**

```solidity
// Create pool where 1 tokenA = 2 tokenB
// Price = 2, sqrtPrice = sqrt(2) * 2^96
uint160 sqrtPriceX96 = 112045541949572279837463876454; // sqrt(2) * 2^96

poolManager.initialize(key, sqrtPriceX96, "");
```

### `modifyLiquidity(PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata hookData)`

Add or remove liquidity from a pool.

```solidity
function modifyLiquidity(
    PoolKey calldata key,
    ModifyLiquidityParams calldata params,
    bytes calldata hookData
) external returns (BalanceDelta delta, BalanceDelta feesAccrued)
```

**Example: Add Liquidity**

```solidity
function addLiquidity(
    PoolKey calldata key,
    int24 tickLower,
    int24 tickUpper,
    uint256 liquidityAmount
) external {
    ModifyLiquidityParams memory params = ModifyLiquidityParams({
        tickLower: tickLower,
        tickUpper: tickUpper,
        liquidityDelta: int256(liquidityAmount), // Positive = add
        salt: bytes32(0)
    });
    
    bytes memory unlockData = abi.encode(key, params);
    poolManager.unlock(unlockData);
}

function unlockCallback(bytes calldata data) external returns (bytes memory) {
    (PoolKey memory key, ModifyLiquidityParams memory params) = 
        abi.decode(data, (PoolKey, ModifyLiquidityParams));
    
    // Add liquidity
    (BalanceDelta delta,) = poolManager.modifyLiquidity(key, params, "");
    
    // Both deltas are negative (you owe both tokens)
    if (delta.amount0() < 0) {
        _settleDebt(key.currency0, uint256(-delta.amount0()));
    }
    if (delta.amount1() < 0) {
        _settleDebt(key.currency1, uint256(-delta.amount1()));
    }
    
    return abi.encode(delta);
}
```

**Example: Remove Liquidity**

```solidity
function removeLiquidity(
    PoolKey calldata key,
    int24 tickLower,
    int24 tickUpper,
    uint256 liquidityAmount,
    address recipient
) external {
    ModifyLiquidityParams memory params = ModifyLiquidityParams({
        tickLower: tickLower,
        tickUpper: tickUpper,
        liquidityDelta: -int256(liquidityAmount), // Negative = remove
        salt: bytes32(0)
    });
    
    bytes memory unlockData = abi.encode(key, params, recipient);
    poolManager.unlock(unlockData);
}

function unlockCallback(bytes calldata data) external returns (bytes memory) {
    (PoolKey memory key, ModifyLiquidityParams memory params, address recipient) = 
        abi.decode(data, (PoolKey, ModifyLiquidityParams, address));
    
    // Remove liquidity
    (BalanceDelta delta,) = poolManager.modifyLiquidity(key, params, "");
    
    // Both deltas are positive (you receive both tokens)
    if (delta.amount0() > 0) {
        poolManager.take(key.currency0, recipient, uint256(delta.amount0()));
    }
    if (delta.amount1() > 0) {
        poolManager.take(key.currency1, recipient, uint256(delta.amount1()));
    }
    
    return abi.encode(delta);
}
```

---

## Token Settlement Functions

### `sync(Currency currency)`

Records PoolManager's current token balance before you transfer tokens.

```solidity
function sync(Currency currency) external
```

**Usage:**

```solidity
// Before sending tokens to PoolManager
poolManager.sync(currency);
IERC20(token).transfer(address(poolManager), amount);
poolManager.settle();
```

### `settle()`

Settles (pays) your debt to PoolManager.

```solidity
function settle() external returns (uint256 paid)
```

**Example: Complete Settlement Pattern**

```solidity
function _settleDebt(Currency currency, uint256 amount) internal {
    address token = Currency.unwrap(currency);
    
    // Step 1: Record PoolManager's current balance
    poolManager.sync(currency);
    
    // Step 2: Transfer tokens to PoolManager
    IERC20(token).transfer(address(poolManager), amount);
    
    // Step 3: Mark debt as settled
    poolManager.settle();
}
```

**Alternative: Direct Settle (if tokens already sent)**

```solidity
// If tokens were already transferred in a previous step
poolManager.settle(); // Just settle without sync/transfer
```

### `take(Currency currency, address to, uint256 amount)`

Withdraw tokens from PoolManager to a recipient.

```solidity
function take(
    Currency currency,
    address to,
    uint256 amount
) external
```

**Example: Withdraw Tokens**

```solidity
function withdrawTokens(Currency currency, address recipient, uint256 amount) external {
    // Take tokens from PoolManager
    poolManager.take(currency, recipient, amount);
}
```

**Example: Take All Output from Swap**

```solidity
// After swap with positive delta
int128 outputDelta = delta.amount1();
if (outputDelta > 0) {
    poolManager.take(
        key.currency1,
        msg.sender,
        uint256(outputDelta)
    );
}
```

---

## Advanced Functions

### `mint(Currency currency, address to, uint256 amount)` & `burn(Currency currency, uint256 amount)`

Use ERC6909 claims instead of immediate withdrawals (gas optimization).

```solidity
function mint(Currency currency, address to, uint256 amount) external
function burn(Currency currency, uint256 amount) external
```

**Example: Mint Claims (Defer Withdrawal)**

```solidity
// Instead of taking tokens immediately
function claimOutput(BalanceDelta delta, Currency currency) internal {
    if (delta.amount1() > 0) {
        // Option 1: Take immediately (costs gas now)
        poolManager.take(currency, msg.sender, uint256(delta.amount1()));
        
        // Option 2: Mint claims (cheaper, withdraw later)
        poolManager.mint(currency, msg.sender, uint256(delta.amount1()));
    }
}

// Later: User burns claims and withdraws
function withdrawClaims(Currency currency, uint256 amount) external {
    // Burn the claim tokens
    poolManager.burn(currency, amount);
    
    // Withdraw actual tokens
    poolManager.take(currency, msg.sender, amount);
}
```

### `donate(PoolKey calldata key, uint256 amount0, uint256 amount1, bytes calldata hookData)`

Donate tokens to all liquidity providers in a pool.

```solidity
function donate(
    PoolKey calldata key,
    uint256 amount0,
    uint256 amount1,
    bytes calldata hookData
) external returns (BalanceDelta delta)
```

**Example: Reward Liquidity Providers**

```solidity
function rewardProviders(PoolKey calldata key, uint256 rewardAmount) external {
    bytes memory unlockData = abi.encode(key, rewardAmount);
    poolManager.unlock(unlockData);
}

function unlockCallback(bytes calldata data) external returns (bytes memory) {
    (PoolKey memory key, uint256 rewardAmount) = 
        abi.decode(data, (PoolKey, uint256));
    
    // Donate rewards to token1 LPs
    BalanceDelta delta = poolManager.donate(key, 0, rewardAmount, "");
    
    // You owe the reward amount
    _settleDebt(key.currency1, rewardAmount);
    
    return abi.encode(delta);
}
```

### `updateDynamicLPFee(PoolKey calldata key, uint24 newDynamicLPFee)`

Update pool fees dynamically (hook only).

```solidity
function updateDynamicLPFee(
    PoolKey calldata key,
    uint24 newDynamicLPFee
) external
```

**Example: Dynamic Fee Hook**

```solidity
contract DynamicFeeHook is BaseHook {
    function beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        bytes calldata
    ) external override returns (bytes4, BeforeSwapDelta, uint24) {
        // Calculate fee based on volatility
        uint24 dynamicFee = calculateFee();
        
        // Update pool fee
        poolManager.updateDynamicLPFee(key, dynamicFee);
        
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }
    
    function calculateFee() internal view returns (uint24) {
        // Example: Higher fee during high volatility
        // Fee in hundredths of bips (10000 = 1%)
        return 3000; // 0.3%
    }
}
```

---

## Complete Examples

### Example 1: Full Swap Flow with Vault Pattern

```solidity
contract VaultSwapper {
    IPoolManager public immutable poolManager;
    
    // User deposits tokens into vault
    mapping(address => mapping(address => uint256)) public deposits;
    
    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }
    
    // Step 1: User deposits tokens
    function deposit(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender][token] += amount;
    }
    
    // Step 2: User swaps using vault balance
    function swapFromVault(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn
    ) external returns (BalanceDelta) {
        address tokenIn = zeroForOne 
            ? Currency.unwrap(key.currency0)
            : Currency.unwrap(key.currency1);
        
        require(deposits[msg.sender][tokenIn] >= amountIn, "Insufficient balance");
        
        // Deduct from vault
        deposits[msg.sender][tokenIn] -= amountIn;
        
        // Prepare swap
        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn),
            sqrtPriceLimitX96: zeroForOne ? 4295128740 : type(uint160).max
        });
        
        bytes memory unlockData = abi.encode(key, params, msg.sender);
        return abi.decode(poolManager.unlock(unlockData), (BalanceDelta));
    }
    
    // Unlock callback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");
        
        (PoolKey memory key, SwapParams memory params, address user) = 
            abi.decode(data, (PoolKey, SwapParams, address));
        
        // Execute swap
        BalanceDelta delta = poolManager.swap(key, params, "");
        
        // Settle input debt
        Currency currencyIn = params.zeroForOne ? key.currency0 : key.currency1;
        int128 inputDelta = params.zeroForOne ? delta.amount0() : delta.amount1();
        
        if (inputDelta < 0) {
            poolManager.sync(currencyIn);
            IERC20(Currency.unwrap(currencyIn)).transfer(
                address(poolManager),
                uint256(-inputDelta)
            );
            poolManager.settle();
        }
        
        // Collect output to vault
        Currency currencyOut = params.zeroForOne ? key.currency1 : key.currency0;
        int128 outputDelta = params.zeroForOne ? delta.amount1() : delta.amount0();
        
        if (outputDelta > 0) {
            poolManager.take(currencyOut, address(this), uint256(outputDelta));
            deposits[user][Currency.unwrap(currencyOut)] += uint256(outputDelta);
        }
        
        return abi.encode(delta);
    }
    
    // Step 3: User withdraws from vault
    function withdraw(address token, uint256 amount) external {
        require(deposits[msg.sender][token] >= amount, "Insufficient balance");
        deposits[msg.sender][token] -= amount;
        IERC20(token).transfer(msg.sender, amount);
    }
}
```

### Example 2: Add Liquidity with NFT Position

```solidity
contract LiquidityManager {
    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    
    constructor(IPoolManager _poolManager, IPositionManager _positionManager) {
        poolManager = _poolManager;
        positionManager = _positionManager;
    }
    
    function addLiquidityWithNFT(
        PoolKey calldata key,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0Desired,
        uint256 amount1Desired
    ) external returns (uint256 tokenId, uint128 liquidity) {
        // Approve tokens
        IERC20(Currency.unwrap(key.currency0)).transferFrom(
            msg.sender, address(this), amount0Desired
        );
        IERC20(Currency.unwrap(key.currency1)).transferFrom(
            msg.sender, address(this), amount1Desired
        );
        
        // Approve PositionManager
        IERC20(Currency.unwrap(key.currency0)).approve(
            address(positionManager), amount0Desired
        );
        IERC20(Currency.unwrap(key.currency1)).approve(
            address(positionManager), amount1Desired
        );
        
        // Encode mint action
        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE),
            uint8(Actions.SETTLE)
        );
        
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            key,
            tickLower,
            tickUpper,
            amount0Desired, // liquidity or amount
            amount1Desired,
            msg.sender,     // recipient of NFT
            ""              // hookData
        );
        params[1] = abi.encode(key.currency0, amount0Desired, false);
        params[2] = abi.encode(key.currency1, amount1Desired, false);
        
        bytes memory unlockData = abi.encode(actions, params);
        
        // Execute via PositionManager
        (tokenId, liquidity) = abi.decode(
            positionManager.modifyLiquidities(unlockData, block.timestamp + 300),
            (uint256, uint128)
        );
    }
}
```

### Example 3: Private Swap with ZK Commitment

```solidity
contract PrivateSwapHook is BaseHook {
    IPoolManager public immutable poolManager;
    
    // Store commitments instead of user addresses
    mapping(bytes32 => mapping(address => uint256)) public commitmentDeposits;
    
    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {
        poolManager = _poolManager;
    }
    
    // User swaps with privacy commitment
    function swapPrivate(
        PoolKey calldata key,
        int256 amountIn,
        bytes32 commitment
    ) external {
        SwapParams memory params = SwapParams({
            zeroForOne: true,
            amountSpecified: amountIn,
            sqrtPriceLimitX96: 4295128740
        });
        
        // Encode commitment in hookData
        bytes memory hookData = abi.encode(msg.sender, commitment);
        bytes memory unlockData = abi.encode(key, params, hookData);
        
        poolManager.unlock(unlockData);
    }
    
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (PoolKey memory key, SwapParams memory params, bytes memory hookData) = 
            abi.decode(data, (PoolKey, SwapParams, bytes));
        
        // Execute swap
        BalanceDelta delta = poolManager.swap(key, params, hookData);
        
        // Settle input
        // ... (same as previous examples)
        
        // Store output by commitment (not user address)
        (address user, bytes32 commitment) = abi.decode(hookData, (address, bytes32));
        Currency outputCurrency = params.zeroForOne ? key.currency1 : key.currency0;
        int128 outputDelta = params.zeroForOne ? delta.amount1() : delta.amount0();
        
        if (outputDelta > 0) {
            poolManager.take(outputCurrency, address(this), uint256(outputDelta));
            
            // Store by commitment, not user
            commitmentDeposits[commitment][Currency.unwrap(outputCurrency)] = 
                uint256(outputDelta);
        }
        
        return abi.encode(delta);
    }
    
    // Later: Withdraw with ZK proof
    function withdrawWithProof(
        bytes32 commitment,
        address token,
        bytes calldata zkProof
    ) external {
        // Verify ZK proof
        require(verifyProof(zkProof), "Invalid proof");
        
        uint256 amount = commitmentDeposits[commitment][token];
        require(amount > 0, "No balance");
        
        commitmentDeposits[commitment][token] = 0;
        IERC20(token).transfer(msg.sender, amount);
    }
}
```

---

## Quick Reference Cheatsheet

```solidity
// === SWAP ===
BalanceDelta delta = poolManager.swap(key, params, hookData);

// === ADD LIQUIDITY ===
ModifyLiquidityParams memory params = ModifyLiquidityParams({
    liquidityDelta: +1000000  // Positive = add
});
(BalanceDelta delta,) = poolManager.modifyLiquidity(key, params, "");

// === REMOVE LIQUIDITY ===
ModifyLiquidityParams memory params = ModifyLiquidityParams({
    liquidityDelta: -1000000  // Negative = remove
});
(BalanceDelta delta,) = poolManager.modifyLiquidity(key, params, "");

// === PAY DEBT (negative delta) ===
poolManager.sync(currency);
IERC20(token).transfer(address(poolManager), amount);
poolManager.settle();

// === RECEIVE TOKENS (positive delta) ===
poolManager.take(currency, recipient, amount);

// === WRAP IN UNLOCK ===
bytes memory result = poolManager.unlock(data);

function unlockCallback(bytes calldata data) external returns (bytes memory) {
    // All operations here
    return abi.encode(result);
}
```

---

## Common Patterns

### Pattern 1: Simple Token Swap
```solidity
unlock → swap → settle input → take output
```

### Pattern 2: Add Liquidity
```solidity
unlock → modifyLiquidity(+) → settle token0 → settle token1
```

### Pattern 3: Remove Liquidity
```solidity
unlock → modifyLiquidity(-) → take token0 → take token1
```

### Pattern 4: Vault Swap
```solidity
unlock → swap → take output to vault → store balance
```

---

## Tips & Best Practices

1. **Always use `unlock()`** - All pool interactions must be wrapped in unlock
2. **Check delta signs** - Negative = you owe, Positive = you receive
3. **Settle all debts** - Transaction reverts if debts remain at end of unlock
4. **Use `sync()` before transfers** - PoolManager needs to know its balance before you send tokens
5. **Gas optimization** - Use `mint()`/`burn()` for claims instead of immediate `take()`
6. **Security** - Validate `msg.sender == poolManager` in `unlockCallback`

---

## Resources

- [Uniswap v4 Core](https://github.com/Uniswap/v4-core)
- [Uniswap v4 Periphery](https://github.com/Uniswap/v4-periphery)
- [Hook Examples](https://github.com/Uniswap/v4-template)
