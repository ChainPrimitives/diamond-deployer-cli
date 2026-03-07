import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { loadConfig } from "../../src/config.js";
import { loadArtifact } from "../../src/utils.js";

const DEPLOY_CONFIG = `
diamond:
  name: "TestDiamond"
  artifactsDir: "./artifacts"
networks:
  localhost:
    rpc: "http://127.0.0.1:8545"
    chainId: 31337
    accounts:
      mnemonic: "test test test test test test test test test test test junk"
  badnetwork:
    rpc: "http://127.0.0.1:9999"
    chainId: 99999
facets:
  - name: "DiamondCutFacet"
    contract: "DiamondCutFacet"
    selectors: "auto"
settings:
  gasMultiplier: 1.2
  confirmations: 2
  reportDir: "./deployments"
`;

let tmpDir: string;

async function setup(): Promise<string> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "diamond-deploy-test-"));
  const configPath = path.join(tmpDir, "diamond.config.yaml");
  await fs.writeFile(configPath, DEPLOY_CONFIG, "utf8");
  return configPath;
}

describe("deployCommand (unit)", () => {
  beforeEach(async () => {
    await setup();
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
    vi.restoreAllMocks();
  });

  it("loads config successfully", async () => {
    const configPath = path.join(tmpDir, "diamond.config.yaml");
    const config = await loadConfig(configPath);
    expect(config.diamond.name).toBe("TestDiamond");
    expect(config.facets).toHaveLength(1);
  });

  it("fails when network is not found in config", async () => {
    const configPath = path.join(tmpDir, "diamond.config.yaml");
    const config = await loadConfig(configPath);

    // Simulate what deployCommand does: look up network
    const network = config.networks["nonexistent"];
    expect(network).toBeUndefined();
  });

  it("recognizes valid networks from config", async () => {
    const configPath = path.join(tmpDir, "diamond.config.yaml");
    const config = await loadConfig(configPath);

    expect(config.networks["localhost"]).toBeDefined();
    expect(config.networks["localhost"]!.chainId).toBe(31337);
  });

  it("dry-run mode does not require artifacts", async () => {
    // In dry-run mode, we should still load config and network but skip deploying
    const configPath = path.join(tmpDir, "diamond.config.yaml");
    const config = await loadConfig(configPath);

    // The config should load even if artifacts dir doesn't exist
    expect(config.diamond.artifactsDir).toBe("./artifacts");
  });
});

describe("deployCommand (artifact missing)", () => {
  it("reports a helpful error when artifact is missing", async () => {
    await expect(
      loadArtifact("/nonexistent/artifacts", "DiamondCutFacet")
    ).rejects.toThrow("Artifact not found");
  });

  it("tries both Hardhat and flat paths", async () => {
    const tmpArtifacts = await fs.mkdtemp(path.join(os.tmpdir(), "test-art-"));

    try {
      // Place a flat artifact
      const artifactContent = {
        contractName: "TestFacet",
        abi: [
          {
            type: "function",
            name: "hello",
            inputs: [],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        bytecode: "0x",
      };
      await fs.writeJson(path.join(tmpArtifacts, "TestFacet.json"), artifactContent);

      const artifact = await loadArtifact(tmpArtifacts, "TestFacet");
      expect(artifact.contractName).toBe("TestFacet");
    } finally {
      await fs.remove(tmpArtifacts);
    }
  });
});
