// Contract addresses for Sepolia testnet
export const CONTRACTS = {
  // Uniswap V4 Core Contracts
  POOL_MANAGER: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
  POSITION_MANAGER: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4',
  UNIVERSAL_ROUTER: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b',
  STATE_VIEW: '0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c',
  QUOTER: '0x61b3f2011a92d183c7dbadbda940a7555ccf9227',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  
  // Test Contracts
  POOL_SWAP_TEST: '0x9b6b46e2c869aa39918db7f52f5557fe577b6eee',
  POOL_MODIFY_LIQUIDITY_TEST: '0x0c478023803a644c94c4ce1c1e7b9a087e411b0a',
  
  // Custom Hooks
  // UNIZWAP_HOOK: '0x1Ae05B6b38Fc385A27F92677089034ad120B4ac4', // OLD - use this for withdrawing old swaps
  // UNIZWAP_HOOK: '0x05a587Fa10E38BEB1CA4c7cDD37E9222cf310aC4', // Has token 23148 but no matching pool
  UNIZWAP_HOOK: '0x33a0529F481140FDc2D14A47d2cE8F2B9d1e4aC4', // Has pool created with tx 0xe7dcc996...

  // Test Tokens
  TOKEN_A: '0xa018A255881e0525831Df7bCDf9A03D1B06E1790',
  TOKEN_B: '0xF335a9B58f2AA6A2f884d2dA4E308F7378A4CF7e',
} as const;

// Network configuration
export const SEPOLIA_CHAIN_ID = '11155111';
export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';

export const NETWORK_CONFIG = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: 'Sepolia Testnet',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://sepolia.infura.io/v3/'],
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
} as const;
