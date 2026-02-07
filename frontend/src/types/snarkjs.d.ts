declare module 'snarkjs' {
  export type Groth16Proof = {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };

  export type PublicSignals = string[];

  export namespace groth16 {
    export function fullProve(
      input: any,
      wasmFile: string | Uint8Array,
      zkeyFile: string | Uint8Array
    ): Promise<{ proof: Groth16Proof; publicSignals: PublicSignals }>;

    export function verify(
      vKey: any,
      publicSignals: PublicSignals,
      proof: Groth16Proof
    ): Promise<boolean>;

    export function exportSolidityCallData(
      proof: Groth16Proof,
      publicSignals: PublicSignals
    ): Promise<string>;
  }

  export namespace plonk {
    export function fullProve(
      input: any,
      wasmFile: string | Uint8Array,
      zkeyFile: string | Uint8Array
    ): Promise<{ proof: any; publicSignals: any }>;

    export function verify(
      vKey: any,
      publicSignals: any,
      proof: any
    ): Promise<boolean>;

    export function exportSolidityCallData(
      proof: any,
      publicSignals: any
    ): Promise<string>;
  }
}
