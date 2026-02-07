import React, { useState, FormEvent, ChangeEvent } from 'react';
import { useWallet } from '../context/WalletContext';
import { ethers } from 'ethers';
import { MerkleTree } from 'fixed-merkle-tree';
import { poseidon2, poseidon3 } from 'poseidon-lite';
import { generateSwapProof, exportSolidityCallData, ProofInput } from '../config/circuit';
import { CONTRACTS } from '../config/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Wallet, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';

interface FormData {
  token: string;
  secret: string;
  nonce: string;
  depositAmount: string;
}

const TREE_LEVELS = 10;
const UNIZWAP_HOOK_ADDRESS = CONTRACTS.UNIZWAP_HOOK;

const UNIZWAP_HOOK_ABI = [
  'function withdrawPrivate(bytes32 commitment, uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[4] calldata _pubSignals) external',
  'function isKnownRoot(bytes32 _root) external view returns (bool)',
  'function roots(uint256) external view returns (bytes32)',
  'function currentRootIndex() external view returns (uint32)',
  'event NewLeafInserted(bytes32 indexed commitment, uint32 indexed leafIndex, bytes32 root)'
];

const WithdrawRouter: React.FC = () => {

  const { account, signer } = useWallet();
  const [loading, setLoading] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    token: '',
    secret: '',
    nonce: '',
    depositAmount: '1000',
  });
  const [status, setStatus] = useState<string>('');

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePrivateWithdraw = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!account || !signer) {
      alert('Please connect your wallet first');
      return;
    }

    console.log('=== Withdrawing Private Deposit ===');
    console.log('Wallet:', account);
    console.log('Token:', formData.token);
    console.log('Amount:', formData.depositAmount);
    console.log('Secret:', formData.secret);
    console.log('Nonce:', formData.nonce);

    try {
      setLoading(true);
      setStatus('⏳ Calculating commitment...');

      // Parse inputs
      const secret = BigInt(formData.secret);
      const nonce = BigInt(formData.nonce);
      const token_address = BigInt(formData.token);
      const deposit_amount = BigInt(formData.depositAmount);

      // Calculate commitment using poseidon-lite
      const secretHash = poseidon2([secret, nonce]);
      const commitment = poseidon3([token_address, deposit_amount, secretHash]);

      console.log('Commitment:', commitment.toString());

      setStatus('📡 Fetching merkle tree leaves from contract...');
      
      console.log('\n🌳 Building Merkle tree...');

      const unizwapHook = new ethers.Contract(UNIZWAP_HOOK_ADDRESS, UNIZWAP_HOOK_ABI, signer);

      // Fetch all NewLeafInserted events
      const filter = unizwapHook.filters.NewLeafInserted();
      const events = await unizwapHook.queryFilter(filter, 10209764, 'latest');

      console.log('Found', events.length, 'leaf insertions');

      // Build leaves array
      const leafMap = new Map<number, bigint>();
      for (const event of events) {
        const eventCommitment = BigInt((event as any).args.commitment);
        const leafIndex = Number((event as any).args.leafIndex);
        leafMap.set(leafIndex, eventCommitment);
        console.log(`  Leaf ${leafIndex}:`, eventCommitment.toString());
      }

      const leaves = Array(1024).fill(0n);
      for (const [index, leafCommitment] of leafMap.entries()) {
        leaves[index] = leafCommitment;
      }

      // Verify our commitment is in the tree
      const ourLeafIndex = Array.from(leafMap.entries()).find(([_, c]) => c === commitment)?.[0];
      if (ourLeafIndex === undefined) {
        throw new Error('Your commitment not found in the tree! Make sure you completed a swap with these secret/nonce values.');
      }

      console.log('✅ Commitment found at leaf index:', ourLeafIndex);

      setStatus('🌳 Building merkle tree...');

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
      const input: ProofInput = {
        merkle_root: pathRoot.toString(),
        nullifier: nonce.toString(),
        token_address: token_address.toString(),
        deposit_amount: deposit_amount.toString(),
        secret: secret.toString(),
        nonce: nonce.toString(),
        merkle_pathIndices: pathIndices.map((x: any) => x.toString()),
        merkle_path: pathElements.map((x: any) => x.toString())
      };

      const { proof, publicSignals } = await generateSwapProof(input);

      console.log('✅ Proof generated successfully!');
      console.log('Public signals:', publicSignals);

      setStatus('✅ Proof generated! Verifying merkle root...');

      // Verify merkle root is known
      const merkleRootBytes32 = ethers.toBeHex(BigInt(publicSignals[0]), 32);
      const isRootKnown = await unizwapHook.isKnownRoot(merkleRootBytes32);

      if (!isRootKnown) {
        throw new Error('Merkle root not recognized by contract!');
      }

      setStatus('📝 Submitting withdrawal transaction...');

      // Export calldata for Solidity
      const { pA, pB, pC, pubSignals } = await exportSolidityCallData(proof, publicSignals);

      const commitmentBytes32 = ethers.toBeHex(commitment, 32);

      // Call withdrawPrivate
      const tx = await unizwapHook.withdrawPrivate(commitmentBytes32, pA, pB, pC, pubSignals);

      setStatus('⏳ Waiting for transaction confirmation...');
      
      console.log('\nSubmitting proof to VaultHook...');
      const receipt = await tx.wait();

      console.log('✅ Withdrawal successful!');
      console.log('Transaction hash:', receipt.hash);
      console.log('Block:', receipt.blockNumber);

      setTxHash(receipt.hash);
      setStatus('✅ Withdrawal successful!');
      alert('Private withdrawal completed successfully!');

      // Reset form
      setFormData({
        token: '',
        secret: '',
        nonce: '',
        depositAmount: '1000',
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
          <Wallet className="h-6 w-6 text-purple-400" />
          Private Withdraw from Vault
        </CardTitle>
        <CardDescription>
          Withdraw tokens from vault using your secret parameters
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
        <form onSubmit={handlePrivateWithdraw} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="token">Token Address (Output Token)</Label>
            <Input
              id="token"
              name="token"
              value={formData.token}
              onChange={handleChange}
              placeholder="0x... (TOKEN_B from swap)"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="secret-withdraw">Secret (from swap)</Label>
              <Input
                id="secret-withdraw"
                name="secret"
                value={formData.secret}
                onChange={handleChange}
                placeholder="12345"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nonce-withdraw">Nonce (from swap)</Label>
              <Input
                id="nonce-withdraw"
                name="nonce"
                value={formData.nonce}
                onChange={handleChange}
                placeholder="67890"
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
            {loading ? 'Processing...' : 'Withdraw Privately'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default WithdrawRouter;
