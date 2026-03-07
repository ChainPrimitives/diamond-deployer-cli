import path from "path";
import {
  ContractFactory,
  Contract,
  Interface,
  FunctionFragment,
  type Signer,
  type Provider,
} from "ethers";
import type {
  DiamondConfig,
  NetworkConfig,
  FacetConfig,
  DeployedFacet,
  FacetCut,
  OnChainFacet,
  DiamondArtifact,
} from "./types.js";
import { FacetCutAction } from "./types.js";
import {
  getProvider,
  getSigner,
  loadArtifact,
  extractSelectors,
} from "./utils.js";

// ─── ABI Fragments ────────────────────────────────────────────────────────────

const DIAMOND_CUT_ABI = [
  "function diamondCut(tuple(address facetAddress, uint8 action, bytes4[] functionSelectors)[] _diamondCut, address _init, bytes _calldata) external",
];

const LOUPE_ABI = [
  "function facets() external view returns (tuple(address facetAddress, bytes4[] functionSelectors)[])",
  "function facetAddresses() external view returns (address[])",
  "function facetFunctionSelectors(address _facet) external view returns (bytes4[])",
  "function facetAddress(bytes4 _functionSelector) external view returns (address)",
];

const OWNERSHIP_ABI = [
  "function owner() external view returns (address)",
];

// ─── DiamondDeployer ──────────────────────────────────────────────────────────

export class DiamondDeployer {
  private readonly config: DiamondConfig;
  private readonly network: NetworkConfig;
  private readonly provider: ReturnType<typeof getProvider>;
  private readonly signer: Signer;
  private readonly gasMultiplier: number;
  private readonly confirmations: number;

  constructor(config: DiamondConfig, network: NetworkConfig) {
    this.config = config;
    this.network = network;
    this.provider = getProvider(network);
    this.signer = getSigner(network, this.provider);
    this.gasMultiplier = config.settings?.gasMultiplier ?? 1.2;
    this.confirmations = config.settings?.confirmations ?? 2;
  }

  // ─── Artifact Loading ───────────────────────────────────────────────────────

  /** Load all facet artifacts in config order. Returns count of loaded artifacts. */
  async loadArtifacts(): Promise<DiamondArtifact[]> {
    const artifacts: DiamondArtifact[] = [];
    for (const facet of this.config.facets) {
      const artifact = await loadArtifact(
        this.config.diamond.artifactsDir,
        facet.contract
      );
      artifacts.push(artifact);
    }
    return artifacts;
  }

  // ─── Facet Deployment ───────────────────────────────────────────────────────

  /** Deploy a single facet contract and return its deployed address. */
  async deployFacet(facet: FacetConfig): Promise<string> {
    const artifact = await loadArtifact(
      this.config.diamond.artifactsDir,
      facet.contract
    );

    const factory = new ContractFactory(
      artifact.abi as unknown as string[],
      artifact.bytecode,
      this.signer
    );

    const tx = await factory.getDeployTransaction();
    const gasEstimate = await this.provider.estimateGas(tx);
    const gasLimit = this._applyMultiplier(gasEstimate);

    const deployed = await factory.deploy({ gasLimit });
    await deployed.deploymentTransaction()?.wait(this.confirmations);

    return await deployed.getAddress();
  }

  /** Build the diamondCut args for a set of facets. */
  async buildFacetCuts(
    deployedFacets: DeployedFacet[],
    action: FacetCutAction = FacetCutAction.Add
  ): Promise<FacetCut[]> {
    return deployedFacets.map((facet) => ({
      facetAddress:
        action === FacetCutAction.Remove
          ? "0x0000000000000000000000000000000000000000"
          : facet.address,
      action,
      functionSelectors: facet.selectors,
    }));
  }

  // ─── Diamond Deployment ──────────────────────────────────────────────────────

  /**
   * Deploy the Diamond contract. The Diamond constructor should accept:
   *   constructor(address _owner, FacetCut[] _diamondCut)
   *
   * Looks for "Diamond" artifact in `artifactsDir`.
   */
  async deployDiamond(deployedFacets: DeployedFacet[]): Promise<string> {
    const artifact = await loadArtifact(
      this.config.diamond.artifactsDir,
      "Diamond"
    );

    const cuts = await this.buildFacetCuts(deployedFacets, FacetCutAction.Add);
    const ownerAddress = await (this.signer as Signer & { getAddress(): Promise<string> }).getAddress();

    const factory = new ContractFactory(
      artifact.abi as unknown as string[],
      artifact.bytecode,
      this.signer
    );

    const tx = await factory.getDeployTransaction(ownerAddress, cuts);
    const gasEstimate = await this.provider.estimateGas(tx);
    const gasLimit = this._applyMultiplier(gasEstimate);

    const deployed = await factory.deploy(ownerAddress, cuts, { gasLimit });
    await deployed.deploymentTransaction()?.wait(this.confirmations);

    return await deployed.getAddress();
  }

  // ─── Init Functions ──────────────────────────────────────────────────────────

  /**
   * Execute an initializer function on the diamond (via delegatecall pattern).
   * Calls the init contract's function to set up storage.
   */
  async runInit(diamondAddress: string, facet: FacetConfig): Promise<string> {
    if (!facet.init) {
      throw new Error(`Facet "${facet.name}" has no init config`);
    }

    const initArtifact = await loadArtifact(
      this.config.diamond.artifactsDir,
      facet.init.contract
    );

    const initFactory = new ContractFactory(
      initArtifact.abi as unknown as string[],
      initArtifact.bytecode,
      this.signer
    );

    const initDeployed = await initFactory.deploy();
    await initDeployed.deploymentTransaction()?.wait(this.confirmations);
    const initAddress = await initDeployed.getAddress();

    // Encode the init calldata
    const initIface = new Interface(initArtifact.abi as unknown as string[]);
    const args = facet.init.args ?? [];
    const calldata = initIface.encodeFunctionData(facet.init.function, args);

    // Call diamondCut with 0 facet cuts, just the init
    const diamond = new Contract(diamondAddress, DIAMOND_CUT_ABI, this.signer);
    const initTx = await diamond.diamondCut([], initAddress, calldata);
    const receipt = await initTx.wait(this.confirmations);

    return receipt?.hash ?? initTx.hash;
  }

  // ─── Upgrade ─────────────────────────────────────────────────────────────────

  /**
   * Perform a diamond upgrade (add/replace/remove).
   *
   * @param diamondAddress - Deployed Diamond address
   * @param facets - Names of facets to upgrade (matched against config)
   * @param action - FacetCutAction: Add | Replace | Remove
   */
  async performUpgrade(
    diamondAddress: string,
    facetNames: string[],
    action: FacetCutAction
  ): Promise<string[]> {
    const txHashes: string[] = [];
    const cuts: FacetCut[] = [];

    for (const facetName of facetNames) {
      const facetConfig = this.config.facets.find((f) => f.name === facetName);
      if (!facetConfig) {
        throw new Error(`Facet "${facetName}" not found in config`);
      }

      let address = "0x0000000000000000000000000000000000000000";
      let selectors: string[] = [];

      if (action !== FacetCutAction.Remove) {
        address = await this.deployFacet(facetConfig);
        const artifact = await loadArtifact(
          this.config.diamond.artifactsDir,
          facetConfig.contract
        );
        selectors =
          facetConfig.selectors === "auto"
            ? extractSelectors(artifact.abi)
            : facetConfig.selectors;
      } else {
        // For remove, get current selectors from chain
        const loupe = new Contract(diamondAddress, LOUPE_ABI, this.provider);
        const onChainFacets: OnChainFacet[] = await loupe.facets();
        // We need the current address for this facet's selectors
        const artifact = await loadArtifact(
          this.config.diamond.artifactsDir,
          facetConfig.contract
        );
        const expected = extractSelectors(artifact.abi);
        const match = onChainFacets.find((f) =>
          f.functionSelectors.some((s) => expected.includes(s))
        );
        selectors = match?.functionSelectors ?? expected;
      }

      cuts.push({ facetAddress: address, action, functionSelectors: selectors });
    }

    const diamond = new Contract(diamondAddress, DIAMOND_CUT_ABI, this.signer);
    const tx = await diamond.diamondCut(
      cuts,
      "0x0000000000000000000000000000000000000000",
      "0x"
    );
    const receipt = await tx.wait(this.confirmations);
    txHashes.push(receipt?.hash ?? tx.hash);

    return txHashes;
  }

  // ─── Deployment Verification ─────────────────────────────────────────────────

  /**
   * Query DiamondLoupe and verify that all configured facets exist on-chain
   * with the expected selectors.
   */
  async verifyDeployment(diamondAddress: string): Promise<boolean> {
    const loupe = new Contract(diamondAddress, LOUPE_ABI, this.provider);
    const onChainFacets: OnChainFacet[] = await loupe.facets();

    let allValid = true;

    for (const facetConfig of this.config.facets) {
      const artifact = await loadArtifact(
        this.config.diamond.artifactsDir,
        facetConfig.contract
      );

      const expectedSelectors =
        facetConfig.selectors === "auto"
          ? extractSelectors(artifact.abi)
          : facetConfig.selectors;

      const onChain = onChainFacets.find((f) =>
        f.functionSelectors.some((s) => expectedSelectors.includes(s))
      );

      if (!onChain) {
        allValid = false;
        continue;
      }

      const missing = expectedSelectors.filter(
        (s) => !onChain.functionSelectors.includes(s)
      );
      if (missing.length > 0) {
        allValid = false;
      }
    }

    return allValid;
  }

  /** Query DiamondLoupe to get on-chain facet state. */
  async getOnChainFacets(diamondAddress: string): Promise<OnChainFacet[]> {
    const loupe = new Contract(diamondAddress, LOUPE_ABI, this.provider);
    return loupe.facets();
  }

  /** Get the owner of the Diamond. */
  async getOwner(diamondAddress: string): Promise<string> {
    const diamond = new Contract(diamondAddress, OWNERSHIP_ABI, this.provider);
    return diamond.owner();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Resolve selectors for a facet config (auto or explicit). */
  async resolveSelectors(facet: FacetConfig): Promise<string[]> {
    if (facet.selectors !== "auto") {
      return facet.selectors;
    }
    const artifact = await loadArtifact(
      this.config.diamond.artifactsDir,
      facet.contract
    );
    return extractSelectors(artifact.abi);
  }

  private _applyMultiplier(gas: bigint): bigint {
    return BigInt(Math.floor(Number(gas) * this.gasMultiplier));
  }
}
