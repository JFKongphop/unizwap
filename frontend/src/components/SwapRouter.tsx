import React, { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { ethers, Contract } from 'ethers';
import { poseidon2, poseidon3 } from 'poseidon-lite';
import { CONTRACTS } from '../config/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { ArrowRightLeft, AlertCircle, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';

interface FormData {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  zeroForOne: boolean;
  secret: string;
  nonce: string;
  commitment: string;
}

const SwapRouter: React.FC = () => {
  const { account, signer } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    tokenIn: '',
    tokenOut: '',
    amountIn: '',
    zeroForOne: true,
    secret: '',
    nonce: '',
    commitment: '',
  });

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData({ 
      ...formData, 
      [name]: type === 'checkbox' ? checked : value 
    });
  };

  const generateRandomPrivacyParams = (): void => {
    const randomSecret = Math.floor(10000 + Math.random() * 90000).toString();
    const randomNonce = Math.floor(10000 + Math.random() * 90000).toString();
    setFormData({ ...formData, secret: randomSecret, nonce: randomNonce });
  };

  // Auto-generate commitment when secret, nonce, or tokenOut changes
  useEffect(() => {
    if (formData.secret && formData.nonce && formData.tokenOut) {
      try {
        const secretBigInt = BigInt(formData.secret);
        const nonceBigInt = BigInt(formData.nonce);
        const tokenAddress = BigInt(formData.tokenOut);
        const depositAmount = BigInt(1000); // Symbolic amount

        // Calculate commitment: H(token_address, deposit_amount, H(secret, nonce))
        const secretHash = poseidon2([secretBigInt, nonceBigInt]);
        const commitment = poseidon3([tokenAddress, depositAmount, secretHash]);
        
        const commitmentHex = '0x' + commitment.toString(16).padStart(64, '0');
        setFormData(prev => ({ ...prev, commitment: commitmentHex }));
      } catch (error) {
        console.error('Error generating commitment:', error);
      }
    }
  }, [formData.secret, formData.nonce, formData.tokenOut]);

  const handleSwap = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!account || !signer) {
      alert('Please connect your wallet first');
      return;
    }

    console.log('=== Swapping with VaultHook ===');
    console.log('Wallet:', account);
    console.log('Token In:', formData.tokenIn);
    console.log('Token Out:', formData.tokenOut);
    console.log('Amount In:', formData.amountIn);

    try {
      setLoading(true);

      const hookAddress = CONTRACTS.UNIZWAP_HOOK;
      const swapRouterAddress = '0xf13D190e9117920c703d79B5F33732e10049b115';

      // First, approve token
      const tokenInContract = new Contract(
        formData.tokenIn,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        signer
      );

      const amountInWei = ethers.parseUnits(formData.amountIn, 18);

      // Approve tokens
      const approveTx = await tokenInContract.approve(swapRouterAddress, amountInWei);
      await approveTx.wait();

      // Prepare hookData
      const commitment = formData.commitment || ethers.ZeroHash;
      
      if (formData.secret && formData.nonce && formData.commitment !== ethers.ZeroHash) {
        console.log('\n🔐 Generating commitment for privacy...');
        console.log('Secret:', formData.secret);
        console.log('Nonce:', formData.nonce);
        console.log('Commitment:', commitment);
        console.log('Token Address:', formData.tokenOut);
      }
      
      const hookData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256', 'string', 'bool', 'string', 'bytes32'],
        [
          account,
          0, // minOutput set to 0
          '',
          true,
          'router',
          commitment
        ]
      );
      
      console.log('\nHookData encoded:');
      console.log('- User:', account);
      console.log('- Min Output: 0');
      console.log('- Pattern: router');
      console.log('- Commitment:', commitment);

      const swapRouterABI = [
        'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMinimum, bool zeroForOne, (address,address,uint24,int24,address) poolKey, bytes hookData, address receiver, uint256 deadline) external payable returns (uint256, uint256)'
      ];

      const swapRouter = new Contract(
        swapRouterAddress,
        swapRouterABI,
        signer
      );

      // Create PoolKey as tuple array for Solidity
      const poolKey = [
        formData.tokenIn,       // currency0
        formData.tokenOut,      // currency1
        3000,                   // fee
        60,                     // tickSpacing
        hookAddress             // hooks
      ];

      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      const minOutputAmount = 0; // Set to 0 to avoid slippage revert

      console.log('\nExecuting swap...');
      const tx = await swapRouter.swapExactTokensForTokens(
        amountInWei,          // amountIn
        minOutputAmount,      // amountOutMinimum
        formData.zeroForOne,  // zeroForOne
        poolKey,              // poolKey
        hookData,             // hookData
        account,              // receiver
        deadline              // deadline
      );
      const receipt = await tx.wait();

      console.log('✅ Swap executed successfully!');
      console.log('Transaction hash:', receipt.hash);
      console.log('Block:', receipt.blockNumber);

      setTxHash(receipt.hash);
      alert('Swap executed successfully!');

      if (formData.commitment) {
        alert(`Your swap output is in the vault.\nCommitment: ${formData.commitment}\nUse this to withdraw privately.`);
      }

      // Reset form
      setFormData({
        tokenIn: '',
        tokenOut: '',
        amountIn: '',
        zeroForOne: true,
        secret: '',
        nonce: '',
        commitment: '',
      });
    } catch (error) {
      console.error('Error swapping:', error);
      alert(`Failed to swap: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-purple-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-6 w-6 text-purple-400" />
          Swap Tokens
        </CardTitle>
        <CardDescription>
          Exchange tokens with optional private output to vault
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
        <form onSubmit={handleSwap} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="tokenIn">From Token</Label>
            <Input
              id="tokenIn"
              name="tokenIn"
              value={formData.tokenIn}
              onChange={handleChange}
              placeholder="Token address"
              required
            />
          </div>

          <div className="flex justify-center -my-2">
            <Button
              type="button"
              onClick={() => setFormData({ 
                ...formData, 
                zeroForOne: !formData.zeroForOne,
                tokenIn: formData.tokenOut,
                tokenOut: formData.tokenIn
              })}
              variant="outline"
              size="icon"
              className="rounded-full"
              title="Swap token positions"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tokenOut">To Token</Label>
            <Input
              id="tokenOut"
              name="tokenOut"
              value={formData.tokenOut}
              onChange={handleChange}
              placeholder="Token address"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amountIn">Amount to Swap</Label>
            <Input
              id="amountIn"
              type="number"
              name="amountIn"
              value={formData.amountIn}
              onChange={handleChange}
              placeholder="Amount"
              step="0.000001"
              required
            />
          </div>



          <Card className="bg-purple-500/10 border-purple-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Privacy Parameters (Optional)
                </CardTitle>
                <Button
                  type="button"
                  onClick={generateRandomPrivacyParams}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Generate
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="secret-swap" className="text-xs">Secret (5 digits)</Label>
                  <Input
                    id="secret-swap"
                    name="secret"
                    value={formData.secret}
                    onChange={handleChange}
                    placeholder="12345"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nonce-swap" className="text-xs">Nonce (5 digits)</Label>
                  <Input
                    id="nonce-swap"
                    name="nonce"
                    value={formData.nonce}
                    onChange={handleChange}
                    placeholder="67890"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              {formData.commitment && (
                <div className="space-y-2">
                  <Label htmlFor="commitment" className="text-xs">Commitment (Auto-generated)</Label>
                  <Input
                    id="commitment"
                    value={formData.commitment}
                    readOnly
                    className="font-mono text-xs"
                  />
                </div>
              )}
              
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Output goes to vault. Save secret, nonce, and commitment for private withdrawal!
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={!account || loading}
            variant="gradient"
            size="lg"
            className="w-full"
          >
            {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {!loading && <CheckCircle2 className="mr-2 h-4 w-4" />}
            {loading ? 'Swapping...' : 'Swap'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default SwapRouter;
