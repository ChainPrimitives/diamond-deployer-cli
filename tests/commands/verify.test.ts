import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { extractSelectors, loadArtifact } from "../../src/utils.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** ERC-20 style ABI for testing selector extraction */
const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
];

/** DiamondLoupe ABI for testing */
const LOUPE_ABI = [
  {
    type: "function",
    name: "facets",
    inputs: [],
    outputs: [],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "facetAddresses",
    inputs: [],
    outputs: [],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "facetFunctionSelectors",
    inputs: [{ name: "_facet", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "view",
  },
];

// ─── Selector Extraction Tests ────────────────────────────────────────────────

describe("selector extraction (verify logic)", () => {
  it("extracts correct selectors from ERC-20 ABI", () => {
    const selectors = extractSelectors(ERC20_ABI as any);
    expect(selectors).toContain("0x70a08231"); // balanceOf(address)
    expect(selectors).toContain("0xa9059cbb"); // transfer(address,uint256)
    expect(selectors).toContain("0x095ea7b3"); // approve(address,uint256)
    expect(selectors).toHaveLength(3); // events excluded
  });

  it("extracts DiamondLoupe selectors", () => {
    const selectors = extractSelectors(LOUPE_ABI as any);
    expect(selectors).toHaveLength(3);
    // facets() = 0x7a0ed627
    expect(selectors).toContain("0x7a0ed627");
    // facetAddresses() = 0x52ef6b2c
    expect(selectors).toContain("0x52ef6b2c");
  });
});

// ─── On-chain Comparison Logic ────────────────────────────────────────────────

describe("verify logic (selector matching)", () => {
  it("identifies matching selectors", () => {
    const expected = ["0x70a08231", "0xa9059cbb"];
    const onChain = {
      facetAddress: "0x1234567890123456789012345678901234567890",
      functionSelectors: ["0x70a08231", "0xa9059cbb", "0xdeadbeef"],
    };

    const missing = expected.filter((s) => !onChain.functionSelectors.includes(s));
    expect(missing).toHaveLength(0);
  });

  it("identifies missing selectors", () => {
    const expected = ["0x70a08231", "0xa9059cbb", "0x095ea7b3"];
    const onChain = {
      facetAddress: "0x1234567890123456789012345678901234567890",
      functionSelectors: ["0x70a08231"],
    };

    const missing = expected.filter((s) => !onChain.functionSelectors.includes(s));
    expect(missing).toHaveLength(2);
    expect(missing).toContain("0xa9059cbb");
    expect(missing).toContain("0x095ea7b3");
  });

  it("finds the matching on-chain facet for a given selector set", () => {
    const expectedSelectors = ["0x70a08231", "0xa9059cbb"];
    const onChainFacets = [
      {
        facetAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        functionSelectors: ["0x7a0ed627", "0x52ef6b2c"],
      },
      {
        facetAddress: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        functionSelectors: ["0x70a08231", "0xa9059cbb"],
      },
    ];

    const match = onChainFacets.find((f) =>
      f.functionSelectors.some((s) => expectedSelectors.includes(s))
    );

    expect(match).toBeDefined();
    expect(match!.facetAddress).toBe("0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
  });

  it("returns undefined when facet not found on-chain", () => {
    const expectedSelectors = ["0xdeadbeef"];
    const onChainFacets = [
      {
        facetAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        functionSelectors: ["0x7a0ed627"],
      },
    ];

    const match = onChainFacets.find((f) =>
      f.functionSelectors.some((s) => expectedSelectors.includes(s))
    );

    expect(match).toBeUndefined();
  });
});

// ─── Artifact Loading Tests ───────────────────────────────────────────────────

describe("artifact loading for verify", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "diamond-verify-test-"));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it("loads artifact from Hardhat nested path", async () => {
    const nestedDir = path.join(tmpDir, "TestFacet.sol");
    await fs.ensureDir(nestedDir);
    const artifact = { contractName: "TestFacet", abi: ERC20_ABI, bytecode: "0x" };
    await fs.writeJson(path.join(nestedDir, "TestFacet.json"), artifact);

    const loaded = await loadArtifact(tmpDir, "TestFacet");
    expect(loaded.contractName).toBe("TestFacet");
    expect(loaded.abi).toHaveLength(4);
  });

  it("loads artifact from flat path as fallback", async () => {
    const artifact = { contractName: "FlatFacet", abi: LOUPE_ABI, bytecode: "0x" };
    await fs.writeJson(path.join(tmpDir, "FlatFacet.json"), artifact);

    const loaded = await loadArtifact(tmpDir, "FlatFacet");
    expect(loaded.contractName).toBe("FlatFacet");
  });

  it("throws with helpful message when artifact not found", async () => {
    await expect(
      loadArtifact(tmpDir, "NonExistentFacet")
    ).rejects.toThrow("Artifact not found for");
  });
});
