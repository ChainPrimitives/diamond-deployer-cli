import chalk from "chalk";
import ora from "ora";
import { loadConfig } from "../config.js";
import { DiamondDeployer } from "../deployer.js";
import type { OnChainFacet } from "../types.js";

export async function statusCommand(options: {
  network: string;
  address: string;
  config: string;
}): Promise<void> {
  const config = await loadConfig(options.config);
  const network = config.networks[options.network];

  if (!network) {
    console.error(
      chalk.red(
        `\n❌ Network "${options.network}" not found in config.\n` +
          `   Available: ${Object.keys(config.networks).join(", ")}\n`
      )
    );
    process.exit(1);
  }

  console.log(chalk.blue.bold(`\n🔷 Diamond Status — ${options.address}`));
  console.log(chalk.gray(`  Network: ${options.network} (chainId: ${network.chainId})\n`));

  const deployer = new DiamondDeployer(config, network);

  // ── Query on-chain state ────────────────────────────────────────────────────
  const spinner = ora("Querying on-chain facets...").start();
  let facets: OnChainFacet[];
  try {
    facets = await deployer.getOnChainFacets(options.address);
    spinner.succeed(chalk.green(`Found ${facets.length} facets`));
  } catch (err: unknown) {
    spinner.fail(chalk.red("Failed to query Diamond"));
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exit(1);
  }

  // ── Display ────────────────────────────────────────────────────────────────
  let totalSelectors = 0;

  console.log();
  for (let i = 0; i < facets.length; i++) {
    const facet = facets[i]!;
    const selCount = facet.functionSelectors.length;
    totalSelectors += selCount;

    // Try to match with config name
    const configFacet = config.facets.find(() => false); // placeholder
    const label = `Facet #${i + 1}`;

    console.log(
      `  ${chalk.cyan(facet.facetAddress)}  ${chalk.gray(`(${label})`)}`
    );
    console.log(
      chalk.gray(`    Selectors: ${selCount}`)
    );

    for (const sel of facet.functionSelectors) {
      console.log(chalk.gray(`      ${sel}`));
    }
    console.log();
  }

  // ── Owner ───────────────────────────────────────────────────────────────────
  try {
    const owner = await deployer.getOwner(options.address);
    console.log(chalk.gray(`  Owner:     ${owner}`));
  } catch {
    // OwnershipFacet may not be installed
  }

  console.log(
    chalk.gray(
      `  Total:     ${facets.length} facet(s), ${totalSelectors} selector(s)\n`
    )
  );
}
