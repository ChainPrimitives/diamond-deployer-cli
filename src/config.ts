import path from "path";
import fs from "fs-extra";
import { parse as parseYaml } from "yaml";
import type { DiamondConfig, DiamondSettings } from "./types.js";
import { resolveEnvVarsDeep } from "./utils.js";

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: DiamondSettings = {
  gasMultiplier: 1.2,
  confirmations: 2,
  reportDir: "./deployments",
};

// ─── Config Loader ────────────────────────────────────────────────────────────

/**
 * Load and parse a diamond.config.yaml file.
 *
 * - Resolves ${VAR} environment variable placeholders in string values.
 * - Applies default settings where omitted.
 * - Validates required fields and throws descriptive errors.
 */
export async function loadConfig(configPath: string): Promise<DiamondConfig> {
  const resolved = path.resolve(configPath);

  if (!(await fs.pathExists(resolved))) {
    throw new Error(
      `Config file not found: ${resolved}\n` +
        `Run "diamond init" to create a diamond.config.yaml in this directory.`
    );
  }

  const raw = await fs.readFile(resolved, "utf8");

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse config file: ${msg}`);
  }

  validateConfig(parsed, resolved);

  // Resolve env vars before returning
  const config = resolveEnvVarsDeep(parsed) as DiamondConfig;

  // Apply defaults
  config.settings = {
    ...DEFAULT_SETTINGS,
    ...(config.settings ?? {}),
  };

  return config;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateConfig(raw: Record<string, unknown>, filePath: string): void {
  const errors: string[] = [];

  // diamond section
  if (!raw.diamond || typeof raw.diamond !== "object") {
    errors.push("Missing required section: diamond");
  } else {
    const diamond = raw.diamond as Record<string, unknown>;
    if (!diamond.name || typeof diamond.name !== "string") {
      errors.push("diamond.name is required and must be a string");
    }
    if (!diamond.artifactsDir || typeof diamond.artifactsDir !== "string") {
      errors.push("diamond.artifactsDir is required and must be a string");
    }
  }

  // networks section
  if (!raw.networks || typeof raw.networks !== "object") {
    errors.push("Missing required section: networks");
  } else {
    const networks = raw.networks as Record<string, unknown>;
    for (const [name, net] of Object.entries(networks)) {
      if (!net || typeof net !== "object") {
        errors.push(`networks.${name} must be an object`);
        continue;
      }
      const n = net as Record<string, unknown>;
      if (!n.rpc || typeof n.rpc !== "string") {
        errors.push(`networks.${name}.rpc is required and must be a string`);
      }
      if (typeof n.chainId !== "number") {
        errors.push(`networks.${name}.chainId is required and must be a number`);
      }
    }
  }

  // facets section
  if (!Array.isArray(raw.facets)) {
    errors.push("Missing required section: facets (must be an array)");
  } else {
    raw.facets.forEach((facet: unknown, i: number) => {
      if (!facet || typeof facet !== "object") {
        errors.push(`facets[${i}] must be an object`);
        return;
      }
      const f = facet as Record<string, unknown>;
      if (!f.name || typeof f.name !== "string") {
        errors.push(`facets[${i}].name is required`);
      }
      if (!f.contract || typeof f.contract !== "string") {
        errors.push(`facets[${i}].contract is required`);
      }
    });
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid config file: ${filePath}\n` +
        errors.map((e) => `  • ${e}`).join("\n")
    );
  }
}
