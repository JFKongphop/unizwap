import React, { useState, FormEvent, ChangeEvent } from 'react';
import { useWallet } from '../context/WalletContext';
import { ethers } from 'ethers';
import { MerkleTree } from 'fixed-merkle-tree';
import { poseidon2, poseidon3 } from 'poseidon-lite';
import { groth16 } from 'snarkjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { MinusCircle, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { CONTRACTS } from '../config/contracts';

interface FormData {
  tokenId: string;
  token0: string;
  token1: string;
  secret: string;
  nonce: string;
  recipient: string;
  hookAddress: string;
}

const TREE_LEVELS = 10;
const UNIZWAP_HOOK_ADDRESS = CONTRACTS.UNIZWAP_HOOK;
const POSITION_MANAGER = CONTRACTS.POSITION_MANAGER;
const FROM_BLOCK = 10209764;

const UNIZWAP_HOOK_ABI = [
  'function roots(uint256) external view returns (bytes32)',
  'function currentRootIndex() external view returns (uint32)',
  'function nullifiers(bytes32) external view returns (bool)',
  'function getTokenIdByCommitment(bytes32 commitment) external view returns (uint256)',
  'function removeLiquidityWithProof(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint256 tokenId, uint128 liquidity, uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[6] _pubSignals) external',
  'function isKnownRoot(bytes32 _root) public view returns (bool)',
  'event NewLeafInserted(bytes32 indexed commitment, uint32 indexed leafIndex, bytes32 root)'
];

const POSITION_MANAGER_ABI = [
  'function getPositionLiquidity(uint256 tokenId) external view returns (uint128)',
  'function ownerOf(uint256 tokenId) view returns (address)'
];

const RemoveLiquidity: React.FC = () => {
  const { account, signer } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    tokenId: '',
    token0: '',
    token1: '',
    secret: '',
    nonce: '',
    recipient: account || '',
    hookAddress: UNIZWAP_HOOK_ADDRESS,
  });

  // Update recipient when account changes
  React.useEffect(() => {
    if (account && !formData.recipient) {
      setFormData(prev => ({ ...prev, recipient: account }));
    }
  }, [account, formData.recipient]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRemoveLiquidity = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!account || !signer) {
      alert('Please connect your wallet first');
      return;
    }

    console.log('=== Removing Liquidity (Private) ===');
    console.log('Wallet:', account);
    console.log('Token ID:', formData.tokenId);
    console.log('Secret:', formData.secret);
    console.log('Nonce:', formData.nonce);

    try {
      setLoading(true);
      setStatus('⏳ Calculating commitment...');

      // Parse inputs
      const secret = BigInt(formData.secret);
      const nonce = BigInt(formData.nonce);
      const tokenId = BigInt(formData.tokenId);

      // Calculate commitment: Poseidon(secret, nonce, tokenId)
      const commitment = poseidon3([secret, nonce, tokenId]);
      
      console.log('Commitment:', commitment.toString());
      console.log('Commitment hex:', '0x' + commitment.toString(16).padStart(64, '0'));

      setStatus('📡 Checking position...');

      const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, signer);
      
      // Get position liquidity
      const liquidityToRemove = await positionManager.getPositionLiquidity(tokenId);
      
      if (liquidityToRemove === 0n) {
        throw new Error('Position has no liquidity to remove');
      }
      
      console.log('Liquidity to remove:', liquidityToRemove.toString());

      // Calculate nullifier: Poseidon(secret, tokenId)
      const nullifier = poseidon2([secret, tokenId]);
      const nullifierHex = '0x' + nullifier.toString(16).padStart(64, '0');
      
      console.log('Nullifier:', nullifierHex);

      setStatus('📡 Fetching merkle tree leaves from contract...');

      const hookAddress = formData.hookAddress || UNIZWAP_HOOK_ADDRESS;
      console.log('Querying events from hook:', hookAddress);
      
      const unizwapHook = new ethers.Contract(hookAddress, UNIZWAP_HOOK_ABI, signer);

      // Fetch all NewLeafInserted events
      const filter = unizwapHook.filters.NewLeafInserted();
      const events = await unizwapHook.queryFilter(filter, FROM_BLOCK, 'latest');

      console.log('Found', events.length, 'leaf insertions');
      console.log('Looking for commitment:', commitment.toString());
      console.log('Looking for commitment hex:', '0x' + commitment.toString(16).padStart(64, '0'));

      // Build leaves array
      const leafMap = new Map<number, bigint>();
      for (const event of events) {
        const eventCommitment = BigInt((event as any).args.commitment);
        const leafIndex = Number((event as any).args.leafIndex);
        leafMap.set(leafIndex, eventCommitment);
        const eventCommitmentHex = '0x' + eventCommitment.toString(16).padStart(64, '0');
        console.log(`  Leaf ${leafIndex}: ${eventCommitmentHex}`);
        
        // Also log if it matches our commitment
        if (eventCommitment === commitment) {
          console.log(`    ✅ MATCH! This is our commitment at index ${leafIndex}`);
        }
      }

      const leaves = Array(1024).fill(0n);
      for (const [index, leafCommitment] of leafMap.entries()) {
        leaves[index] = leafCommitment;
      }

      // Verify our commitment is in the tree
      const ourLeafIndex = Array.from(leafMap.entries()).find(([_, c]) => c === commitment)?.[0];
      if (ourLeafIndex === undefined) {
        console.error('❌ Commitment not found in tree!');
        console.error('Total leaves found:', leafMap.size);
        console.error('Searched commitment (BigInt):', commitment.toString());
        console.error('Searched commitment (hex):', '0x' + commitment.toString(16).padStart(64, '0'));
        console.error('All commitments in tree:', Array.from(leafMap.entries()).map(([idx, c]) => `[${idx}] 0x${c.toString(16).padStart(64, '0')}`));
        throw new Error('Your commitment not found in the tree! Make sure you added liquidity with these secret/nonce/tokenId values.');
      }

      console.log('✅ Commitment found at leaf index:', ourLeafIndex);

      setStatus('🌳 Building merkle tree...');
      
      console.log('\n🌳 Building Merkle tree...');

      // Create Merkle tree using poseidon-lite hash
      const tree = new MerkleTree(TREE_LEVELS, leaves, {
        hashFunction: (a: any, b: any) => poseidon2([BigInt(a), BigInt(b)]) as any,
        zeroElement: 0n as any
      });

      const { pathElements, pathIndices, pathRoot } = tree.proof(commitment as any);

      console.log('Merkle root:', pathRoot.toString());
      console.log('Leaf Index:', ourLeafIndex);

      setStatus('🔨 Generating ZK proof (this may take 30-60 seconds)...');
      
      console.log('\n🔐 Generating ZK proof...');

      // Prepare proof inputs
      const input = {
        merkle_root: pathRoot.toString(),
        nullifier: nullifier.toString(),
        tokenAAddress: BigInt(formData.token0).toString(),
        tokenBAddress: BigInt(formData.token1).toString(),
        tokenId: tokenId.toString(),
        liquidityAmount: liquidityToRemove.toString(),
        secret: secret.toString(),
        nonce: nonce.toString(),
        merkle_pathIndices: pathIndices.map((x: any) => x.toString()),
        merkle_path: pathElements.map((x: any) => x.toString())
      };

      // Load WASM and zkey files
      const wasmResponse = await fetch('/proof/lp/unizwap-removelp.wasm');
      if (!wasmResponse.ok) {
        throw new Error('Failed to load unizwap-removelp.wasm file');
      }
      const zkeyResponse = await fetch('/proof/lp/unizwap-removelp.zkey');
      if (!zkeyResponse.ok) {
        throw new Error('Failed to load unizwap-removelp.zkey file');
      }

      const wasmBuffer = await wasmResponse.arrayBuffer();
      const zkeyBuffer = await zkeyResponse.arrayBuffer();

      const { proof, publicSignals } = await groth16.fullProve(
        input,
        new Uint8Array(wasmBuffer),
        new Uint8Array(zkeyBuffer)
      );

      console.log('✅ Proof generated successfully!');
      console.log('Public signals:', publicSignals);

      setStatus('✅ Proof generated! Verifying merkle root...');

      // Verify merkle root is known
      const merkleRootBytes32 = ethers.toBeHex(BigInt(publicSignals[0]), 32);
      const isRootKnown = await unizwapHook.isKnownRoot(merkleRootBytes32);

      if (!isRootKnown) {
        throw new Error('Merkle root not recognized by contract!');
      }

      setStatus('📝 Submitting removal transaction...');

      // Format proof for Solidity
      const calldata = await groth16.exportSolidityCallData(proof, publicSignals);
      const argv = calldata.replace(/["[\]\s]/g, "").split(',');
      
      const pA: [bigint, bigint] = [BigInt(argv[0]), BigInt(argv[1])];
      const pB: [[bigint, bigint], [bigint, bigint]] = [
        [BigInt(argv[2]), BigInt(argv[3])],
        [BigInt(argv[4]), BigInt(argv[5])]
      ];
      const pC: [bigint, bigint] = [BigInt(argv[6]), BigInt(argv[7])];
      const pubSignals: [bigint, bigint, bigint, bigint, bigint, bigint] = [
        BigInt(argv[8]),  // merkleRoot
        BigInt(argv[9]),  // nullifier
        BigInt(argv[10]), // tokenA
        BigInt(argv[11]), // tokenB
        BigInt(argv[12]), // tokenId
        BigInt(argv[13])  // liquidity
      ];

      // Pool parameters - MUST match the pool where liquidity was added
      // Using array format [currency0, currency1, fee, tickSpacing, hooks]
      const poolKey = [formData.token0, formData.token1, 3000, 60, hookAddress];

      // Call removeLiquidityWithProof
      const tx = await unizwapHook.removeLiquidityWithProof(
        poolKey,
        tokenId,
        liquidityToRemove,
        pA,
        pB,
        pC,
        pubSignals
      );

      setStatus('⏳ Waiting for transaction confirmation...');
      
      console.log('\nSubmitting proof to VaultHook...');
      const receipt = await tx.wait();

      console.log('✅ Liquidity removed successfully!');
      console.log('Transaction hash:', receipt.hash);
      console.log('Block:', receipt.blockNumber);

      setTxHash(receipt.hash);
      setStatus('✅ Liquidity removed successfully!');
      alert('Private liquidity removal completed successfully!');

      // Reset form
      setFormData({
        tokenId: '',
        token0: '',
        token1: '',
        secret: '',
        nonce: '',
        recipient: '',
        hookAddress: UNIZWAP_HOOK_ADDRESS,
      });

    } catch (error) {
      console.error('Error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-purple-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MinusCircle className="h-6 w-6 text-purple-400" />
          Remove Liquidity with ZK Proof
        </CardTitle>
        <CardDescription>
          Privately remove liquidity using your secret parameters
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
        <Alert variant="info" className="mb-6 border-purple-500/30">
          <AlertDescription>
            <p className="text-sm font-medium mb-2">🔐 Private Liquidity Removal:</p>
            <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
              <li>Uses same secret/nonce from when you added liquidity</li>
              <li>Automatically builds merkle tree and generates ZK proof</li>
              <li>Can withdraw to any address (cross-wallet)</li>
            </ul>
          </AlertDescription>
        </Alert>

        <form onSubmit={handleRemoveLiquidity} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="tokenId">NFT Token ID</Label>
            <Input
              id="tokenId"
              name="tokenId"
              value={formData.tokenId}
              onChange={handleChange}
              placeholder="Position NFT ID"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hookAddress">Hook Address (from Add LP)</Label>
            <Input
              id="hookAddress"
              name="hookAddress"
              value={formData.hookAddress}
              onChange={handleChange}
              placeholder="0x..."
              className="font-mono text-xs"
              required
            />
            <p className="text-xs text-muted-foreground">Use the hook address that was active when you added liquidity</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="token0">Token 0 (Token A)</Label>
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
              <Label htmlFor="token1">Token 1 (Token B)</Label>
              <Input
                id="token1"
                name="token1"
                value={formData.token1}
                onChange={handleChange}
                placeholder="0x..."
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="secret-remove">Secret (from add LP)</Label>
              <Input
                id="secret-remove"
                name="secret"
                value={formData.secret}
                onChange={handleChange}
                placeholder="987654"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nonce-remove">Nonce (from add LP)</Label>
              <Input
                id="nonce-remove"
                name="nonce"
                value={formData.nonce}
                onChange={handleChange}
                placeholder="321098"
                className="font-mono"
                required
              />
            </div>
          </div>

          {status && (
            <Alert variant="info">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>{status}</AlertDescription>
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
            {loading ? 'Processing...' : 'Remove Liquidity Privately'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default RemoveLiquidity;
