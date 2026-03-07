import path from "path";
import fs from "fs-extra";
import type { DiamondConfig, DeploymentReport, DeployedFacet } from "./types.js";
import { ensureDir, getTimestamp } from "./utils.js";

// ─── ReportInput ──────────────────────────────────────────────────────────────

export interface ReportInput {
  network: string;
  diamondAddress: string;
  facets: DeployedFacet[];
  timestamp?: number;
  txHashes?: string[];
  gasUsed?: string;
}

// ─── DeploymentReporter ───────────────────────────────────────────────────────

export class DeploymentReporter {
  private readonly config: DiamondConfig;
  private readonly reportDir: string;

  constructor(config: DiamondConfig) {
    this.config = config;
    this.reportDir = config.settings?.reportDir ?? "./deployments";
  }

  /**
   * Generate and persist a deployment report as JSON.
   * Returns the path to the written file.
   */
  async generate(input: ReportInput): Promise<string> {
    await ensureDir(this.reportDir);

    const networkConfig = this.config.networks[input.network];
    const ts = input.timestamp ?? Date.now();

    const report: DeploymentReport = {
      version: "1.0.0",
      network: input.network,
      chainId: networkConfig?.chainId ?? 0,
      timestamp: ts,
      diamondAddress: input.diamondAddress,
      facets: input.facets,
      txHashes: input.txHashes ?? [],
      gasUsed: input.gasUsed,
    };

    const filename = `${input.network}-${getTimestamp()}.json`;
    const filePath = path.join(this.reportDir, filename);

    await fs.writeJson(filePath, report, { spaces: 2 });

    // Also write/overwrite latest.json for easy access
    const latestPath = path.join(this.reportDir, `${input.network}-latest.json`);
    await fs.writeJson(latestPath, report, { spaces: 2 });

    return filePath;
  }

  /**
   * Load the most recent deployment report for a network.
   * Returns null if no report exists.
   */
  async loadLatest(network: string): Promise<DeploymentReport | null> {
    const latestPath = path.join(this.reportDir, `${network}-latest.json`);
    if (!(await fs.pathExists(latestPath))) {
      return null;
    }
    return fs.readJson(latestPath) as Promise<DeploymentReport>;
  }

  /**
   * List all deployment reports for a network.
   */
  async listReports(network?: string): Promise<string[]> {
    if (!(await fs.pathExists(this.reportDir))) {
      return [];
    }

    const files = await fs.readdir(this.reportDir);
    return files
      .filter((f) => {
        const isJson = f.endsWith(".json") && !f.endsWith("-latest.json");
        if (network) {
          return isJson && f.startsWith(`${network}-`);
        }
        return isJson;
      })
      .map((f) => path.join(this.reportDir, f))
      .sort();
  }

  /**
   * Pretty-print a deployment report summary to the console.
   */
  printSummary(report: DeploymentReport): string {
    const lines: string[] = [
      "",
      `📋 Deployment Report — ${report.network} (chainId: ${report.chainId})`,
      `   Diamond:   ${report.diamondAddress}`,
      `   Timestamp: ${new Date(report.timestamp).toISOString()}`,
      `   Facets:    ${report.facets.length}`,
      "",
    ];

    for (const facet of report.facets) {
      lines.push(`   • ${facet.name.padEnd(30)} ${facet.address}`);
      lines.push(`     Selectors: ${facet.selectors.length}`);
    }

    if (report.txHashes.length > 0) {
      lines.push("");
      lines.push("   Transactions:");
      for (const hash of report.txHashes) {
        lines.push(`     ${hash}`);
      }
    }

    lines.push("");
    return lines.join("\n");
  }
}
