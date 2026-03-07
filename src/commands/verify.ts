import chalk from "chalk";
import ora from "ora";
import { loadConfig } from "../config.js";
import { DiamondDeployer } from "../deployer.js";
import { extractSelectors, loadArtifact } from "../utils.js";
import type { OnChainFacet } from "../types.js";

export async function verifyCommand(options: {
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

  console.log(
    chalk.blue.bold(`\n🔍 Verifying Diamond — ${config.diamond.name}`)
  );
  console.log(chalk.gray(`  Network: ${options.network} (chainId: ${network.chainId})`));
  console.log(chalk.gray(`  Address: ${options.address}\n`));

  const deployer = new DiamondDeployer(config, network);

  // ── Query on-chain state ────────────────────────────────────────────────────
  const spinner = ora("Querying on-chain state via DiamondLoupe...").start();
  let onChainFacets: OnChainFacet[];
  try {
    onChainFacets = await deployer.getOnChainFacets(options.address);
    spinner.succeed(
      chalk.green(`Found ${onChainFacets.length} facets on-chain`)
    );
  } catch (err: unknown) {
    spinner.fail(chalk.red("Failed to query Diamond — is the address correct?"));
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exit(1);
  }

  // ── Compare with config ─────────────────────────────────────────────────────
  console.log(chalk.bold("\n  Facet Verification:\n"));

  let allMatch = true;
  let totalExpected = 0;
  let totalVerified = 0;

  for (const facet of config.facets) {
    let artifact;
    try {
      artifact = await loadArtifact(config.diamond.artifactsDir, facet.contract);
    } catch {
      console.log(
        chalk.yellow(
          `  ⚠ ${facet.name.padEnd(30)} artifact not found — skipped`
        )
      );
      continue;
    }

    const expectedSelectors =
      facet.selectors === "auto"
        ? extractSelectors(artifact.abi)
        : facet.selectors;

    totalExpected += expectedSelectors.length;

    // Find matching on-chain facet
    const onChain = onChainFacets.find((f) =>
      f.functionSelectors.some((s) => expectedSelectors.includes(s))
    );

    if (!onChain) {
      console.log(chalk.red(`  ✗ ${facet.name.padEnd(30)} NOT FOUND on-chain`));
      allMatch = false;
      continue;
    }

    const missing = expectedSelectors.filter(
      (s) => !onChain.functionSelectors.includes(s)
    );
    const extra = onChain.functionSelectors.filter(
      (s) => !expectedSelectors.includes(s)
    );

    if (missing.length === 0) {
      totalVerified += expectedSelectors.length;
      const extraNote = extra.length > 0 ? chalk.gray(` (+${extra.length} extra)`) : "";
      console.log(
        chalk.green(
          `  ✓ ${facet.name.padEnd(30)} ${expectedSelectors.length} selectors verified`
        ) + extraNote
      );
      console.log(chalk.gray(`    → ${onChain.facetAddress}`));
    } else {
      totalVerified += expectedSelectors.length - missing.length;
      console.log(
        chalk.red(
          `  ✗ ${facet.name.padEnd(30)} ${missing.length} selector(s) MISSING`
        )
      );
      console.log(chalk.gray(`    → ${onChain.facetAddress}`));
      for (const sel of missing) {
        console.log(chalk.red(`      missing: ${sel}`));
      }
      allMatch = false;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log();
  console.log(
    chalk.gray(
      `  Summary: ${totalVerified}/${totalExpected} selectors verified across ${config.facets.length} facets`
    )
  );

  if (allMatch) {
    console.log(chalk.green.bold("\n✅ All facets verified successfully!\n"));
  } else {
    console.log(
      chalk.red.bold(
        "\n❌ Verification failed — some facets missing or selectors mismatched\n"
      )
    );
    process.exit(1);
  }
}
