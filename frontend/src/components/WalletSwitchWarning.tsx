import React from 'react';
import { useWallet } from '../context/WalletContext';
import { Alert, AlertDescription } from './ui/alert';
import { AlertCircle, Info } from 'lucide-react';

interface WalletSwitchWarningProps {
  requiredFor: 'withdraw' | 'remove-liquidity';
}

const WalletSwitchWarning: React.FC<WalletSwitchWarningProps> = ({ requiredFor }) => {
  const { account } = useWallet();

  if (!account) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <p className="font-semibold">Wallet Not Connected</p>
          <p className="text-sm mt-1">
            Please connect your wallet to {requiredFor === 'withdraw' ? 'withdraw funds' : 'remove liquidity'}.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="info" className="mb-4">
      <Info className="h-4 w-4" />
      <AlertDescription>
        <p className="font-semibold mb-1">Wallet Switching Enabled</p>
        <p className="text-sm mb-3">
          {requiredFor === 'withdraw' 
            ? 'You can switch to a different wallet in MetaMask to withdraw privately. The app will automatically detect the change.'
            : 'You can switch to a different wallet in MetaMask to remove liquidity privately. The app will automatically detect the change.'
          }
        </p>
        <div className="bg-muted/50 rounded p-3 mt-2">
          <p className="text-xs text-muted-foreground mb-1">Current wallet:</p>
          <p className="font-mono text-sm">{account}</p>
        </div>
        <div className="mt-3 text-xs">
          <p className="font-medium mb-1">💡 How to switch wallets:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2 text-muted-foreground">
            <li>Open MetaMask extension</li>
            <li>Click on the account icon at the top</li>
            <li>Select a different account</li>
            <li>The app will detect the change automatically</li>
          </ol>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default WalletSwitchWarning;
