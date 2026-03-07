import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { loadConfig } from "../src/config.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CONFIG = `
diamond:
  name: "TestDiamond"
  artifactsDir: "./artifacts"

networks:
  localhost:
    rpc: "http://127.0.0.1:8545"
    chainId: 31337
    accounts:
      mnemonic: "test test test test test test test test test test test junk"

facets:
  - name: "DiamondCutFacet"
    contract: "DiamondCutFacet"
    selectors: "auto"
  - name: "OwnershipFacet"
    contract: "OwnershipFacet"
    selectors: "auto"

settings:
  gasMultiplier: 1.3
  confirmations: 1
  reportDir: "./deployments"
`;

const MINIMAL_CONFIG = `
diamond:
  name: "Minimal"
  artifactsDir: "./out"
networks:
  test:
    rpc: "http://localhost:8545"
    chainId: 1337
facets:
  - name: "CutFacet"
    contract: "CutFacet"
    selectors: "auto"
`;

const ENV_VAR_CONFIG = `
diamond:
  name: "EnvDiamond"
  artifactsDir: "./artifacts"
networks:
  mainnet:
    rpc: "\${TEST_RPC_URL}"
    chainId: 1
    accounts:
      privateKey: "\${TEST_PRIVATE_KEY}"
facets:
  - name: "CutFacet"
    contract: "CutFacet"
    selectors: "auto"
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

async function writeTmpConfig(content: string): Promise<string> {
  const filePath = path.join(tmpDir, "diamond.config.yaml");
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "diamond-test-"));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
    vi.restoreAllMocks();
  });

  it("parses a valid YAML config", async () => {
    const configPath = await writeTmpConfig(VALID_CONFIG);
    const config = await loadConfig(configPath);

    expect(config.diamond.name).toBe("TestDiamond");
    expect(config.diamond.artifactsDir).toBe("./artifacts");
    expect(config.networks).toHaveProperty("localhost");
    expect(config.networks["localhost"]!.chainId).toBe(31337);
    expect(config.facets).toHaveLength(2);
    expect(config.facets[0]!.name).toBe("DiamondCutFacet");
  });

  it("applies default settings when settings section is omitted", async () => {
    const configPath = await writeTmpConfig(MINIMAL_CONFIG);
    const config = await loadConfig(configPath);

    expect(config.settings.gasMultiplier).toBe(1.2);
    expect(config.settings.confirmations).toBe(2);
    expect(config.settings.reportDir).toBe("./deployments");
  });

  it("preserves custom settings", async () => {
    const configPath = await writeTmpConfig(VALID_CONFIG);
    const config = await loadConfig(configPath);

    expect(config.settings.gasMultiplier).toBe(1.3);
    expect(config.settings.confirmations).toBe(1);
  });

  it("resolves environment variable placeholders", async () => {
    process.env["TEST_RPC_URL"] = "https://mainnet.example.com";
    process.env["TEST_PRIVATE_KEY"] = "0xdeadbeef";

    const configPath = await writeTmpConfig(ENV_VAR_CONFIG);
    const config = await loadConfig(configPath);

    expect(config.networks["mainnet"]!.rpc).toBe("https://mainnet.example.com");
    expect(config.networks["mainnet"]!.accounts?.privateKey).toBe("0xdeadbeef");

    delete process.env["TEST_RPC_URL"];
    delete process.env["TEST_PRIVATE_KEY"];
  });

  it("throws if config file does not exist", async () => {
    await expect(loadConfig("/nonexistent/path/diamond.config.yaml")).rejects.toThrow(
      "Config file not found"
    );
  });

  it("throws on invalid YAML", async () => {
    const filePath = path.join(tmpDir, "diamond.config.yaml");
    await fs.writeFile(filePath, "{ invalid: yaml: [\n  unclosed", "utf8");
    await expect(loadConfig(filePath)).rejects.toThrow("Failed to parse config file");
  });

  it("throws if diamond section is missing", async () => {
    const filePath = path.join(tmpDir, "diamond.config.yaml");
    await fs.writeFile(
      filePath,
      "networks:\n  test:\n    rpc: http://x\n    chainId: 1\nfacets: []\n",
      "utf8"
    );
    await expect(loadConfig(filePath)).rejects.toThrow("diamond");
  });

  it("throws if networks section is missing", async () => {
    const filePath = path.join(tmpDir, "diamond.config.yaml");
    await fs.writeFile(
      filePath,
      "diamond:\n  name: X\n  artifactsDir: ./a\nfacets: []\n",
      "utf8"
    );
    await expect(loadConfig(filePath)).rejects.toThrow("networks");
  });

  it("throws if facets is not an array", async () => {
    const filePath = path.join(tmpDir, "diamond.config.yaml");
    await fs.writeFile(
      filePath,
      "diamond:\n  name: X\n  artifactsDir: ./a\nnetworks:\n  t:\n    rpc: http://x\n    chainId: 1\nfacets:\n  bad: true\n",
      "utf8"
    );
    await expect(loadConfig(filePath)).rejects.toThrow("facets");
  });

  it("throws for unresolved environment variable", async () => {
    delete process.env["UNSET_VAR_12345"];
    const filePath = path.join(tmpDir, "diamond.config.yaml");
    await fs.writeFile(
      filePath,
      `diamond:\n  name: X\n  artifactsDir: ./a\nnetworks:\n  t:\n    rpc: "\${UNSET_VAR_12345}"\n    chainId: 1\nfacets:\n  - name: F\n    contract: F\n    selectors: auto\n`,
      "utf8"
    );
    await expect(loadConfig(filePath)).rejects.toThrow("UNSET_VAR_12345");
  });

  it("correctly loads facet selectors (auto and explicit)", async () => {
    const filePath = path.join(tmpDir, "diamond.config.yaml");
    await fs.writeFile(
      filePath,
      `diamond:\n  name: X\n  artifactsDir: ./a\nnetworks:\n  t:\n    rpc: http://x\n    chainId: 1\nfacets:\n  - name: F1\n    contract: F1\n    selectors: auto\n  - name: F2\n    contract: F2\n    selectors:\n      - "0x12345678"\n      - "0xabcdef01"\n`,
      "utf8"
    );
    const config = await loadConfig(filePath);
    expect(config.facets[0]!.selectors).toBe("auto");
    expect(config.facets[1]!.selectors).toEqual(["0x12345678", "0xabcdef01"]);
  });
});
