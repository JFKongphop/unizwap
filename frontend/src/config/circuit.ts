import { 
  groth16, 
  Groth16Proof, 
  PublicSignals 
} from 'snarkjs';

export type Input = {
  x: number,
  y: number
}

export type ProofInput = {
  merkle_root: string;
  nullifier: string;
  token_address: string;
  deposit_amount: string;
  secret: string;
  nonce: string;
  merkle_pathIndices: string[];
  merkle_path: string[];
};

export type OutPut = {
  proof: Groth16Proof, 
  publicSignals: PublicSignals
}

export const generateSwapProof = async (input: Input | ProofInput): Promise<OutPut> => {
  console.log('🔨 Generating ZK proof...');
  
  const wasmResponse = await fetch('/proof/swap/unizwap.wasm');
  if (!wasmResponse.ok) {
    throw new Error('Failed to load unizwap.wasm file');
  }
  const zkeyResponse = await fetch('/proof/swap/unizwap.zkey');
  if (!zkeyResponse.ok) {
    throw new Error('Failed to load unizwap.zkey file');
  }

  const wasmBuffer = await wasmResponse.arrayBuffer();
  const zkeyBuffer = await zkeyResponse.arrayBuffer();

  const { proof, publicSignals } = await groth16.fullProve(
    input,
    new Uint8Array(wasmBuffer),
    new Uint8Array(zkeyBuffer)
  );

  console.log('✅ Proof generated!');
  console.log('Public signals:', publicSignals);

  return { proof, publicSignals };
}

export const verifyProof = async (
  proof: Groth16Proof,
  publicSignals: PublicSignals
): Promise<boolean> => {
  const vkRes = await fetch('/proof/swap/verification_key.json');
  const vKey = await vkRes.json();
  return await groth16.verify(vKey, publicSignals, proof);
};

export const exportSolidityCallData = async (
  proof: Groth16Proof,
  publicSignals: PublicSignals
): Promise<{
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  pubSignals: [string, string, string, string];
}> => {
  const calldata = await groth16.exportSolidityCallData(proof, publicSignals);
  const argv = calldata.replace(/["[\]\s]/g, "").split(',');
  
  return {
    pA: [argv[0], argv[1]],
    pB: [[argv[2], argv[3]], [argv[4], argv[5]]],
    pC: [argv[6], argv[7]],
    pubSignals: [argv[8], argv[9], argv[10], argv[11]]
  };
};
