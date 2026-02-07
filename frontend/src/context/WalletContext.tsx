import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ethers, BrowserProvider, Signer } from 'ethers';
import { WalletContextType } from '../types';

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }: WalletProviderProps) => {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'warning' | 'info' } | null>(null);

  const connectWallet = async (): Promise<void> => {
    if (!window.ethereum) {
      alert('Please install MetaMask!');
      return;
    }

    try {
      setIsConnecting(true);
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      setAccount(accounts[0]);
      setProvider(provider);
      setSigner(signer);
      setChainId(network.chainId.toString());
      
      showNotification('Wallet connected successfully!', 'success');
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = (): void => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    showNotification('Wallet disconnected', 'info');
  };

  const showNotification = (message: string, type: 'success' | 'warning' | 'info'): void => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          const newAccount = accounts[0];
          if (account && newAccount.toLowerCase() !== account.toLowerCase()) {
            // Update provider, signer, and chainId for new account
            try {
              const provider = new ethers.BrowserProvider(window.ethereum);
              const signer = await provider.getSigner();
              const network = await provider.getNetwork();
              
              setAccount(newAccount);
              setProvider(provider);
              setSigner(signer);
              setChainId(network.chainId.toString());
              
              showNotification(
                `Wallet switched from ${account.slice(0, 6)}...${account.slice(-4)} to ${newAccount.slice(0, 6)}...${newAccount.slice(-4)}`,
                'warning'
              );
            } catch (error) {
              console.error('Error updating wallet:', error);
            }
          } else if (!account) {
            // First time connection through accountsChanged event
            try {
              const provider = new ethers.BrowserProvider(window.ethereum);
              const signer = await provider.getSigner();
              const network = await provider.getNetwork();
              
              setAccount(newAccount);
              setProvider(provider);
              setSigner(signer);
              setChainId(network.chainId.toString());
            } catch (error) {
              console.error('Error setting up wallet:', error);
            }
          }
        }
      };

      const handleChainChanged = (_chainId: string) => {
        showNotification('Network changed. Reloading page...', 'info');
        setTimeout(() => window.location.reload(), 1000);
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeAllListeners('accountsChanged');
        window.ethereum.removeAllListeners('chainChanged');
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  return (
    <WalletContext.Provider
      value={{
        account,
        provider,
        signer,
        chainId,
        isConnecting,
        connectWallet,
        disconnectWallet,
      }}
    >
      {children}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg transform transition-all duration-300 ${
            notification.type === 'success'
              ? 'bg-green-600'
              : notification.type === 'warning'
              ? 'bg-yellow-600'
              : 'bg-blue-600'
          } text-white max-w-md`}
        >
          <div className="flex items-center space-x-3">
            {notification.type === 'success' && (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {notification.type === 'warning' && (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {notification.type === 'info' && (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <p className="text-sm font-medium">{notification.message}</p>
            <button
              onClick={() => setNotification(null)}
              className="ml-auto hover:bg-white hover:bg-opacity-20 rounded p-1 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </WalletContext.Provider>
  );
};
