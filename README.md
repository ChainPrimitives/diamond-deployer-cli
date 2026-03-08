# diamond-deployer-cli

> CLI for deploying, upgrading, and verifying EIP-2535 Diamond proxy contracts.

[![npm version](https://img.shields.io/npm/v/diamond-deployer-cli.svg)](https://www.npmjs.com/package/diamond-deployer-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/ChainPrimitives/diamond-deployer-cli)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ChainPrimitives/diamond-deployer-cli/pulls)

A config-driven CLI tool that automates the complete Diamond proxy deployment workflow — deploy facets, register selectors, validate storage, generate TypeScript types, and produce deployment reports across multiple chains.

---

## Why?

Diamond deployments (EIP-2535) involve many repetitive manual steps:

1. Deploy each facet contract
2. Compute function selectors for each facet
3. Call `diamondCut` to register all facets
4. Call initializers for stateful facets
5. Verify the on-chain state via DiamondLoupe
6. Record the deployment for future upgrades

`diamond-deployer-cli` automates all of this with a **single command** and a YAML config file. It works with both **Hardhat** and **Foundry** artifact formats out of the box.

---

## Prerequisites

- **Node.js** `>= 18`
- **npm** `>= 9` or **pnpm/yarn**
- A compiled smart contract project (Hardhat or Foundry)
- An RPC endpoint and deployer private key (for live networks)

---

## Installation

```bash
# Install globally
npm install -g diamond-deployer-cli

# Or use without installing via npx
npx diamond-deployer-cli --help
```

---

## Quick Start

```bash
# 1. Initialize config in your project root
cd my-diamond-project
diamond init

# 2. Edit the generated config
nano diamond.config.yaml

# 3. Compile your contracts
npx hardhat compile      # Hardhat
# forge build            # Foundry

# 4. Deploy to localhost
diamond deploy -n localhost

# 5. Verify the on-chain deployment
diamond verify -n localhost --address 0xYourDiamondAddress

# 6. Generate TypeScript types from the Diamond ABI
diamond typegen
```

---

## Commands

| Command | Description |
|---------|-------------|
| [`diamond init`](#diamond-init) | Scaffold a `diamond.config.yaml` |
| [`diamond deploy`](#diamond-deploy) | Deploy a new Diamond with all facets |
| [`diamond upgrade`](#diamond-upgrade) | Add, replace, or remove facets |
| [`diamond verify`](#diamond-verify) | Compare on-chain state with config |
| [`diamond status`](#diamond-status) | Show current facets and selectors |
| [`diamond diff`](#diamond-diff) | Show diff between config and on-chain |
| [`diamond typegen`](#diamond-typegen) | Merge ABIs and generate TypeScript types |

---

### `diamond init`

Scaffold a `diamond.config.yaml` in the current (or specified) directory.

```bash
diamond init                        # Create in current directory
diamond init --dir ./my-project    # Specify a different directory
diamond init --force                # Overwrite an existing config
```

---

### `diamond deploy`

Deploy a new Diamond proxy with all configured facets in one step.

```bash
diamond deploy -n localhost
diamond deploy -n polygon
diamond deploy -n ethereum --config ./custom.config.yaml
diamond deploy -n localhost --dry-run   # Simulate — shows what would be deployed without sending any transactions
```

**Steps performed automatically:**

1. Load & validate artifacts from `artifactsDir`
2. Deploy each facet contract
3. Deploy the Diamond contract with an initial `diamondCut`
4. Run any configured initializers
5. Verify on-chain state via DiamondLoupe
6. Generate a deployment report in `reportDir`

---

### `diamond upgrade`

Add, replace, or remove facets in an existing Diamond via `diamondCut`.

```bash
# Replace a facet (default action)
diamond upgrade -n polygon --address 0x123... -f GovernanceFacet

# Add a new facet
diamond upgrade -n polygon --address 0x123... -f NewFacet --action add

# Remove a facet entirely
diamond upgrade -n polygon --address 0x123... -f ObsoleteFacet --action remove

# Upgrade multiple facets in one transaction
diamond upgrade -n polygon --address 0x123... -f FacetA FacetB
```

---

### `diamond verify`

Query DiamondLoupe on-chain and compare it against your local config — reports any missing or extra selectors.

```bash
diamond verify -n polygon --address 0x123...
diamond verify -n ethereum --address 0x456... --config ./prod.config.yaml
```

**Output:**
```
🔍 Verifying Diamond — MyDiamond
  Network: polygon (chainId: 137)
  Address: 0x123...

  Facet Verification:

  ✓ DiamondCutFacet              1 selectors verified
    → 0xaaa...
  ✓ DiamondLoupeFacet            4 selectors verified
    → 0xbbb...
  ✗ GovernanceFacet              2 selector(s) MISSING
    → 0xccc...

✅ All facets verified successfully!
```

---

### `diamond status`

Display all on-chain facet addresses and their registered function selectors.

```bash
diamond status -n polygon --address 0x123...
```

**Output:**
```
🔷 Diamond Status — 0x123...
  Network: polygon (chainId: 137)

  0xaaa...  (Facet #1)
    Selectors: 1
      0x1f931c1c

  0xbbb...  (Facet #2)
    Selectors: 4
      0x7a0ed627
      ...

  Owner:     0xOwnerAddress
  Total:     2 facet(s), 5 selector(s)
```

---

### `diamond diff`

Compare on-chain Diamond state with your local config — shows exactly what needs to be upgraded.

```bash
diamond diff -n polygon --address 0x123...
```

**Output:**
```
🔀 Diamond Diff — MyDiamond

  In Sync:
  ✓ DiamondCutFacet              0xaaa...
  ✓ DiamondLoupeFacet            0xbbb...

  Missing (in config, not on-chain):
  − NewFacet

  Summary:
    ✓ 2 in sync
    − 1 missing

  Hint: run `diamond upgrade` to apply config changes to the Diamond.
```

---

### `diamond typegen`

Merge all facet ABIs into a single `Diamond.abi.json` and optionally generate TypeScript types via TypeChain.

> Unlike `hardhat-diamond-abi`, this command is **framework-agnostic** — works with both Hardhat and Foundry artifacts, driven entirely by your `diamond.config.yaml`.

```bash
# Merge ABIs + generate ethers-v6 types (default)
diamond typegen

# Choose a different TypeChain target
diamond typegen --target ethers-v5
diamond typegen --target viem
diamond typegen --target web3-v1

# Only output the merged ABI — skip TypeChain
diamond typegen --no-typechain

# Custom output directory
diamond typegen --output ./src/types/diamond
```

**Output:**
```
✓ Merged ABI written → ./typechain-types/Diamond.abi.json

  Diamond ABI
  Diamond:  MyDiamond
  Facets:   3 / 3 loaded
  Items:    24 total (functions + events + errors)
  ├── 18 function(s)
  ├── 4 event(s)
  └── 2 error(s)

✓ TypeScript types written → ./typechain-types/
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `-c, --config` | `diamond.config.yaml` | Config file path |
| `-o, --output` | `./typechain-types` | Output directory |
| `-t, --target` | `ethers-v6` | TypeChain target: `ethers-v6`, `ethers-v5`, `viem`, `web3-v1` |
| `--no-typechain` | `false` | Output merged ABI only, skip type generation |

> **TypeChain is an optional peer dependency.** If not installed, `diamond typegen` still writes the merged `Diamond.abi.json` and prints the exact command to run TypeChain yourself.

---

## Configuration

### `diamond.config.yaml`

```yaml
diamond:
  name: "MyDiamond"
  artifactsDir: "./artifacts"   # Hardhat: ./artifacts | Foundry: ./out

networks:
  localhost:
    rpc: "http://127.0.0.1:8545"
    chainId: 31337
    accounts:
      mnemonic: "test test test test test test test test test test test junk"

  polygon:
    rpc: "${POLYGON_RPC_URL}"        # ${VAR} placeholders resolved from process.env
    chainId: 137
    accounts:
      privateKey: "${DEPLOYER_PRIVATE_KEY}"

  ethereum:
    rpc: "${ETH_RPC_URL}"
    chainId: 1
    accounts:
      privateKey: "${DEPLOYER_PRIVATE_KEY}"

facets:
  - name: "DiamondCutFacet"
    contract: "DiamondCutFacet"
    selectors: "auto"               # Auto-extracted from ABI

  - name: "GovernanceFacet"
    contract: "GovernanceFacet"
    selectors: "auto"
    init:
      contract: "GovernanceInit"   # Runs once after deployment
      function: "init"
      args:
        - "100"   # quorum
        - "3600"  # votingPeriod

  - name: "TokenFacet"
    contract: "TokenFacet"
    selectors:                     # Explicit selectors (optional)
      - "0x70a08231"
      - "0xa9059cbb"

verification:
  etherscan:
    apiKey: "${ETHERSCAN_API_KEY}"

settings:
  gasMultiplier: 1.2     # Safety buffer applied to estimated gas
  confirmations: 2       # Block confirmations to wait after each tx
  reportDir: "./deployments"
```

### Environment Variables

All `${VAR_NAME}` placeholders in the config are resolved from `process.env` at runtime, keeping secrets out of your config file.

**Recommended: use a `.env` file with `dotenv`**

```bash
npm install dotenv
```

```bash
# .env  (never commit this file!)
DEPLOYER_PRIVATE_KEY=0xabc123...
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY
```

Then load it at the top of your deploy script or via `node -r dotenv/config`.

> **Security:** Never commit `.env` or any file containing private keys. Add `.env` to your `.gitignore`.

---

## Artifact Compatibility

The CLI automatically resolves artifacts in multiple search paths — no manual path configuration required.

| Tool | Supported Path |
|------|----------------|
| Hardhat | `artifacts/contracts/Foo.sol/Foo.json` |
| Foundry | `out/Foo.sol/Foo.json` |
| Flat | `artifacts/Foo.json` |

Set `artifactsDir` in your config to the root of your artifact output directory (`./artifacts` for Hardhat, `./out` for Foundry).

---

## Deployment Reports

Each `diamond deploy` run generates a timestamped JSON report in `settings.reportDir`:

```
deployments/
├── polygon-2026-01-15_10-30-00.json
├── polygon-latest.json              ← Always points to most recent deploy
└── localhost-2026-01-14_09-00-00.json
```

**Report schema:**

```json
{
  "version": "1.1.0",
  "network": "polygon",
  "chainId": 137,
  "timestamp": 1705312200000,
  "diamondAddress": "0x...",
  "facets": [
    {
      "name": "DiamondCutFacet",
      "contract": "DiamondCutFacet",
      "address": "0x...",
      "selectors": ["0x1f931c1c"]
    }
  ],
  "txHashes": ["0x..."]
}
```

The `*-latest.json` symlink lets scripts and CI pipelines always read the most recent deployment without hardcoding filenames.

---

## Development

```bash
git clone https://github.com/ChainPrimitives/diamond-deployer-cli
cd diamond-deployer-cli
npm install
npm run build          # Compile TypeScript → dist/
npm run test           # Run all tests (Vitest)
npm run test:coverage  # Coverage report (v8)
npm run dev            # Run CLI directly via tsx (no build step)
npm run lint           # Type-check with tsc --noEmit
npm run clean          # Remove dist/ and coverage/
```

---

## Contributing

Contributions are welcome and appreciated! This project follows standard open-source contribution practices.

### Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/diamond-deployer-cli
   cd diamond-deployer-cli
   npm install
   ```
3. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feat/my-feature
   # or
   git checkout -b fix/my-bug-fix
   ```
4. **Make your changes** and ensure tests pass:
   ```bash
   npm run lint && npm run test
   ```
5. **Commit** using a descriptive message (we follow [Conventional Commits](https://www.conventionalcommits.org/)):
   ```
   feat: add support for Foundry profile configs
   fix: resolve selector deduplication edge case
   docs: improve typegen command examples
   ```
6. **Push** your branch and open a **Pull Request** against `main`.

### Guidelines

- **Tests are required.** All new features must include unit or integration tests. Run `npm run test:coverage` to check coverage.
- **TypeScript strict mode.** The project uses `strict: true` — no `any` casts without justification.
- **Keep PRs focused.** One feature or fix per PR makes review faster and easier.
- **Update the README** if your change adds or modifies CLI behavior.
- **No breaking changes** without discussion in an issue first.

### Reporting Issues

- Search [existing issues](https://github.com/ChainPrimitives/diamond-deployer-cli/issues) before opening a new one.
- Include your Node.js version, OS, and the exact command/output that failed.
- For security vulnerabilities, please email **subaskar.sr@gmail.com** directly instead of opening a public issue.

---

## Changelog

### v1.1.0
- ✨ **New:** `diamond typegen` command — merge facet ABIs and generate TypeScript types via TypeChain (framework-agnostic alternative to `hardhat-diamond-abi`)
- 🐛 **Fix:** Resolved `import.meta.url` incompatibility with CJS output in `init` command

### v1.0.0
- 🚀 Initial release
- Commands: `init`, `deploy`, `upgrade`, `verify`, `status`, `diff`
- Hardhat + Foundry artifact support
- Environment variable resolution in config
- Timestamped deployment reports with `*-latest.json`

---

## License

MIT © 2026 [Subaskar Sivakumar](https://github.com/Subaskar-S)
