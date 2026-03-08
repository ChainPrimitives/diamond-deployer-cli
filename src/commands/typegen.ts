import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import { execSync } from "child_process";
import { loadConfig } from "../config.js";
import { loadArtifact } from "../utils.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AbiItem {
  type: string;
  name?: string;
  inputs?: AbiParam[];
  outputs?: AbiParam[];
  stateMutability?: string;
  anonymous?: boolean;
}

interface AbiParam {
  name: string;
  type: string;
  components?: AbiParam[];
  indexed?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a deduplication key for an ABI item.
 * Functions & errors → keyed by name + input types.
 * Events → keyed by name + input types + indexed flags.
 * Fallback/receive → keyed by type only (only one allowed).
 */
function abiKey(item: AbiItem): string {
  if (item.type === "fallback" || item.type === "receive") {
    return item.type;
  }
  const params = (item.inputs ?? [])
    .map((p) => `${p.type}${p.indexed ? "!" : ""}`)
    .join(",");
  return `${item.type}:${item.name ?? ""}(${params})`;
}

/**
 * Merge multiple ABI arrays into one, deduplicating by signature key.
 * Items from earlier facets take precedence (first-in-wins per EIP-2535).
 */
export function mergeAbis(abis: AbiItem[][]): AbiItem[] {
  const seen = new Set<string>();
  const merged: AbiItem[] = [];

  for (const abi of abis) {
    for (const item of abi) {
      const key = abiKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  }

  return merged;
}

// ─── Command ─────────────────────────────────────────────────────────────────

export async function typegenCommand(options: {
  config: string;
  output: string;
  target: string;
  noTypechain: boolean;
}): Promise<void> {
  const spinner = ora("Loading Diamond config…").start();

  try {
    // ── 1. Load config ─────────────────────────────────────────────────────
    const config = await loadConfig(options.config);
    spinner.text = "Merging facet ABIs…";

    const artifactsDir = path.resolve(config.diamond.artifactsDir);
    const facetNames = config.facets.map((f) => f.name);

    // ── 2. Collect ABIs from each facet ────────────────────────────────────
    const abis: AbiItem[][] = [];
    const loadedFacets: string[] = [];
    const skippedFacets: string[] = [];

    for (const facet of config.facets) {
      try {
        const artifact = await loadArtifact(artifactsDir, facet.contract);
        if (Array.isArray(artifact.abi) && artifact.abi.length > 0) {
          abis.push(artifact.abi as AbiItem[]);
          loadedFacets.push(facet.name);
        } else {
          skippedFacets.push(facet.name);
        }
      } catch {
        skippedFacets.push(facet.name);
      }
    }

    if (abis.length === 0) {
      spinner.fail(chalk.red("No facet ABIs found — make sure contracts are compiled first."));
      console.log(chalk.dim(`  Looked in: ${artifactsDir}`));
      process.exit(1);
    }

    // ── 3. Merge ABIs ──────────────────────────────────────────────────────
    const mergedAbi = mergeAbis(abis);

    // ── 4. Write merged ABI ────────────────────────────────────────────────
    await fs.ensureDir(options.output);
    const abiOutPath = path.join(options.output, "Diamond.abi.json");
    await fs.writeJson(abiOutPath, mergedAbi, { spaces: 2 });

    spinner.succeed(chalk.green(`Merged ABI written → ${abiOutPath}`));

    // ── 5. Summary ─────────────────────────────────────────────────────────
    console.log();
    console.log(chalk.bold("  Diamond ABI"));
    console.log(chalk.dim(`  Diamond:  ${config.diamond.name}`));
    console.log(chalk.dim(`  Facets:   ${loadedFacets.length} / ${facetNames.length} loaded`));
    console.log(chalk.dim(`  Items:    ${mergedAbi.length} total (functions + events + errors)`));

    const fnCount = mergedAbi.filter((i) => i.type === "function").length;
    const evCount = mergedAbi.filter((i) => i.type === "event").length;
    const errCount = mergedAbi.filter((i) => i.type === "error").length;

    console.log(chalk.dim(`  ├── ${fnCount} function(s)`));
    console.log(chalk.dim(`  ├── ${evCount} event(s)`));
    console.log(chalk.dim(`  └── ${errCount} error(s)`));

    if (skippedFacets.length > 0) {
      console.log();
      console.log(chalk.yellow(`  ⚠  Skipped (not compiled or ABI not found):`));
      for (const name of skippedFacets) {
        console.log(chalk.yellow(`     − ${name}`));
      }
    }

    // ── 6. Run TypeChain (optional) ────────────────────────────────────────
    if (!options.noTypechain) {
      console.log();
      const typeChainSpinner = ora(`Generating TypeScript types with typechain (target: ${options.target})…`).start();

      // Detect typechain binary — prefer local, fall back to npx
      let typeChainBin = "npx typechain";
      try {
        execSync("npx typechain --version 2>&1", { stdio: "ignore" });
      } catch {
        typeChainBin = "npx typechain";
      }

      const cmd = `${typeChainBin} --target ${options.target} --out-dir ${options.output} "${abiOutPath}"`;

      try {
        execSync(cmd, { stdio: "pipe" });
        typeChainSpinner.succeed(chalk.green(`TypeScript types written → ${options.output}/`));
        console.log(chalk.dim(`  Command: ${cmd}`));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        typeChainSpinner.warn(chalk.yellow("TypeChain not installed — skipping type generation."));
        console.log();
        console.log(chalk.dim("  To generate types, install TypeChain and run:"));
        console.log(chalk.cyan(`  npx typechain --target ${options.target} --out-dir ${options.output} "${abiOutPath}"`));
        if (process.env["DEBUG"]) console.log(chalk.dim(msg));
      }
    } else {
      console.log();
      console.log(chalk.dim("  To generate types from the merged ABI, run:"));
      console.log(chalk.cyan(`  npx typechain --target ${options.target} --out-dir ${options.output} "${abiOutPath}"`));
    }

    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red(`typegen failed: ${msg}`));
    process.exit(1);
  }
}
