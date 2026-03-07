import chalk from "chalk";
import ora from "ora";
import { loadConfig } from "../config.js";
import { DiamondDeployer } from "../deployer.js";
import { DeploymentReporter } from "../reporter.js";
import type { DeployedFacet } from "../types.js";
import { extractSelectors, loadArtifact } from "../utils.js";

export async function deployCommand(options: {
  network: string;
  config: string;
  dryRun: boolean;
}): Promise<void> {
  // ── Load config ─────────────────────────────────────────────────────────────
  const config = await loadConfig(options.config);
  const network = config.networks[options.network];

  if (!network) {
    console.error(
      chalk.red(
        `\n❌ Network "${options.network}" not found in config.\n` +
          `   Available networks: ${Object.keys(config.networks).join(", ")}\n`
      )
    );
    process.exit(1);
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  console.log(chalk.blue.bold(`\n🔷 Diamond Deployer — ${config.diamond.name}`));
  console.log(
    chalk.gray(`  Network:    ${options.network} (chainId: ${network.chainId})`)
  );
  console.log(chalk.gray(`  Facets:     ${config.facets.length}`));
  console.log(chalk.gray(`  Artifacts:  ${config.diamond.artifactsDir}`));
  if (options.dryRun) {
    console.log(chalk.yellow.bold(`  Mode:       DRY RUN (no transactions)\n`));
  } else {
    console.log();
  }

  const deployer = new DiamondDeployer(config, network);
  const reporter = new DeploymentReporter(config);

  // ── Step 1: Load artifacts ──────────────────────────────────────────────────
  const spinner1 = ora("Loading facet artifacts...").start();
  try {
    const artifacts = await deployer.loadArtifacts();
    spinner1.succeed(chalk.green(`Loaded ${artifacts.length} facet artifacts`));
  } catch (err: unknown) {
    spinner1.fail(chalk.red(`Failed to load artifacts`));
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exit(1);
  }

  // ── Step 2: Deploy facets ───────────────────────────────────────────────────
  const deployedFacets: DeployedFacet[] = [];
  const txHashes: string[] = [];

  console.log(chalk.bold("\n  Deploying Facets:"));
  for (const facet of config.facets) {
    const spinner = ora(`  Deploying ${facet.name}...`).start();

    if (options.dryRun) {
      spinner.succeed(
        `  ${facet.name.padEnd(30)} ${chalk.yellow(`0x${"0".repeat(40)} (dry run)`)}`
      );
      continue;
    }

    try {
      const address = await deployer.deployFacet(facet);
      const artifact = await loadArtifact(config.diamond.artifactsDir, facet.contract);
      const selectors =
        facet.selectors === "auto"
          ? extractSelectors(artifact.abi)
          : facet.selectors;

      deployedFacets.push({ name: facet.name, contract: facet.contract, address, selectors });
      spinner.succeed(`  ${facet.name.padEnd(30)} ${chalk.cyan(address)}`);
    } catch (err: unknown) {
      spinner.fail(chalk.red(`  ${facet.name} — deployment failed`));
      console.error(chalk.red(`    ${(err as Error).message}`));
      process.exit(1);
    }
  }

  if (options.dryRun) {
    console.log(chalk.yellow.bold("\n  Diamond — dry run, skipped\n"));
    return;
  }

  // ── Step 3: Deploy Diamond ──────────────────────────────────────────────────
  const spinner3 = ora("Deploying Diamond contract...").start();
  let diamondAddress: string;
  try {
    diamondAddress = await deployer.deployDiamond(deployedFacets);
    spinner3.succeed(`Diamond → ${chalk.cyan(diamondAddress)}`);
  } catch (err: unknown) {
    spinner3.fail(chalk.red("Diamond deployment failed"));
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exit(1);
  }

  // ── Step 4: Run init functions ──────────────────────────────────────────────
  const initFacets = config.facets.filter((f) => f.init);
  if (initFacets.length > 0) {
    console.log(chalk.bold("\n  Running Initializers:"));
    for (const facet of initFacets) {
      const s = ora(
        `  ${facet.init!.contract}.${facet.init!.function}()...`
      ).start();
      try {
        const txHash = await deployer.runInit(diamondAddress, facet);
        txHashes.push(txHash);
        s.succeed(`  Initialized ${facet.name}`);
      } catch (err: unknown) {
        s.fail(chalk.red(`  Init failed for ${facet.name}`));
        console.error(chalk.red(`    ${(err as Error).message}`));
        process.exit(1);
      }
    }
  }

  // ── Step 5: Verify on-chain ─────────────────────────────────────────────────
  const s5 = ora("Verifying Diamond state on-chain...").start();
  try {
    const isValid = await deployer.verifyDeployment(diamondAddress);
    if (isValid) {
      s5.succeed(chalk.green("On-chain verification passed ✓"));
    } else {
      s5.fail(chalk.red("Verification failed — some selectors missing"));
    }
  } catch (err: unknown) {
    s5.warn(chalk.yellow(`Verification skipped: ${(err as Error).message}`));
  }

  // ── Step 6: Generate report ────────────────────────────────────────────────
  const reportPath = await reporter.generate({
    network: options.network,
    diamondAddress,
    facets: deployedFacets,
    txHashes,
    timestamp: Date.now(),
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(chalk.green.bold(`\n✅ Deployment complete!\n`));
  console.log(chalk.gray(`   Diamond:  ${diamondAddress}`));
  console.log(chalk.gray(`   Network:  ${options.network}`));
  console.log(chalk.gray(`   Facets:   ${deployedFacets.length}`));
  console.log(chalk.gray(`   Report:   ${reportPath}\n`));
}
