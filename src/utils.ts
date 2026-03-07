import path from "path";
import fs from "fs-extra";
import {
  JsonRpcProvider,
  Wallet,
  HDNodeWallet,
  Interface,
  FunctionFragment,
} from "ethers";
import type {
  NetworkConfig,
  DiamondArtifact,
  AbiFragment,
} from "./types.js";

// ─── Environment Variable Resolution ─────────────────────────────────────────

/**
 * Replaces `${VAR_NAME}` patterns in a string with values from process.env.
 * Throws if a referenced variable is not set.
 */
export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
    const resolved = process.env[varName];
    if (resolved === undefined) {
      throw new Error(
        `Environment variable "${varName}" is not set (referenced as "${match}")`
      );
    }
    return resolved;
  });
}

/**
 * Recursively walk an object and resolve env vars in all string values.
 */
export function resolveEnvVarsDeep<T>(obj: T): T {
  if (typeof obj === "string") {
    return resolveEnvVars(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVarsDeep) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as object)) {
      result[key] = resolveEnvVarsDeep(val);
    }
    return result as T;
  }
  return obj;
}

// ─── Provider / Signer ───────────────────────────────────────────────────────

/** Build an ethers JsonRpcProvider from a network config. */
export function getProvider(network: NetworkConfig): JsonRpcProvider {
  const rpc = network.rpc.startsWith("${")
    ? resolveEnvVars(network.rpc)
    : network.rpc;
  return new JsonRpcProvider(rpc, network.chainId);
}

/** Build a Wallet signer from a network config's accounts section. */
export function getSigner(
  network: NetworkConfig,
  provider: JsonRpcProvider
): Wallet | HDNodeWallet {
  const accounts = network.accounts;
  if (!accounts) {
    throw new Error(
      "No accounts configured for network — set privateKey or mnemonic"
    );
  }

  if (accounts.privateKey) {
    const pk = resolveEnvVars(accounts.privateKey);
    return new Wallet(pk, provider);
  }

  if (accounts.mnemonic) {
    const mnemonic = resolveEnvVars(accounts.mnemonic);
    return HDNodeWallet.fromPhrase(mnemonic).connect(provider);
  }

  throw new Error(
    "Network accounts must have either privateKey or mnemonic configured"
  );
}

// ─── Artifact Loading ─────────────────────────────────────────────────────────

/**
 * Load a Hardhat-style or Foundry-style compiled contract artifact.
 * Hardhat: <artifactsDir>/<Contract>.sol/<Contract>.json
 * Foundry: <artifactsDir>/<Contract>.sol/<Contract>.json (same path)
 * Falls back to flat: <artifactsDir>/<Contract>.json
 */
export async function loadArtifact(
  artifactsDir: string,
  contractName: string
): Promise<DiamondArtifact> {
  // Try Hardhat/Foundry nested path
  const nestedPath = path.join(
    artifactsDir,
    `${contractName}.sol`,
    `${contractName}.json`
  );
  if (await fs.pathExists(nestedPath)) {
    return fs.readJson(nestedPath) as Promise<DiamondArtifact>;
  }

  // Try flat path
  const flatPath = path.join(artifactsDir, `${contractName}.json`);
  if (await fs.pathExists(flatPath)) {
    return fs.readJson(flatPath) as Promise<DiamondArtifact>;
  }

  throw new Error(
    `Artifact not found for "${contractName}" — searched:\n` +
      `  ${nestedPath}\n` +
      `  ${flatPath}\n` +
      `Ensure the contracts are compiled before running diamond deploy.`
  );
}

// ─── Selector Extraction ──────────────────────────────────────────────────────

/**
 * Extract all 4-byte function selectors from an ABI array.
 * Filters to only function fragments (excludes events, errors, constructors).
 */
export function extractSelectors(abi: AbiFragment[]): string[] {
  const iface = new Interface(abi as unknown as string[]);
  const selectors: string[] = [];

  for (const fragment of iface.fragments) {
    if (fragment instanceof FunctionFragment) {
      selectors.push(iface.getFunction(fragment.name)!.selector);
    }
  }

  return selectors;
}

/**
 * Format selectors for display: deduplicated and sorted.
 */
export function formatSelectors(selectors: string[]): string[] {
  return [...new Set(selectors)].sort();
}

// ─── Path / File Helpers ──────────────────────────────────────────────────────

/** Ensure a directory exists, creating it recursively if needed. */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

/** Format an Ethereum address with truncation for display. */
export function formatAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Format a bigint gas value into a human-readable string. */
export function formatGas(gas: bigint): string {
  return gas.toLocaleString("en-US");
}

/** Get a timestamp string suitable for file names. */
export function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split("Z")[0]!;
}

/** Pad a selector to 10 chars (0x + 8 hex digits). */
export function padSelector(sel: string): string {
  return sel.toLowerCase().padStart(10, "0x");
}
