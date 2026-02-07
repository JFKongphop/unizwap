import React, { useState, FormEvent, ChangeEvent, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { ethers, Contract } from 'ethers';
import { poseidon3 } from 'poseidon-lite';
import { SEPOLIA_CHAIN_ID, NETWORK_CONFIG, CONTRACTS } from '../config/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Sparkles, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface FormData {
  token0: string;
  token1: string;
  amount0: string;
  amount1: string;
  tickLower: string;
  tickUpper: string;
  secret: string;
  nonce: string;
  commitment: string;
}

const PERMIT2 = CONTRACTS.PERMIT2;
const UNIZWAP_HOOK_ADDRESS = CONTRACTS.UNIZWAP_HOOK;
const POSITION_MANAGER_ADDRESS = CONTRACTS.POSITION_MANAGER;

const AddLiquidity: React.FC = () => {
  const { account, signer, chainId } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>('');
  const [expectedTokenId, setExpectedTokenId] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    token0: '',
    token1: '',
    amount0: '',
    amount1: '',
    tickLower: '-887220',
    tickUpper: '887220',
    secret: '',
    nonce: '',
    commitment: '',
  });

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const generateRandomPrivacyParams = (): void => {
    const randomSecret = Math.floor(10000 + Math.random() * 90000); // 5-digit: 10000-99999
    const randomNonce = Math.floor(10000 + Math.random() * 90000);  // 5-digit: 10000-99999
    
    setFormData(prev => ({
      ...prev,
      secret: randomSecret.toString(),
      nonce: randomNonce.toString()
    }));
    
    console.log('Generated random privacy params:', { secret: randomSecret, nonce: randomNonce });
  };

  const switchToSepolia = async (): Promise<void> => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NETWORK_CONFIG.chainId }],
      });
    } catch (error: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [NETWORK_CONFIG],
          });
        } catch (addError) {
          console.error('Error adding Sepolia network:', addError);
        }
      } else {
        console.error('Error switching to Sepolia:', error);
      }
    }
  };

  const fetchNextTokenId = useCallback(async (): Promise<void> => {
    if (!signer) {
      return;
    }

    // Check if on Sepolia network (chainId: 11155111)
    if (chainId !== SEPOLIA_CHAIN_ID) {
      console.error('Wrong network. Please connect to Sepolia.');
      setExpectedTokenId('Wrong Network');
      return;
    }

    try {
      const positionManagerAddress = POSITION_MANAGER_ADDRESS;
      
      const pmContract = new Contract(
        positionManagerAddress,
        ['function nextTokenId() external view returns (uint256)'],
        signer
      );
      
      const nextTokenId = await pmContract.nextTokenId();
      setExpectedTokenId(nextTokenId.toString());
      console.log('Next Token ID:', nextTokenId.toString());
    } catch (error) {
      console.error('Error fetching token ID:', error);
      setExpectedTokenId('Error');
    }
  }, [signer, chainId]);

  // Auto-generate commitment when secret, nonce, or expectedTokenId changes
  useEffect(() => {
    if (formData.secret && formData.nonce && expectedTokenId) {
      try {
        const commitmentBigInt = poseidon3([
          BigInt(formData.secret),
          BigInt(formData.nonce),
          BigInt(expectedTokenId)
        ]);
        
        const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');
        setFormData(prev => ({ ...prev, commitment }));
        console.log('Auto-generated commitment:', commitment);
      } catch (error) {
        console.error('Error generating commitment:', error);
        setFormData(prev => ({ ...prev, commitment: '' }));
      }
    } else {
      setFormData(prev => ({ ...prev, commitment: '' }));
    }
  }, [formData.secret, formData.nonce, expectedTokenId]);

  // Auto-fetch token ID when wallet connects
  useEffect(() => {
    if (signer) {
      fetchNextTokenId();
    }
  }, [signer, fetchNextTokenId]);

  const handleAddLiquidity = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!account || !signer) {
      alert('Please connect your wallet first');
      return;
    }

    // Check if on Sepolia network
    if (chainId !== SEPOLIA_CHAIN_ID) {
      alert('Wrong network! Please switch to Sepolia network in MetaMask.');
      return;
    }

    try {
      setLoading(true);

      console.log('=== Adding Liquidity to VaultHook Pool ===');
      console.log('Wallet:', account);

      const hookAddress = UNIZWAP_HOOK_ADDRESS;
      const positionManagerAddress = POSITION_MANAGER_ADDRESS;

      const amount0Wei = ethers.parseUnits(formData.amount0, 18);
      const amount1Wei = ethers.parseUnits(formData.amount1, 18);
      
      console.log('\n🔐 Privacy Parameters:');
      console.log('Secret:', formData.secret);
      console.log('Nonce:', formData.nonce);
      
      console.log('\nToken Amounts:');
      console.log('Token0 Amount:', ethers.formatEther(amount0Wei));
      console.log('Token1 Amount:', ethers.formatEther(amount1Wei));
      
      // Calculate liquidity based on amounts (geometric mean approach)
      // For full range: liquidity ≈ sqrt(amount0 * amount1)
      const liquidityRaw = Math.sqrt(Number(ethers.formatEther(amount0Wei)) * Number(ethers.formatEther(amount1Wei)));
      const liquidity = ethers.parseEther(liquidityRaw.toFixed(18));
      
      console.log('Calculated Liquidity:', ethers.formatEther(liquidity));

      console.log('✅ Approving tokens to Permit2...');
      
      // First, approve tokens to Permit2
      const token0Contract = new Contract(
        formData.token0,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        signer
      );
      const token1Contract = new Contract(
        formData.token1,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        signer
      );

      const tx1 = await token0Contract.approve(PERMIT2, ethers.MaxUint256);
      await tx1.wait();
      console.log('✓ Token0 approved to Permit2');
      
      const tx2 = await token1Contract.approve(PERMIT2, ethers.MaxUint256);
      await tx2.wait();
      console.log('✓ Token1 approved to Permit2');

      // Approve PositionManager through Permit2
      console.log('✅ Approving PositionManager through Permit2...');
      const permit2 = new Contract(
        PERMIT2,
        ['function approve(address token, address spender, uint160 amount, uint48 expiration) external'],
        signer
      );

      const expiration = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
      const maxUint160 = 2n**160n - 1n;
      
      const tx3 = await permit2.approve(formData.token0, positionManagerAddress, maxUint160, expiration);
      await tx3.wait();
      console.log('✓ Token0 approved through Permit2');
      
      const tx4 = await permit2.approve(formData.token1, positionManagerAddress, maxUint160, expiration);
      await tx4.wait();
      console.log('✓ Token1 approved through Permit2');

      // FETCH TOKEN ID RIGHT BEFORE BUILDING TRANSACTION (minimize race condition window)
      const pmContract = new Contract(
        positionManagerAddress,
        ['function nextTokenId() external view returns (uint256)'],
        signer
      );
      const tokenId = await pmContract.nextTokenId();
      const tokenIdString = tokenId.toString();
      
      console.log('\n📍 Fetching token ID right before transaction...');
      console.log('Expected TokenId:', tokenIdString);
      console.log('TokenId from form:', expectedTokenId);
      
      // Warn if token ID changed
      if (expectedTokenId && tokenIdString !== expectedTokenId) {
        console.warn('⚠️ Token ID changed! Was:', expectedTokenId, 'Now:', tokenIdString);
      }

      const positionManagerABI = [
        'function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable'
      ];

      const positionManager = new Contract(
        positionManagerAddress,
        positionManagerABI,
        signer
      );

      // Use the JUST-FETCHED tokenId (to minimize race condition window)
      console.log('Using Token ID for hookData:', tokenIdString);

      // Encode commitment and tokenId as hookData (to prevent race conditions)
      const commitment = formData.commitment || ethers.ZeroHash;
      const hookData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'uint256'], [commitment, tokenId]);

      // Build the unlock data for adding liquidity
      // Action codes: 2 = MINT_POSITION, 13 = SETTLE_PAIR (matching script)
      const actions = ethers.solidityPacked(['uint8', 'uint8'], [2, 13]);
      
      const MAX_UINT128 = (1n << 128n) - 1n;
      
      const poolKey = [formData.token0, formData.token1, 3000, 60, hookAddress];
      
      const params = [
        // MINT_POSITION params: (PoolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData)
        // Mint NFT directly to hook contract (not user wallet!)
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)', 'int24', 'int24', 'uint256', 'uint128', 'uint128', 'address', 'bytes'],
          [poolKey, formData.tickLower, formData.tickUpper, liquidity, MAX_UINT128, MAX_UINT128, hookAddress, hookData]
        ),
        // SETTLE_PAIR params: (currency0, currency1)
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'address'], [formData.token0, formData.token1])
      ];

      const unlockData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes', 'bytes[]'],
        [actions, params]
      );

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      console.log('\nAdding liquidity...');
      const tx = await positionManager.modifyLiquidities(unlockData, deadline);
      const receipt = await tx.wait();
      
      console.log('✅ Liquidity added successfully!');
      console.log('Transaction hash:', receipt.hash);
      console.log('Block:', receipt.blockNumber);

      setTxHash(receipt.hash);

      // Verify NFT ownership
      const nftContract = new Contract(
        positionManagerAddress,
        ['function ownerOf(uint256 tokenId) view returns (address)'],
        signer
      );

      const owner = await nftContract.ownerOf(tokenId);
      console.log('📝 NFT Owner:', owner);
      console.log('Hook address:', hookAddress);
      console.log('NFT owned by hook:', owner.toLowerCase() === hookAddress.toLowerCase());

      if (owner.toLowerCase() === hookAddress.toLowerCase()) {
        console.log('✅ SUCCESS! NFT minted directly to hook contract');
      } else {
        console.log('❌ WARNING: NFT not owned by hook (owned by:', owner, ')');
      }
      
      const message = `Liquidity added successfully!\n\n🆔 Token ID: ${tokenIdString}\n📝 NFT Owner: ${owner === hookAddress ? 'Hook Contract ✅' : owner}\n${formData.commitment ? `🔐 Commitment: ${formData.commitment}\n` : ''}${formData.secret && formData.nonce ? `\n💾 SAVE THESE 3 VALUES FOR REMOVAL:\nSecret: ${formData.secret}\nNonce: ${formData.nonce}\nToken ID: ${tokenIdString}` : ''}`;
      alert(message);

      // Reset form
      setFormData({
        token0: '',
        token1: '',
        amount0: '',
        amount1: '',
        tickLower: '-887220',
        tickUpper: '887220',
        secret: '',
        nonce: '',
        commitment: '',
      });
      
      // Refresh token ID for next LP
      await fetchNextTokenId();
    } catch (error) {
      console.error('Error adding liquidity:', error);
      alert(`Failed to add liquidity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-purple-400" />
          Add Liquidity
        </CardTitle>
        <CardDescription>
          Provide liquidity to the pool with privacy features
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
      
        {chainId && chainId !== SEPOLIA_CHAIN_ID && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between w-full">
              <div>
                <p className="font-medium">Wrong Network!</p>
                <p className="text-sm mt-1">Current Chain ID: {chainId}</p>
              </div>
              <Button onClick={switchToSepolia} size="sm" variant="outline">
                Switch to Sepolia
              </Button>
            </AlertDescription>
          </Alert>
        )}
      
        <form onSubmit={handleAddLiquidity} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="token0">Token 0</Label>
              <Input
                id="token0"
                name="token0"
                value={formData.token0}
                onChange={handleChange}
                placeholder="0x..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount0">Amount 0</Label>
              <Input
                id="amount0"
                name="amount0"
                type="number"
                value={formData.amount0}
                onChange={handleChange}
                placeholder="0.0"
                step="0.000001"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="token1">Token 1</Label>
              <Input
                id="token1"
                name="token1"
                value={formData.token1}
                onChange={handleChange}
                placeholder="0x..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount1">Amount 1</Label>
              <Input
                id="amount1"
                name="amount1"
                type="number"
                value={formData.amount1}
                onChange={handleChange}
                placeholder="0.0"
                step="0.000001"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tickLower">Tick Lower</Label>
              <Input
                id="tickLower"
                name="tickLower"
                type="number"
                value={formData.tickLower}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tickUpper">Tick Upper</Label>
              <Input
                id="tickUpper"
                name="tickUpper"
                type="number"
                value={formData.tickUpper}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <Card className="bg-purple-500/10 border-purple-500/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">🔐 Privacy Parameters</CardTitle>
                <Button
                  type="button"
                  onClick={generateRandomPrivacyParams}
                  size="sm"
                  variant="secondary"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Generate Random
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
          
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="secret">Secret</Label>
                  <Input
                    id="secret"
                    name="secret"
                    value={formData.secret}
                    onChange={handleChange}
                    placeholder="987654"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nonce">Nonce</Label>
                  <Input
                    id="nonce"
                    name="nonce"
                    value={formData.nonce}
                    onChange={handleChange}
                    placeholder="321098"
                    className="font-mono"
                  />
                </div>
              </div>

              <Alert variant="info">
                <AlertDescription className="flex items-center justify-between w-full">
                  <div>
                    <span className="font-medium">Next Token ID:</span>{' '}
                    <span className="font-mono">{expectedTokenId || 'Not fetched'}</span>
                  </div>
                  <Button
                    type="button"
                    onClick={fetchNextTokenId}
                    size="sm"
                    variant="outline"
                    disabled={!signer}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Fetch
                  </Button>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="commitment">Commitment (Auto-generated)</Label>
                <Input
                  id="commitment"
                  name="commitment"
                  value={formData.commitment}
                  placeholder="Enter secret and nonce to auto-generate"
                  className="font-mono text-xs"
                  readOnly
                />
              </div>

              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>IMPORTANT:</strong> Save these 3 values (secret, nonce, tokenId)! 
                  You'll need them for private LP removal. Commitment is auto-generated from these.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={!account || loading}
            className="w-full"
            variant="gradient"
            size="lg"
          >
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Adding Liquidity...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Add Liquidity
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default AddLiquidity;
