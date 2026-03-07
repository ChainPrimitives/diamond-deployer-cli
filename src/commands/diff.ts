import chalk from "chalk";
import ora from "ora";
import { loadConfig } from "../config.js";
import { DiamondDeployer } from "../deployer.js";
import { extractSelectors, loadArtifact } from "../utils.js";
import type { FacetDiff, OnChainFacet } from "../types.js";

export async function diffCommand(options: {
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

  console.log(chalk.blue.bold(`\n🔀 Diamond Diff — ${config.diamond.name}`));
  console.log(chalk.gray(`  Network: ${options.network} (chainId: ${network.chainId})`));
  console.log(chalk.gray(`  Address: ${options.address}\n`));

  const deployer = new DiamondDeployer(config, network);

  // ── Query on-chain state ────────────────────────────────────────────────────
  const spinner = ora("Fetching on-chain state...").start();
  let onChainFacets: OnChainFacet[];
  try {
    onChainFacets = await deployer.getOnChainFacets(options.address);
    spinner.succeed(chalk.green(`Fetched ${onChainFacets.length} on-chain facets`));
  } catch (err: unknown) {
    spinner.fail(chalk.red("Failed to query Diamond"));
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exit(1);
  }

  // ── Compute diffs ───────────────────────────────────────────────────────────
  const diffs: FacetDiff[] = [];

  // Build flat map of all on-chain selectors → facet
  const onChainSelectorMap = new Map<string, string>(); // selector → facetAddress
  const onChainAddressSet = new Set<string>();
  for (const facet of onChainFacets) {
    onChainAddressSet.add(facet.facetAddress.toLowerCase());
    for (const sel of facet.functionSelectors) {
      onChainSelectorMap.set(sel, facet.facetAddress);
    }
  }

  // Collect all expected selectors from config
  const configSelectorSet = new Set<string>();

  for (const facet of config.facets) {
    let expectedSelectors: string[] = [];

    try {
      const artifact = await loadArtifact(config.diamond.artifactsDir, facet.contract);
      expectedSelectors =
        facet.selectors === "auto"
          ? extractSelectors(artifact.abi)
          : facet.selectors;
    } catch {
      diffs.push({
        name: facet.name,
        status: "missing",
        missingSelectors: [],
        extraSelectors: [],
      });
      continue;
    }

    expectedSelectors.forEach((s) => configSelectorSet.add(s));

    const onChain = onChainFacets.find((f) =>
      f.functionSelectors.some((s) => expectedSelectors.includes(s))
    );

    if (!onChain) {
      diffs.push({
        name: facet.name,
        status: "missing",
        missingSelectors: expectedSelectors,
        extraSelectors: [],
      });
      continue;
    }

    const missingSelectors = expectedSelectors.filter(
      (s) => !onChain.functionSelectors.includes(s)
    );
    const extraSelectors = onChain.functionSelectors.filter(
      (s) => !expectedSelectors.includes(s)
    );

    diffs.push({
      name: facet.name,
      status:
        missingSelectors.length === 0 && extraSelectors.length === 0
          ? "match"
          : "selector_mismatch",
      onChainAddress: onChain.facetAddress,
      missingSelectors,
      extraSelectors,
    });
  }

  // Find on-chain facets not in config (extra facets)
  for (const onChainFacet of onChainFacets) {
    const hasAnyConfigSelector = onChainFacet.functionSelectors.some((s) =>
      configSelectorSet.has(s)
    );
    if (!hasAnyConfigSelector) {
      diffs.push({
        name: `<unknown>`,
        status: "extra",
        onChainAddress: onChainFacet.facetAddress,
        extraSelectors: onChainFacet.functionSelectors,
        missingSelectors: [],
      });
    }
  }

  // ── Display diff ────────────────────────────────────────────────────────────
  const matched = diffs.filter((d) => d.status === "match");
  const missing = diffs.filter((d) => d.status === "missing");
  const mismatched = diffs.filter((d) => d.status === "selector_mismatch");
  const extra = diffs.filter((d) => d.status === "extra");

  const hasChanges = missing.length + mismatched.length + extra.length > 0;

  if (!hasChanges) {
    console.log(chalk.green.bold("✅ No differences — on-chain state matches config\n"));
    console.log(chalk.gray(`  ${matched.length} facet(s) fully in sync`));
    console.log();
    return;
  }

  // ── In sync ─────────────────────────────────────────────────────────────────
  if (matched.length > 0) {
    console.log(chalk.green.bold("  In Sync:"));
    for (const d of matched) {
      console.log(chalk.green(`  ✓ ${d.name.padEnd(30)} ${d.onChainAddress ?? ""}`));
    }
    console.log();
  }

  // ── Missing (in config, not on-chain) ───────────────────────────────────────
  if (missing.length > 0) {
    console.log(chalk.red.bold("  Missing (in config, not on-chain):"));
    for (const d of missing) {
      console.log(chalk.red(`  − ${d.name}`));
      for (const sel of (d.missingSelectors ?? []).slice(0, 5)) {
        console.log(chalk.red(`      ${sel}`));
      }
      if ((d.missingSelectors?.length ?? 0) > 5) {
        console.log(
          chalk.red(
            `      ... and ${(d.missingSelectors?.length ?? 0) - 5} more`
          )
        );
      }
    }
    console.log();
  }

  // ── Selector mismatches ──────────────────────────────────────────────────────
  if (mismatched.length > 0) {
    console.log(chalk.yellow.bold("  Selector Mismatches:"));
    for (const d of mismatched) {
      console.log(chalk.yellow(`  ~ ${d.name.padEnd(30)} ${d.onChainAddress ?? ""}`));
      for (const sel of d.missingSelectors ?? []) {
        console.log(chalk.red(`      - ${sel} (missing from chain)`));
      }
      for (const sel of d.extraSelectors ?? []) {
        console.log(chalk.green(`      + ${sel} (extra on chain)`));
      }
    }
    console.log();
  }

  // ── Extra on-chain (not in config) ──────────────────────────────────────────
  if (extra.length > 0) {
    console.log(chalk.gray.bold("  Extra (on-chain, not in config):"));
    for (const d of extra) {
      console.log(
        chalk.gray(
          `  + <unknown>     ${d.onChainAddress ?? ""}  (${d.extraSelectors?.length ?? 0} selectors)`
        )
      );
    }
    console.log();
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(chalk.bold("  Summary:"));
  console.log(chalk.green(`    ✓ ${matched.length} in sync`));
  if (missing.length) console.log(chalk.red(`    − ${missing.length} missing`));
  if (mismatched.length) console.log(chalk.yellow(`    ~ ${mismatched.length} mismatched`));
  if (extra.length) console.log(chalk.gray(`    + ${extra.length} extra on-chain`));
  console.log();

  if (missing.length + mismatched.length > 0) {
    console.log(
      chalk.yellow(
        "  Hint: run `diamond upgrade` to apply config changes to the Diamond.\n"
      )
    );
  }
}
