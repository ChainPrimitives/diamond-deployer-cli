import chalk from "chalk";
import ora from "ora";
import { loadConfig } from "../config.js";
import { DiamondDeployer } from "../deployer.js";
import { FacetCutAction } from "../types.js";

type UpgradeAction = "add" | "replace" | "remove";

export async function upgradeCommand(options: {
  network: string;
  address: string;
  facets: string[];
  action: string;
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

  // Validate action
  const actionStr = options.action.toLowerCase() as UpgradeAction;
  const actionMap: Record<UpgradeAction, FacetCutAction> = {
    add: FacetCutAction.Add,
    replace: FacetCutAction.Replace,
    remove: FacetCutAction.Remove,
  };

  if (!(actionStr in actionMap)) {
    console.error(
      chalk.red(
        `\n❌ Invalid action "${options.action}". Must be: add | replace | remove\n`
      )
    );
    process.exit(1);
  }

  const action = actionMap[actionStr];

  // Validate facet names
  const unknownFacets = options.facets.filter(
    (name) => !config.facets.find((f) => f.name === name)
  );
  if (unknownFacets.length > 0) {
    console.error(
      chalk.red(
        `\n❌ Unknown facets: ${unknownFacets.join(", ")}\n` +
          `   Available: ${config.facets.map((f) => f.name).join(", ")}\n`
      )
    );
    process.exit(1);
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  const actionLabels: Record<FacetCutAction, string> = {
    [FacetCutAction.Add]: "ADD",
    [FacetCutAction.Replace]: "REPLACE",
    [FacetCutAction.Remove]: "REMOVE",
  };
  const actionColors: Record<FacetCutAction, (s: string) => string> = {
    [FacetCutAction.Add]: chalk.green,
    [FacetCutAction.Replace]: chalk.yellow,
    [FacetCutAction.Remove]: chalk.red,
  };

  console.log(chalk.blue.bold(`\n🔷 Diamond Upgrade — ${config.diamond.name}`));
  console.log(chalk.gray(`  Network:  ${options.network} (chainId: ${network.chainId})`));
  console.log(chalk.gray(`  Diamond:  ${options.address}`));
  console.log(
    chalk.gray(
      `  Action:   ${actionColors[action](actionLabels[action])}`
    )
  );
  console.log(chalk.gray(`  Facets:   ${options.facets.join(", ")}\n`));

  const deployer = new DiamondDeployer(config, network);

  // ── Perform upgrade ─────────────────────────────────────────────────────────
  const spinner = ora(`Performing diamondCut (${actionLabels[action]})...`).start();
  try {
    const txHashes = await deployer.performUpgrade(options.address, options.facets, action);
    spinner.succeed(
      chalk.green(
        `diamondCut ${actionLabels[action]} complete — ${options.facets.length} facet(s)`
      )
    );
    for (const hash of txHashes) {
      console.log(chalk.gray(`  tx: ${hash}`));
    }
  } catch (err: unknown) {
    spinner.fail(chalk.red("Upgrade failed"));
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exit(1);
  }

  // ── Post-upgrade verification ───────────────────────────────────────────────
  if (action !== FacetCutAction.Remove) {
    const s2 = ora("Verifying upgraded state...").start();
    try {
      const isValid = await deployer.verifyDeployment(options.address);
      if (isValid) {
        s2.succeed(chalk.green("Post-upgrade verification passed ✓"));
      } else {
        s2.warn(chalk.yellow("Post-upgrade verification: some selectors may be missing"));
      }
    } catch {
      s2.warn(chalk.yellow("Verification skipped"));
    }
  }

  console.log(chalk.green.bold(`\n✅ Upgrade complete!\n`));
}
