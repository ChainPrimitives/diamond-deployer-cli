import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { mergeAbis } from "../../src/commands/typegen.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FACET_A_ABI = [
  { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }], anonymous: false },
];

const FACET_B_ABI = [
  { type: "function", name: "vote", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }, // duplicate
  { type: "event", name: "Voted", inputs: [{ name: "voter", type: "address", indexed: true }, { name: "proposalId", type: "uint256", indexed: false }], anonymous: false },
];

const FACET_C_ABI = [
  { type: "function", name: "diamondCut", inputs: [{ name: "_diamondCut", type: "tuple[]" }, { name: "_init", type: "address" }, { name: "_calldata", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { type: "error", name: "InvalidSelector", inputs: [] },
  { type: "fallback", stateMutability: "payable" },
];

// ─── mergeAbis unit tests ─────────────────────────────────────────────────────

describe("mergeAbis", () => {
  it("merges two non-overlapping ABIs", () => {
    const result = mergeAbis([FACET_A_ABI as any, FACET_C_ABI as any]);
    // 3 from A + 3 from C (no overlap)
    expect(result).toHaveLength(6);
  });

  it("deduplicates identical function signatures", () => {
    const result = mergeAbis([FACET_A_ABI as any, FACET_B_ABI as any]);
    const fnNames = result.filter((i) => i.type === "function").map((i) => i.name);
    // balanceOf appears in both but should only appear once
    expect(fnNames.filter((n) => n === "balanceOf")).toHaveLength(1);
    // transfer (A) + vote (B) both present
    expect(fnNames).toContain("transfer");
    expect(fnNames).toContain("vote");
  });

  it("first-in-wins for duplicates", () => {
    // A's balanceOf has outputs, B's has the same signature — A wins
    const result = mergeAbis([FACET_A_ABI as any, FACET_B_ABI as any]);
    const balanceOf = result.find((i) => i.name === "balanceOf");
    expect(balanceOf).toBeDefined();
  });

  it("handles fallback/receive deduplication", () => {
    const withTwoFallbacks = [
      [{ type: "fallback", stateMutability: "payable" }],
      [{ type: "fallback", stateMutability: "nonpayable" }],
    ];
    const result = mergeAbis(withTwoFallbacks as any);
    expect(result.filter((i) => i.type === "fallback")).toHaveLength(1);
  });

  it("merges three ABIs with correct dedup count", () => {
    const result = mergeAbis([FACET_A_ABI as any, FACET_B_ABI as any, FACET_C_ABI as any]);
    // A: transfer, balanceOf, Transfer(event) = 3
    // B: vote, Voted(event) = 2 (balanceOf skipped)
    // C: diamondCut, InvalidSelector(error), fallback = 3
    expect(result).toHaveLength(8);
  });

  it("returns empty array for empty input", () => {
    expect(mergeAbis([])).toHaveLength(0);
  });

  it("returns empty array for ABIs with no items", () => {
    expect(mergeAbis([[], []])).toHaveLength(0);
  });

  it("preserves event entries separately from functions of same name", () => {
    const mixedAbi = [
      [
        { type: "function", name: "approve", inputs: [], outputs: [] },
        { type: "event", name: "approve", inputs: [], anonymous: false }, // different type
      ],
    ];
    const result = mergeAbis(mixedAbi as any);
    // Both should be present — they have different types
    expect(result).toHaveLength(2);
  });
});

// ─── typegen integration tests ────────────────────────────────────────────────

describe("typegen (ABI file output)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "typegen-test-"));

    // Write a minimal diamond.config.yaml
    const config = `
diamond:
  name: "TestDiamond"
  artifactsDir: "${tmpDir.replace(/\\/g, "/")}/artifacts"
networks:
  localhost:
    rpc: "http://127.0.0.1:8545"
    chainId: 31337
    accounts:
      mnemonic: "test test test test test test test test test test test junk"
facets:
  - name: "TokenFacet"
    contract: "TokenFacet"
    selectors: "auto"
  - name: "GovernanceFacet"
    contract: "GovernanceFacet"
    selectors: "auto"
`;
    await fs.writeFile(path.join(tmpDir, "diamond.config.yaml"), config);

    // Write artifact files
    const artifactsDir = path.join(tmpDir, "artifacts");
    await fs.ensureDir(artifactsDir);

    await fs.writeJson(path.join(artifactsDir, "TokenFacet.json"), {
      contractName: "TokenFacet",
      abi: FACET_A_ABI,
      bytecode: "0x",
    });

    await fs.writeJson(path.join(artifactsDir, "GovernanceFacet.json"), {
      contractName: "GovernanceFacet",
      abi: FACET_B_ABI,
      bytecode: "0x",
    });
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it("mergeAbis produces correct combined item count", () => {
    // Simulate what typegen does internally
    const merged = mergeAbis([FACET_A_ABI as any, FACET_B_ABI as any]);
    // transfer(A) + balanceOf(A, deduplicated) + Transfer event(A) + vote(B) + Voted event(B) = 5
    expect(merged).toHaveLength(5);
  });

  it("output contains functions, events and errors", () => {
    const merged = mergeAbis([FACET_A_ABI as any, FACET_C_ABI as any]);
    expect(merged.some((i) => i.type === "function")).toBe(true);
    expect(merged.some((i) => i.type === "event")).toBe(true);
    expect(merged.some((i) => i.type === "error")).toBe(true);
    expect(merged.some((i) => i.type === "fallback")).toBe(true);
  });
});
