# UnizwapHookSimple Tests

This directory contains comprehensive unit and integration tests for the UnizwapHookSimple contract.

## Test Files

### 1. `UnizwapHookSimple.t.sol`
Main unit tests covering:
- ✅ Constructor and initialization
- ✅ Hook permissions configuration
- ✅ beforeSwap hook behavior
- ✅ afterSwap hook behavior and event emissions
- ✅ beforeAddLiquidity hook behavior
- ✅ beforeRemoveLiquidity hook behavior
- ✅ Hook data storage
- ✅ Counter increments
- ✅ Multiple operations
- ✅ Edge cases (empty hookData, no liquidity, etc.)

### 2. `UnizwapHookSimple.integration.t.sol`
Integration and scenario tests covering:
- ✅ End-to-end user journeys
- ✅ Multiple users interacting simultaneously
- ✅ Gas optimization checks
- ✅ Security validations

## Running Tests

### Run all tests
```bash
forge test
```

### Run with verbosity
```bash
# Show test names
forge test -vv

# Show stack traces on failure
forge test -vvv

# Show all traces
forge test -vvvv
```

### Run specific test file
```bash
forge test --match-path test/UnizwapHookSimple.t.sol
```

### Run specific test function
```bash
forge test --match-test test_beforeSwap_incrementsCounter
```

### Run with gas reporting
```bash
forge test --gas-report
```

### Run with coverage
```bash
forge coverage
```

## Test Structure

Each test follows the AAA pattern:
- **Arrange**: Set up test conditions
- **Act**: Execute the function being tested
- **Assert**: Verify the expected outcome

## Test Helpers

Tests use Foundry's built-in utilities:
- `makeAddr()`: Creates labeled test addresses
- `hoax()`: Sets msg.sender and deals ETH
- `expectEmit()`: Expects specific events
- `expectRevert()`: Expects transaction revert

## Coverage Goals

Target coverage: **>95%**

Current coverage areas:
- ✅ All public/external functions
- ✅ All hook callbacks
- ✅ Event emissions
- ✅ State changes
- ✅ Error cases
- ✅ Edge cases

## Adding New Tests

When adding new functionality:

1. Add unit tests to `UnizwapHookSimple.t.sol`
2. Add integration tests to `UnizwapHookSimple.integration.t.sol`
3. Follow naming convention: `test_[functionName]_[scenario]`
4. Document complex test setups with comments
5. Group related tests with section headers

## Test Dependencies

Required contracts:
- `@uniswap/v4-core`: Core pool manager and types
- `@uniswap/v4-periphery`: Position manager and routers
- `forge-std`: Foundry testing utilities
- `solmate`: Mock ERC20 tokens

## CI/CD

Tests run automatically on:
- Pull requests
- Commits to main branch
- Release tags

## Debugging

If tests fail:

1. Check test output with `-vvvv` flag
2. Use `console.log()` for debugging
3. Run specific failing test in isolation
4. Check stack traces for revert reasons
5. Verify token approvals and balances

## Performance Benchmarks

Target gas costs:
- `beforeSwap`: ~5,000 gas
- `afterSwap`: ~15,000 gas
- `beforeAddLiquidity`: ~5,000 gas
- `beforeRemoveLiquidity`: ~5,000 gas

Run gas benchmarks:
```bash
forge test --gas-report --match-contract UnizwapHookSimple
```
