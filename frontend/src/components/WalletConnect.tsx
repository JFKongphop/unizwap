import React from 'react';
import { useWallet } from '../context/WalletContext';

const WalletConnect: React.FC = () => {
  const { account, isConnecting, connectWallet, disconnectWallet } = useWallet();

  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div>
      {!account ? (
        <button
          onClick={connectWallet}
          disabled={isConnecting}
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ) : (
        <div className="flex items-center space-x-4">
          <div className="bg-gray-700 px-4 py-2 rounded-lg">
            <p className="text-sm text-gray-400">Connected</p>
            <p className="font-mono text-sm">{formatAddress(account)}</p>
          </div>
          <button
            onClick={disconnectWallet}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};

export default WalletConnect;
