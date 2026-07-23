export const HOOK_ABI = [
  // View Functions
  "function getTWAPTick(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint32 secondsAgo) view returns (int24)",
  "function isTWAPConditionMet(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, int24 triggerTick, bool isBuyOrder, uint32 twapPeriod) view returns (bool)",
  "function getExecutableOrders(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key) view returns (bytes32[])",
  "function isOrderExecutable(bytes32 orderHash, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key) view returns (bool)",
  "function getUserOrders(address user) view returns (bytes32[])",
  "function getOrder(bytes32 orderHash) view returns (tuple(address owner, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, int24 triggerTick, bool isBuyOrder, uint32 twapPeriod, bool isActive, uint256 createdAt))",
  "function getActiveOrderCount() view returns (uint256)",
  
  // State Changing Functions
  "function createLimitOrder(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, int24 triggerTick, bool isBuyOrder, uint32 twapPeriod) returns (bytes32)",
  "function executeLimitOrder(bytes32 orderHash, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key) returns (uint256)",
  "function cancelLimitOrder(bytes32 orderHash)",
  
  // Events
  "event LimitOrderCreated(bytes32 indexed orderHash, address indexed owner, address tokenIn, address tokenOut, uint256 amountIn, int24 triggerTick, bool isBuyOrder, uint32 twapPeriod)",
  "event LimitOrderExecuted(bytes32 indexed orderHash, address indexed executor, uint256 amountOut, int24 executionTick)",
  "event LimitOrderCancelled(bytes32 indexed orderHash, address indexed owner, uint256 refundAmount)"
];
