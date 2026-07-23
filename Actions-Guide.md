# Uniswap v4 Actions Guide

A comprehensive guide to understanding and using **Actions** in Uniswap v4's PositionManager.

---

## Table of Contents

- [What Are Actions?](#what-are-actions)
- [Why Actions Exist](#why-actions-exist)
- [All Available Actions](#all-available-actions)
- [Action Reference](#action-reference)
- [Common Patterns](#common-patterns)
- [Complete Examples](#complete-examples)
- [Best Practices](#best-practices)

---

## What Are Actions?

**Actions** are operation codes (opcodes) used by Uniswap v4's **PositionManager** to batch multiple liquidity operations atomically. Think of them as instructions in a script that execute in sequence.

```solidity
// Actions enum from @uniswap/v4-periphery/src/libraries/Actions.sol
enum Actions {
    MINT_POSITION,           // 0
    INCREASE_LIQUIDITY,      // 1
    DECREASE_LIQUIDITY,      // 2
    BURN_POSITION,           // 3
    SETTLE,                  // 4
    TAKE,                    // 5
    CLOSE_CURRENCY,          // 6
    CLEAR_OR_TAKE,           // 7
    SWEEP                    // 8
}
```

---

## Why Actions Exist

### **Gas Efficiency**
Batch multiple operations in one transaction:
```solidity
// Instead of 3 separate transactions:
// 1. decreaseLiquidity()
// 2. withdrawToken0()
// 3. withdrawToken1()

// Do it all in one:
DECREASE_LIQUIDITY → TAKE → TAKE
```

### **Atomicity**
All operations succeed or all fail together:
```solidity
// If any action fails, entire transaction reverts
MINT_POSITION → SETTLE → SETTLE
// Either you get the position AND pay tokens, or nothing happens
```

### **Flexibility**
Combine operations in creative ways:
```solidity
// Rebalance liquidity in one transaction
DECREASE_LIQUIDITY (old range) → MINT_POSITION (new range) → CLOSE_CURRENCY
```

---

## All Available Actions

### Action Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│                  LIQUIDITY ACTIONS                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  CREATE         ADD MORE        REMOVE      DESTROY │
│    ↓               ↓               ↓          ↓     │
│  MINT         INCREASE        DECREASE      BURN    │
│  (0)             (1)            (2)         (3)     │
│    │               │               │          │     │
│    └───────┬───────┴───────┬───────┘          │     │
│            │               │                  │     │
│       You Owe          You Receive        (No NFT)  │
│            │               │                        │
│            ↓               ↓                        │
│         SETTLE           TAKE                       │
│          (4)             (5)                        │
│            │               │                        │
│            └───────┬───────┘                        │
│                    │                                │
│            ┌───────┴────────┐                       │
│            │                │                       │
│      CLOSE_CURRENCY   CLEAR_OR_TAKE   SWEEP        │
│           (6)              (7)         (8)          │
│      (Optimize)       (Flexible)   (Clean Up)      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Action Reference

### 0️⃣ **MINT_POSITION** - Create New Liquidity Position

**What it does:**
- Creates a new ERC721 NFT representing a liquidity position
- Adds initial liquidity to a specific price range
- Returns `tokenId` of the new NFT

**Parameters:**
```solidity
abi.encode(
    PoolKey memory poolKey,      // Pool to add liquidity to
    int24 tickLower,             // Lower tick of range
    int24 tickUpper,             // Upper tick of range
    uint256 liquidity,           // Amount of liquidity
    uint128 amount0Max,          // Max token0 to spend
    uint128 amount1Max,          // Max token1 to spend
    address recipient,           // Who receives the NFT
    bytes hookData               // Data passed to hooks
)
```

**Example:**
```solidity
bytes memory actions = abi.encodePacked(
    uint8(Actions.MINT_POSITION),
    uint8(Actions.SETTLE),        // Pay token0
    uint8(Actions.SETTLE)         // Pay token1
);

bytes[] memory params = new bytes[](3);
params[0] = abi.encode(
    poolKey,
    -60,                          // tickLower
    60,                           // tickUpper
    1000000,                      // liquidity
    type(uint128).max,            // amount0Max
    type(uint128).max,            // amount1Max
    msg.sender,                   // recipient gets NFT
    ""                            // hookData
);
params[1] = abi.encode(currency0, amount0Owed, false);
params[2] = abi.encode(currency1, amount1Owed, false);
```

**Result:**
- ✅ New NFT minted to recipient
- 💸 You owe token0 and token1 (negative deltas)

---

### 1️⃣ **INCREASE_LIQUIDITY** - Add Liquidity to Existing Position

**What it does:**
- Adds more liquidity to an **existing** NFT position
- Same price range as the original position
- You must own the NFT

**Parameters:**
```solidity
abi.encode(
    uint256 tokenId,             // Existing NFT token ID
    uint256 liquidity,           // Amount to add
    uint128 amount0Max,          // Max token0 to spend
    uint128 amount1Max,          // Max token1 to spend
    bytes hookData               // Data passed to hooks
)
```

**Example:**
```solidity
bytes memory actions = abi.encodePacked(
    uint8(Actions.INCREASE_LIQUIDITY),
    uint8(Actions.SETTLE),
    uint8(Actions.SETTLE)
);

bytes[] memory params = new bytes[](3);
params[0] = abi.encode(
    tokenId,                     // Existing position
    500000,                      // Add 500k liquidity
    type(uint128).max,
    type(uint128).max,
    ""
);
params[1] = abi.encode(currency0, amount0Owed, false);
params[2] = abi.encode(currency1, amount1Owed, false);
```

**Result:**
- ✅ Liquidity added to existing NFT
- 💸 You owe more token0 and token1

---

### 2️⃣ **DECREASE_LIQUIDITY** - Remove Liquidity from Position

**What it does:**
- Removes liquidity from an existing NFT position
- NFT still exists (unless you remove 100%)
- Returns tokens to you

**Parameters:**
```solidity
abi.encode(
    uint256 tokenId,             // NFT to remove from
    uint256 liquidity,           // Amount to remove
    uint128 amount0Min,          // Min token0 to receive (slippage)
    uint128 amount1Min,          // Min token1 to receive (slippage)
    bytes hookData               // Data passed to hooks
)
```

**Example:**
```solidity
bytes memory actions = abi.encodePacked(
    uint8(Actions.DECREASE_LIQUIDITY),
    uint8(Actions.TAKE),         // Receive token0
    uint8(Actions.TAKE)          // Receive token1
);

bytes[] memory params = new bytes[](3);
params[0] = abi.encode(
    tokenId,
    500000,                      // Remove 500k liquidity
    0,                           // amount0Min (slippage protection)
    0,                           // amount1Min
    ""
);
params[1] = abi.encode(currency0, msg.sender, uint256(0)); // Take all
params[2] = abi.encode(currency1, msg.sender, uint256(0)); // Take all
```

**Result:**
- ✅ Liquidity removed from NFT
- 💰 You receive token0 and token1 (positive deltas)

---

### 3️⃣ **BURN_POSITION** - Destroy Empty NFT

**What it does:**
- Burns (permanently destroys) the position NFT
- Position **must have ZERO liquidity**
- Cannot be undone

**Parameters:**
```solidity
abi.encode(
    uint256 tokenId,             // NFT to burn
    bytes hookData               // Data passed to hooks
)
```

**Example:**
```solidity
bytes memory actions = abi.encodePacked(
    uint8(Actions.DECREASE_LIQUIDITY),  // Remove all liquidity first
    uint8(Actions.BURN_POSITION),       // Then burn NFT
    uint8(Actions.TAKE),
    uint8(Actions.TAKE)
);

bytes[] memory params = new bytes[](4);
params[0] = abi.encode(tokenId, allLiquidity, 0, 0, "");
params[1] = abi.encode(tokenId, "");             // Burn the NFT
params[2] = abi.encode(currency0, recipient, 0);
params[3] = abi.encode(currency1, recipient, 0);
```

**Result:**
- ✅ NFT destroyed
- 💰 Tokens withdrawn

---

### 4️⃣ **SETTLE** - Pay Your Debt

**What it does:**
- Pays tokens you **owe** to PoolManager
- Used after operations that create negative deltas
- Same as calling `poolManager.settle()`

**Parameters:**
```solidity
abi.encode(
    Currency currency,           // Which token to settle
    uint256 amount,              // How much to pay
    bool payerIsUser             // Who pays?
)
```

**Payer Options:**
- `payerIsUser = false`: PositionManager uses your **approved** tokens (most common)
- `payerIsUser = true`: You already **transferred** tokens to PositionManager

**Example:**
```solidity
// After MINT_POSITION, you owe both tokens
params[1] = abi.encode(
    currency0,
    1000e18,                     // Pay 1000 token0
    false                        // PositionManager pulls from user's wallet
);
```

---

### 5️⃣ **TAKE** - Withdraw Tokens

**What it does:**
- Withdraws tokens **owed to you** by PoolManager
- Used after operations that create positive deltas
- Same as calling `poolManager.take()`

**Parameters:**
```solidity
abi.encode(
    Currency currency,           // Which token to withdraw
    address recipient,           // Where to send tokens
    uint256 amount               // How much (0 = take all)
)
```

**Amount Options:**
- `amount = 0`: Take **all available** balance (recommended)
- `amount = X`: Take exactly **X** tokens

**Example:**
```solidity
// After DECREASE_LIQUIDITY, you receive tokens
params[1] = abi.encode(
    currency0,
    msg.sender,                  // Send to caller
    uint256(0)                   // Take all available
);
```

---

### 6️⃣ **CLOSE_CURRENCY** - Net Out Balance

**What it does:**
- Calculates net balance for a currency across all previous actions
- If **negative**: automatically settles the debt
- If **positive**: automatically takes the tokens
- Gas optimization for complex operations

**Parameters:**
```solidity
abi.encode(
    Currency currency            // Which token to close
)
```

**Example:**
```solidity
// Rebalance: remove from one range, add to another
bytes memory actions = abi.encodePacked(
    uint8(Actions.DECREASE_LIQUIDITY),  // +100 token0, +50 token1
    uint8(Actions.MINT_POSITION),       // -80 token0, -40 token1
    uint8(Actions.CLOSE_CURRENCY),      // Net: +20 token0 → TAKE
    uint8(Actions.CLOSE_CURRENCY)       // Net: +10 token1 → TAKE
);

params[2] = abi.encode(currency0);  // Auto-takes 20 token0
params[3] = abi.encode(currency1);  // Auto-takes 10 token1
```

**When to use:**
- Multiple operations on same currency
- Rebalancing positions
- Gas optimization

---

### 7️⃣ **CLEAR_OR_TAKE** - Flexible Settlement

**What it does:**
- Similar to `CLOSE_CURRENCY` but more flexible
- If balance ≤ 0: clears/settles the debt
- If balance > 0: takes up to `amountMax`

**Parameters:**
```solidity
abi.encode(
    Currency currency,           // Which token
    uint256 amountMax            // Max to take if positive
)
```

**Example:**
```solidity
params[X] = abi.encode(
    currency0,
    1000e18                      // Take up to 1000 if positive
);
```

**When to use:**
- Uncertain if operation will result in debt or credit
- Want to cap maximum withdrawal

---

### 8️⃣ **SWEEP** - Collect Leftover Tokens

**What it does:**
- Sweeps any **leftover tokens** in PositionManager
- Sends excess/dust to recipient
- Clean up operation

**Parameters:**
```solidity
abi.encode(
    Currency currency,           // Which token to sweep
    address recipient            // Where to send dust
)
```

**Example:**
```solidity
bytes memory actions = abi.encodePacked(
    uint8(Actions.DECREASE_LIQUIDITY),
    uint8(Actions.TAKE),
    uint8(Actions.TAKE),
    uint8(Actions.SWEEP)         // Clean up any dust
);

params[3] = abi.encode(currency0, msg.sender);
```

**When to use:**
- End of complex operations
- Collect rounding dust
- Ensure no tokens stuck in PositionManager

---

## Common Patterns

### Pattern 1: Create New Position

**Goal:** Mint NFT and add liquidity

```solidity
// Actions: MINT → SETTLE → SETTLE
bytes memory actions = abi.encodePacked(
    uint8(0),  // MINT_POSITION
    uint8(4),  // SETTLE token0
    uint8(4)   // SETTLE token1
);

bytes[] memory params = new bytes[](3);
params[0] = abi.encode(poolKey, tickLower, tickUpper, liquidity, max0, max1, owner, hookData);
params[1] = abi.encode(currency0, amount0, false);
params[2] = abi.encode(currency1, amount1, false);
```

**Flow:**
1. Create NFT + add liquidity → owe tokens
2. Pay token0 debt
3. Pay token1 debt

---

### Pattern 2: Add to Existing Position

**Goal:** Increase liquidity in existing NFT

```solidity
// Actions: INCREASE → SETTLE → SETTLE
bytes memory actions = abi.encodePacked(
    uint8(1),  // INCREASE_LIQUIDITY
    uint8(4),  // SETTLE token0
    uint8(4)   // SETTLE token1
);

bytes[] memory params = new bytes[](3);
params[0] = abi.encode(tokenId, liquidity, max0, max1, hookData);
params[1] = abi.encode(currency0, amount0, false);
params[2] = abi.encode(currency1, amount1, false);
```

---

### Pattern 3: Remove Liquidity

**Goal:** Withdraw tokens from position

```solidity
// Actions: DECREASE → TAKE → TAKE
bytes memory actions = abi.encodePacked(
    uint8(2),  // DECREASE_LIQUIDITY
    uint8(5),  // TAKE token0
    uint8(5)   // TAKE token1
);

bytes[] memory params = new bytes[](3);
params[0] = abi.encode(tokenId, liquidity, min0, min1, hookData);
params[1] = abi.encode(currency0, recipient, uint256(0));
params[2] = abi.encode(currency1, recipient, uint256(0));
```

**This is used in your code!**

---

### Pattern 4: Full Exit and Burn

**Goal:** Remove all liquidity and destroy NFT

```solidity
// Actions: DECREASE → BURN → TAKE → TAKE
bytes memory actions = abi.encodePacked(
    uint8(2),  // DECREASE_LIQUIDITY (all)
    uint8(3),  // BURN_POSITION
    uint8(5),  // TAKE token0
    uint8(5)   // TAKE token1
);

bytes[] memory params = new bytes[](4);
params[0] = abi.encode(tokenId, allLiquidity, 0, 0, "");
params[1] = abi.encode(tokenId, "");
params[2] = abi.encode(currency0, recipient, 0);
params[3] = abi.encode(currency1, recipient, 0);
```

---

### Pattern 5: Rebalance Position

**Goal:** Move liquidity from one range to another

```solidity
// Actions: DECREASE → MINT → CLOSE → CLOSE
bytes memory actions = abi.encodePacked(
    uint8(2),  // DECREASE_LIQUIDITY (old range)
    uint8(0),  // MINT_POSITION (new range)
    uint8(6),  // CLOSE_CURRENCY token0 (net out)
    uint8(6)   // CLOSE_CURRENCY token1 (net out)
);

// CLOSE will automatically:
// - Take excess if you received more than you need
// - Settle debt if you need more than you received
```

---

## Complete Examples

### Example 1: Create Liquidity Position with Privacy (Your Project)

```solidity
function addLiquidityWithCommitment(
    PoolKey calldata key,
    int24 tickLower,
    int24 tickUpper,
    uint256 amount0,
    uint256 amount1,
    bytes32 commitment
) external returns (uint256 tokenId) {
    // Encode commitment in hookData
    bytes memory hookData = abi.encode(commitment);
    
    // Actions: Mint + Settle + Settle
    bytes memory actions = abi.encodePacked(
        uint8(Actions.MINT_POSITION),
        uint8(Actions.SETTLE),
        uint8(Actions.SETTLE)
    );
    
    // Parameters
    bytes[] memory params = new bytes[](3);
    params[0] = abi.encode(
        key,
        tickLower,
        tickUpper,
        calculateLiquidity(amount0, amount1),
        uint128(amount0),
        uint128(amount1),
        address(this),           // Hook owns NFT for privacy
        hookData                 // Commitment for privacy
    );
    params[1] = abi.encode(key.currency0, amount0, false);
    params[2] = abi.encode(key.currency1, amount1, false);
    
    // Execute
    bytes memory result = positionManager.modifyLiquidities(
        abi.encode(actions, params),
        block.timestamp + 300
    );
    
    (tokenId,) = abi.decode(result, (uint256, uint128));
}
```

---

### Example 2: Remove Liquidity with ZK Proof (Your Project)

From your [UnizwapHook.sol](contract/src/UnizwapHook.sol#L595-L647):

```solidity
function removeLiquidityWithProof(
    PoolKey calldata key,
    uint256 tokenId,
    uint128 liquidity,
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[6] calldata _pubSignals
) external {
    // Extract proof data
    bytes32 merkleRoot = bytes32(_pubSignals[0]);
    bytes32 nullifier = bytes32(_pubSignals[1]);
    address tokenAAddress = address(uint160(_pubSignals[2]));
    address tokenBAddress = address(uint160(_pubSignals[3]));
    
    // Encode ZK proof in hookData
    bytes memory hookData = abi.encode(
        tokenId,
        nullifier,
        merkleRoot,
        tokenAAddress,
        tokenBAddress,
        uint256(liquidity),
        _pA, _pB, _pC
    );
    
    // Actions: Decrease + Take + Take
    bytes memory actions = abi.encodePacked(
        uint8(Actions.DECREASE_LIQUIDITY),
        uint8(Actions.TAKE),
        uint8(Actions.TAKE)
    );
    
    // Parameters
    bytes[] memory params = new bytes[](3);
    params[0] = abi.encode(tokenId, liquidity, 0, 0, hookData);
    params[1] = abi.encode(key.currency0, msg.sender, uint256(0)); // Take all
    params[2] = abi.encode(key.currency1, msg.sender, uint256(0)); // Take all
    
    // Execute - Hook owns NFT but tokens go to msg.sender (prover)
    positionManager.modifyLiquidities(
        abi.encode(actions, params),
        block.timestamp + 3600
    );
}
```

**Why this works:**
- Hook contract owns the NFT (for privacy)
- Anyone with valid ZK proof can trigger withdrawal
- Tokens go to `msg.sender` (the prover)
- `beforeRemoveLiquidity` hook verifies the proof

---

### Example 3: Collect Fees (No Liquidity Removal)

```solidity
function collectFees(uint256 tokenId, address recipient) external {
    // Actions: Decrease 0 liquidity (collects fees) + Take + Take
    bytes memory actions = abi.encodePacked(
        uint8(Actions.DECREASE_LIQUIDITY),
        uint8(Actions.TAKE),
        uint8(Actions.TAKE)
    );
    
    bytes[] memory params = new bytes[](3);
    params[0] = abi.encode(
        tokenId,
        0,                       // 0 liquidity = just collect fees
        0,
        0,
        ""
    );
    params[1] = abi.encode(currency0, recipient, 0);
    params[2] = abi.encode(currency1, recipient, 0);
    
    positionManager.modifyLiquidities(
        abi.encode(actions, params),
        block.timestamp + 300
    );
}
```

---

### Example 4: Multi-Position Rebalance

```solidity
function rebalanceTwoPositions(
    uint256 tokenId1,
    uint256 tokenId2,
    uint128 amount1,
    uint128 amount2
) external {
    // Actions: Decrease from both, net out balances
    bytes memory actions = abi.encodePacked(
        uint8(Actions.DECREASE_LIQUIDITY),  // Position 1
        uint8(Actions.DECREASE_LIQUIDITY),  // Position 2
        uint8(Actions.CLOSE_CURRENCY),      // Net token0
        uint8(Actions.CLOSE_CURRENCY)       // Net token1
    );
    
    bytes[] memory params = new bytes[](4);
    params[0] = abi.encode(tokenId1, amount1, 0, 0, "");
    params[1] = abi.encode(tokenId2, amount2, 0, 0, "");
    params[2] = abi.encode(currency0);  // Auto-settle or take
    params[3] = abi.encode(currency1);  // Auto-settle or take
    
    positionManager.modifyLiquidities(
        abi.encode(actions, params),
        block.timestamp + 300
    );
}
```

---

## Best Practices

### ✅ DO

1. **Match actions and params arrays**
   ```solidity
   // 3 actions = 3 params
   bytes memory actions = abi.encodePacked(uint8(0), uint8(4), uint8(4));
   bytes[] memory params = new bytes[](3);
   ```

2. **Use `uint256(0)` for TAKE to get all tokens**
   ```solidity
   params[1] = abi.encode(currency0, recipient, uint256(0)); // Take all
   ```

3. **Set reasonable slippage protection**
   ```solidity
   params[0] = abi.encode(tokenId, liquidity, amount0Min, amount1Min, "");
   ```

4. **Use CLOSE_CURRENCY for complex operations**
   ```solidity
   // Instead of calculating exact amounts
   uint8(Actions.CLOSE_CURRENCY)  // Auto-handles net balance
   ```

5. **Add deadline protection**
   ```solidity
   positionManager.modifyLiquidities(data, block.timestamp + 300); // 5 min
   ```

---

### ❌ DON'T

1. **Don't mismatch actions and params**
   ```solidity
   // ❌ Wrong: 3 actions, 2 params
   bytes memory actions = abi.encodePacked(uint8(0), uint8(4), uint8(4));
   bytes[] memory params = new bytes[](2); // Missing one!
   ```

2. **Don't forget to settle debts**
   ```solidity
   // ❌ Wrong: MINT without SETTLE
   abi.encodePacked(uint8(Actions.MINT_POSITION)); // Transaction will revert!
   
   // ✅ Correct
   abi.encodePacked(
       uint8(Actions.MINT_POSITION),
       uint8(Actions.SETTLE),
       uint8(Actions.SETTLE)
   );
   ```

3. **Don't burn position with liquidity**
   ```solidity
   // ❌ Wrong: BURN before removing liquidity
   abi.encodePacked(uint8(Actions.BURN_POSITION)); // Reverts if liquidity > 0
   
   // ✅ Correct
   abi.encodePacked(
       uint8(Actions.DECREASE_LIQUIDITY),
       uint8(Actions.BURN_POSITION)
   );
   ```

4. **Don't use wrong parameter encoding**
   ```solidity
   // ❌ Wrong parameter order/types
   params[0] = abi.encode(liquidity, tokenId, ...); // Wrong order!
   
   // ✅ Correct
   params[0] = abi.encode(tokenId, liquidity, ...);
   ```

---

## Quick Reference Table

| Action | You Owe? | You Receive? | NFT Changes? | Typical Follow-up |
|--------|----------|--------------|--------------|-------------------|
| MINT_POSITION | ✅ Both tokens | ❌ | Creates NFT | SETTLE, SETTLE |
| INCREASE_LIQUIDITY | ✅ Both tokens | ❌ | Updates NFT | SETTLE, SETTLE |
| DECREASE_LIQUIDITY | ❌ | ✅ Both tokens | Updates NFT | TAKE, TAKE |
| BURN_POSITION | ❌ | ❌ | Destroys NFT | (Must be empty) |
| SETTLE | Pays debt | ❌ | - | - |
| TAKE | ❌ | Withdraws | - | - |
| CLOSE_CURRENCY | Auto | Auto | - | - |
| CLEAR_OR_TAKE | Auto | Auto | - | - |
| SWEEP | ❌ | Dust | - | - |

---

## Action Sequence Examples

### Beginner: Simple Operations

```solidity
// Create position
MINT → SETTLE → SETTLE

// Remove position
DECREASE → TAKE → TAKE

// Add more
INCREASE → SETTLE → SETTLE
```

### Intermediate: With Cleanup

```solidity
// Full exit with burn
DECREASE → BURN → TAKE → TAKE

// Remove with sweep
DECREASE → TAKE → TAKE → SWEEP
```

### Advanced: Complex Rebalancing

```solidity
// Rebalance two ranges
DECREASE → MINT → CLOSE → CLOSE

// Multi-position operation
DECREASE → DECREASE → INCREASE → CLOSE → CLOSE

// Collect fees + partial withdrawal
DECREASE(0) → DECREASE(X) → TAKE → TAKE
```

---

## Testing Actions

### Test Template

```solidity
function testActions() public {
    // 1. Setup
    approveTokens();
    
    // 2. Encode actions
    bytes memory actions = abi.encodePacked(
        uint8(Actions.MINT_POSITION),
        uint8(Actions.SETTLE),
        uint8(Actions.SETTLE)
    );
    
    // 3. Encode params
    bytes[] memory params = new bytes[](3);
    params[0] = abi.encode(...);
    params[1] = abi.encode(...);
    params[2] = abi.encode(...);
    
    // 4. Execute
    bytes memory result = positionManager.modifyLiquidities(
        abi.encode(actions, params),
        block.timestamp + 300
    );
    
    // 5. Verify
    (uint256 tokenId, uint128 liquidity) = abi.decode(result, (uint256, uint128));
    assertGt(tokenId, 0);
    assertGt(liquidity, 0);
}
```

---

## Resources

- [Uniswap v4 Periphery](https://github.com/Uniswap/v4-periphery)
- [Actions.sol Source](https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/Actions.sol)
- [PositionManager.sol](https://github.com/Uniswap/v4-periphery/blob/main/src/PositionManager.sol)
- [Your UnizwapHook Implementation](contract/src/UnizwapHook.sol)

---

## Summary

**Actions** enable efficient, atomic, and flexible liquidity management in Uniswap v4:

- 🔢 **9 actions** covering all liquidity operations
- ⚡ **Gas efficient** through batching
- 🔐 **Atomic** - all or nothing execution
- 🎯 **Flexible** - combine in creative ways
- 🛡️ **Safe** - type-safe parameter encoding

Master these actions to build powerful liquidity management systems like your **Unizwap private liquidity protocol**!
