import path from "path";
import fs from "fs-extra";
import chalk from "chalk";

const TEMPLATE_PATH = path.join(__dirname, "../../templates/diamond.config.yaml");
export async function initCommand(options: {
  dir: string;
  force: boolean;
}): Promise<void> {
  const targetDir = path.resolve(options.dir);
  const targetFile = path.join(targetDir, "diamond.config.yaml");

  console.log(chalk.blue.bold("\n🔷 Diamond Deployer CLI — Init\n"));

  // Ensure directory exists
  await fs.ensureDir(targetDir);

  // Check for existing config
  if (await fs.pathExists(targetFile)) {
    if (!options.force) {
      console.log(
        chalk.yellow(
          `  Config already exists at: ${targetFile}\n` +
            `  Use --force to overwrite.\n`
        )
      );
      return;
    }
    console.log(chalk.yellow(`  Overwriting existing config...`));
  }

  // Copy template
  try {
    const templateFile = new URL(TEMPLATE_PATH).pathname.replace(/^\/([A-Z]:)/, "$1");
    await fs.copy(templateFile, targetFile, { overwrite: true });
  } catch {
    // If template file not found, write inline default
    await fs.writeFile(targetFile, DEFAULT_TEMPLATE);
  }

  console.log(chalk.green(`  ✓ Created: ${targetFile}\n`));
  console.log(chalk.gray("  Next steps:"));
  console.log(chalk.gray("    1. Edit diamond.config.yaml with your networks and facets"));
  console.log(chalk.gray("    2. Compile your contracts (npx hardhat compile)"));
  console.log(chalk.gray("    3. Run: diamond deploy -n <network>\n"));
}

// ─── Default Template ─────────────────────────────────────────────────────────

const DEFAULT_TEMPLATE = `# diamond.config.yaml — Diamond Deployer Configuration
# See: https://github.com/your-org/diamond-deployer-cli

diamond:
  name: "MyDiamond"
  # Path to compiled contract artifacts (Hardhat: ./artifacts, Foundry: ./out)
  artifactsDir: "./artifacts"

networks:
  localhost:
    rpc: "http://127.0.0.1:8545"
    chainId: 31337
    accounts:
      mnemonic: "test test test test test test test test test test test junk"

  ethereum:
    rpc: "\${ETH_RPC_URL}"
    chainId: 1
    accounts:
      privateKey: "\${DEPLOYER_PRIVATE_KEY}"

  polygon:
    rpc: "\${POLYGON_RPC_URL}"
    chainId: 137
    accounts:
      privateKey: "\${DEPLOYER_PRIVATE_KEY}"

facets:
  - name: "DiamondCutFacet"
    contract: "DiamondCutFacet"
    selectors: "auto"

  - name: "DiamondLoupeFacet"
    contract: "DiamondLoupeFacet"
    selectors: "auto"

  - name: "OwnershipFacet"
    contract: "OwnershipFacet"
    selectors: "auto"

  # Example facet with initializer:
  # - name: "GovernanceFacet"
  #   contract: "GovernanceFacet"
  #   selectors: "auto"
  #   init:
  #     contract: "GovernanceInit"
  #     function: "init"
  #     args:
  #       - "100"  # quorum
  #       - "3600" # votingPeriod

verification:
  etherscan:
    apiKey: "\${ETHERSCAN_API_KEY}"

settings:
  gasMultiplier: 1.2
  confirmations: 2
  reportDir: "./deployments"
`;
