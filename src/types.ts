// ─── Enums ────────────────────────────────────────────────────────────────────

export enum FacetCutAction {
  Add = 0,
  Replace = 1,
  Remove = 2,
}

// ─── Config Types ─────────────────────────────────────────────────────────────

export interface FacetInit {
  contract: string;
  function: string;
  args?: string[];
}

export interface FacetConfig {
  /** Human-readable name (e.g. "GovernanceFacet") */
  name: string;
  /** Contract name as it appears in artifacts */
  contract: string;
  /** "auto" or an explicit list of 4-byte selector hex strings */
  selectors: "auto" | string[];
  /** Optional initializer to call after deployment */
  init?: FacetInit;
}

export interface AccountsConfig {
  privateKey?: string;
  mnemonic?: string;
}

export interface NetworkConfig {
  rpc: string;
  chainId: number;
  accounts?: AccountsConfig;
}

export interface EtherscanConfig {
  apiKey: string;
}

export interface VerificationConfig {
  etherscan?: EtherscanConfig;
}

export interface DiamondSettings {
  gasMultiplier: number;
  confirmations: number;
  reportDir: string;
}

export interface DiamondMeta {
  name: string;
  artifactsDir: string;
}

export interface DiamondConfig {
  diamond: DiamondMeta;
  networks: Record<string, NetworkConfig>;
  facets: FacetConfig[];
  verification?: VerificationConfig;
  settings: DiamondSettings;
}

// ─── Runtime Types ────────────────────────────────────────────────────────────

export interface DeployedFacet {
  name: string;
  contract: string;
  address: string;
  selectors: string[];
  txHash?: string;
}

export interface FacetCut {
  facetAddress: string;
  action: FacetCutAction;
  functionSelectors: string[];
}

export interface InitCall {
  target: string;
  calldata: string;
}

export interface DiamondArtifact {
  abi: AbiFragment[];
  bytecode: string;
  contractName: string;
}

export interface AbiFragment {
  type: string;
  name?: string;
  inputs?: AbiInput[];
  outputs?: AbiInput[];
  stateMutability?: string;
}

export interface AbiInput {
  name: string;
  type: string;
  internalType?: string;
}

// ─── Report Types ─────────────────────────────────────────────────────────────

export interface DeploymentReport {
  version: string;
  network: string;
  chainId: number;
  timestamp: number;
  diamondAddress: string;
  facets: DeployedFacet[];
  txHashes: string[];
  gasUsed?: string;
}

// ─── Verification Types ───────────────────────────────────────────────────────

export interface OnChainFacet {
  facetAddress: string;
  functionSelectors: string[];
}

export interface FacetDiff {
  name: string;
  status: "match" | "missing" | "extra" | "selector_mismatch";
  onChainAddress?: string;
  missingSelectors?: string[];
  extraSelectors?: string[];
}
