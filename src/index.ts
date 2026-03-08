import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { deployCommand } from "./commands/deploy.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { verifyCommand } from "./commands/verify.js";
import { statusCommand } from "./commands/status.js";
import { diffCommand } from "./commands/diff.js";
import { typegenCommand } from "./commands/typegen.js";

const program = new Command();

program
  .name("diamond")
  .description("CLI for EIP-2535 Diamond proxy deployment and management")
  .version("1.1.0");

// ─── Commands ─────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Initialize a new Diamond project config")
  .option("-d, --dir <directory>", "Project directory", ".")
  .option("-f, --force", "Overwrite existing config", false)
  .action(initCommand);

program
  .command("deploy")
  .description("Deploy a new Diamond with all facets")
  .requiredOption("-n, --network <network>", "Target network")
  .option("-c, --config <path>", "Config file path", "diamond.config.yaml")
  .option("--dry-run", "Simulate without sending transactions", false)
  .action(deployCommand);

program
  .command("upgrade")
  .description("Upgrade Diamond — add, replace, or remove facets")
  .requiredOption("-n, --network <network>", "Target network")
  .requiredOption("--address <address>", "Diamond contract address")
  .requiredOption("-f, --facets <facets...>", "Facet names to upgrade")
  .option("-a, --action <action>", "Action: add | replace | remove", "replace")
  .option("-c, --config <path>", "Config file path", "diamond.config.yaml")
  .action(upgradeCommand);

program
  .command("verify")
  .description("Verify on-chain Diamond state matches config")
  .requiredOption("-n, --network <network>", "Target network")
  .requiredOption("--address <address>", "Diamond contract address")
  .option("-c, --config <path>", "Config file path", "diamond.config.yaml")
  .action(verifyCommand);

program
  .command("status")
  .description("Show current Diamond facets and selectors")
  .requiredOption("-n, --network <network>", "Target network")
  .requiredOption("--address <address>", "Diamond contract address")
  .option("-c, --config <path>", "Config file path", "diamond.config.yaml")
  .action(statusCommand);

program
  .command("diff")
  .description("Compare on-chain Diamond state with local config")
  .requiredOption("-n, --network <network>", "Target network")
  .requiredOption("--address <address>", "Diamond contract address")
  .option("-c, --config <path>", "Config file path", "diamond.config.yaml")
  .action(diffCommand);

program
  .command("typegen")
  .description("Merge facet ABIs and generate TypeScript types via TypeChain")
  .option("-c, --config <path>", "Config file path", "diamond.config.yaml")
  .option("-o, --output <dir>", "Output directory for ABI and types", "./typechain-types")
  .option("-t, --target <target>", "TypeChain target (ethers-v6, ethers-v5, viem, web3-v1)", "ethers-v6")
  .option("--no-typechain", "Only output merged ABI, skip TypeChain type generation", false)
  .action(typegenCommand);

// ─── Parse ────────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
});
