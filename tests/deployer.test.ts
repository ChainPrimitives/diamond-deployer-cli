import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveEnvVars,
  resolveEnvVarsDeep,
  extractSelectors,
  formatAddress,
  formatGas,
  getTimestamp,
} from "../src/utils.js";

// ─── resolveEnvVars ───────────────────────────────────────────────────────────

describe("resolveEnvVars", () => {
  beforeEach(() => {
    process.env["TEST_VAR"] = "hello";
    process.env["ANOTHER_VAR"] = "world";
  });

  it("resolves a single env var", () => {
    expect(resolveEnvVars("\${TEST_VAR}")).toBe("hello");
  });

  it("resolves multiple env vars in one string", () => {
    expect(resolveEnvVars("\${TEST_VAR} \${ANOTHER_VAR}")).toBe("hello world");
  });

  it("leaves non-env-var strings unchanged", () => {
    expect(resolveEnvVars("http://localhost:8545")).toBe("http://localhost:8545");
  });

  it("throws for unset environment variables", () => {
    delete process.env["UNSET_XYZ"];
    expect(() => resolveEnvVars("\${UNSET_XYZ}")).toThrow("UNSET_XYZ");
  });
});

// ─── resolveEnvVarsDeep ───────────────────────────────────────────────────────

describe("resolveEnvVarsDeep", () => {
  beforeEach(() => {
    process.env["RPC_URL"] = "https://example.com";
  });

  it("resolves env vars in nested objects", () => {
    const result = resolveEnvVarsDeep({
      network: { rpc: "\${RPC_URL}", chainId: 1 },
    });
    expect((result as any).network.rpc).toBe("https://example.com");
    expect((result as any).network.chainId).toBe(1);
  });

  it("resolves env vars in arrays", () => {
    process.env["ITEM"] = "resolved";
    const result = resolveEnvVarsDeep(["\${ITEM}", "plain"]);
    expect(result).toEqual(["resolved", "plain"]);
  });

  it("passes through non-string primitives unchanged", () => {
    expect(resolveEnvVarsDeep(42)).toBe(42);
    expect(resolveEnvVarsDeep(true)).toBe(true);
    expect(resolveEnvVarsDeep(null)).toBe(null);
  });
});

// ─── extractSelectors ─────────────────────────────────────────────────────────

describe("extractSelectors", () => {
  const sampleAbi = [
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
      name: "balanceOf",
      inputs: [{ name: "account", type: "address", internalType: "address" }],
      outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
      stateMutability: "view",
    },
    {
      type: "event",
      name: "Transfer",
      inputs: [],
    },
    {
      type: "constructor",
      inputs: [],
    },
  ];

  it("extracts function selectors only", () => {
    const selectors = extractSelectors(sampleAbi as any);
    expect(selectors).toHaveLength(2);
    // transfer(address,uint256) = 0xa9059cbb
    expect(selectors).toContain("0xa9059cbb");
    // balanceOf(address) = 0x70a08231
    expect(selectors).toContain("0x70a08231");
  });

  it("excludes events and constructors", () => {
    const selectors = extractSelectors(sampleAbi as any);
    // Should only have 2 function selectors
    expect(selectors.length).toBe(2);
  });

  it("returns empty array for empty ABI", () => {
    expect(extractSelectors([])).toEqual([]);
  });

  it("returns empty array for ABI with no functions", () => {
    const eventOnlyAbi = [{ type: "event", name: "MyEvent", inputs: [] }];
    expect(extractSelectors(eventOnlyAbi as any)).toEqual([]);
  });
});

// ─── formatAddress ────────────────────────────────────────────────────────────

describe("formatAddress", () => {
  it("truncates a full Ethereum address", () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const formatted = formatAddress(addr);
    expect(formatted).toBe("0x1234...5678");
  });

  it("returns short strings unchanged", () => {
    expect(formatAddress("0x1234")).toBe("0x1234");
  });
});

// ─── formatGas ────────────────────────────────────────────────────────────────

describe("formatGas", () => {
  it("formats a bigint gas value with commas", () => {
    expect(formatGas(1_000_000n)).toMatch(/1,000,000/);
  });

  it("handles zero gas", () => {
    expect(formatGas(0n)).toBe("0");
  });
});

// ─── getTimestamp ─────────────────────────────────────────────────────────────

describe("getTimestamp", () => {
  it("returns a string with dashes and underscores", () => {
    const ts = getTimestamp();
    expect(ts).toMatch(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
  });

  it("does not contain colons or dots", () => {
    const ts = getTimestamp();
    expect(ts).not.toContain(":");
    expect(ts).not.toContain(".");
  });
});
