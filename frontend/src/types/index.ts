import { BrowserProvider, Signer } from 'ethers';

export interface WalletContextType {
  account: string | null;
  provider: BrowserProvider | null;
  signer: Signer | null;
  chainId: string | null;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

export interface PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

export interface ZKProof {
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
}

export interface ContractAddresses {
  poolManager: string;
  positionManager: string;
  swapRouter: string;
  unizwapHook: string;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
