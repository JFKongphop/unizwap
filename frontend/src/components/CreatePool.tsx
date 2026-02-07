import React, { useState, FormEvent, ChangeEvent } from 'react';
import { useWallet } from '../context/WalletContext';
import { Contract } from 'ethers';
import { CONTRACTS } from '../config/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Droplet, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

interface FormData {
  token0: string;
  token1: string;
  fee: string;
}

const CreatePool: React.FC = () => {
  const { account, signer } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    token0: '',
    token1: '',
    fee: '3000',
  });

  // Fixed 1:1 initial price
  const SQRT_PRICE_1_1 = '79228162514264337593543950336';

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const { name, value } = e.target;
    // Trim whitespace and remove any invisible characters
    const cleanValue = value.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
    setFormData({ ...formData, [name]: cleanValue });
  };

  const handleCreatePool = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!account || !signer) {
      alert('Please connect your wallet first');
      return;
    }

    console.log('=== Creating Pool ===');
    console.log('Wallet:', account);
    console.log('Token0:', formData.token0);
    console.log('Token1:', formData.token1);
    console.log('Fee:', formData.fee);
    console.log('Tick Spacing: 60');

    try {
      setLoading(true);
      
      // Validate and clean addresses
      const token0 = formData.token0.trim();
      const token1 = formData.token1.trim();
      
      if (!token0.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new Error('Invalid Token 0 address format');
      }
      if (!token1.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new Error('Invalid Token 1 address format');
      }
      
      // Use Position Manager to initialize pool
      const positionManagerABI = [
        'function initializePool(tuple(address,address,uint24,int24,address) poolKey, uint160 sqrtPriceX96) external',
      ];

      const positionManager = new Contract(CONTRACTS.POSITION_MANAGER, positionManagerABI, signer);

      // PoolKey as array [currency0, currency1, fee, tickSpacing, hooks]
      const poolKey = [
        token0,
        token1,
        parseInt(formData.fee),
        60,
        CONTRACTS.UNIZWAP_HOOK
      ];

      console.log('\n🔑 PoolKey Details:');
      console.log('Token0:', poolKey[0]);
      console.log('Token1:', poolKey[1]);
      console.log('Fee:', poolKey[2]);
      console.log('Tick Spacing:', poolKey[3]);
      console.log('Hook:', poolKey[4]);
      console.log('Initial Sqrt Price:', SQRT_PRICE_1_1);

      const tx = await positionManager.initializePool(
        poolKey,
        SQRT_PRICE_1_1
      );

      console.log('\nInitializing pool...');
      const receipt = await tx.wait();
      
      // Check if transaction reverted
      if (receipt.status === 0) {
        throw new Error('Transaction reverted on-chain. Pool may already exist or hook has issues.');
      }
      
      console.log('✅ Pool created successfully!');
      console.log('Transaction hash:', receipt.hash);
      console.log('Block:', receipt.blockNumber);
      
      setTxHash(receipt.hash);
      alert('Pool created successfully!');
      
      // Reset form
      setFormData({
        token0: '',
        token1: '',
        fee: '3000',
      });
    } catch (error) {
      console.error('Error creating pool:', error);
      alert(`Failed to create pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-purple-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplet className="h-6 w-6 text-purple-400" />
          Create New Pool
        </CardTitle>
        <CardDescription>
          Initialize a new liquidity pool with 1:1 price ratio
        </CardDescription>
      </CardHeader>
      <CardContent>
        {txHash && (
          <Alert className="mb-6 border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription className="ml-2">
              <div className="flex flex-col gap-1">
                <span className="font-medium">Transaction Successful!</span>
                <a 
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-purple-400 hover:text-purple-300 underline break-all"
                >
                  {txHash}
                </a>
              </div>
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleCreatePool} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="token0">Token 0 Address</Label>
            <Input
              id="token0"
              name="token0"
              value={formData.token0}
              onChange={handleChange}
              placeholder="0x..."
              required
              className="font-mono text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFormData({...formData, token0: CONTRACTS.TOKEN_A})}
              className="w-full mt-1"
            >
              Use TOKEN_A
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="token1">Token 1 Address</Label>
            <Input
              id="token1"
              name="token1"
              value={formData.token1}
              onChange={handleChange}
              placeholder="0x..."
              required
              className="font-mono text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFormData({...formData, token1: CONTRACTS.TOKEN_B})}
              className="w-full mt-1"
            >
              Use TOKEN_B
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fee">Fee Tier</Label>
            <select
              id="fee"
              name="fee"
              value={formData.fee}
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="500">0.05%</option>
              <option value="3000">0.3%</option>
              <option value="10000">1%</option>
            </select>
          </div>

          <Alert variant="info" className="border-purple-500/30">
            <AlertDescription>
              <span className="font-medium">Initial Price:</span> <span className="font-mono text-purple-400">1:1 (Fixed)</span>
              <p className="text-xs mt-1 text-muted-foreground">Pool will be initialized at equal token ratio</p>
            </AlertDescription>
          </Alert>

          {!account && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please connect your wallet to create a pool
              </AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={!account || loading}
            variant="gradient"
            size="lg"
            className="w-full"
          >
            {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {!loading && <CheckCircle2 className="mr-2 h-4 w-4" />}
            {loading ? 'Creating Pool...' : !account ? 'Connect Wallet First' : 'Create Pool'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CreatePool;
