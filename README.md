# diamond-deployer-cli

> CLI for deploying, upgrading, and verifying EIP-2535 Diamond proxy contracts.

[![npm version](https://img.shields.io/npm/v/diamond-deployer-cli.svg)](https://www.npmjs.com/package/diamond-deployer-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A config-driven CLI tool that automates the complete Diamond proxy deployment workflow — deploy facets, register selectors, validate storage, and generate deployment reports across multiple chains.

## Why?

Diamond deployments (EIP-2535) involve many manual steps:
1. Deploy each facet contract
2. Compute function selectors for each facet
3. Call `diamondCut` to register all facets
4. Call initializers for stateful facets
5. Verify the on-chain state via DiamondLoupe
6. Record the deployment for future upgrades

`diamond-deployer-cli` automates all of this with a single command.

---

## Installation

```bash
# Install globally
npm install -g diamond-deployer-cli

# Or use via npx
npx diamond-deployer-cli --help
```

---

## Quick Start

```bash
# 1. Initialize config in your project
cd my-diamond-project
diamond init

# 2. Edit config with your networks and facets
nano diamond.config.yaml

# 3. Compile your contracts
npx hardhat compile

# 4. Deploy to localhost
diamond deploy -n localhost

# 5. Verify the deployment
diamond verify -n localhost --address 0xYourDiamondAddress
```

---

## Commands

### `diamond init`

Scaffold a `diamond.config.yaml` in the current directory.

```bash
diamond init
diamond init --dir ./my-project   # Specify directory
diamond init --force               # Overwrite existing config
```

---

### `diamond deploy`

Deploy a new Diamond with all configured facets.

```bash
diamond deploy -n localhost
diamond deploy -n polygon
diamond deploy -n ethereum --config ./custom.config.yaml
diamond deploy -n localhost --dry-run   # Simulate without sending transactions
```

**Steps performed:**
1. Load & validate artifacts from `artifactsDir`
2. Deploy each facet contract
3. Deploy the Diamond contract with an initial `diamondCut`
4. Run any configured initializers
5. Verify on-chain state via DiamondLoupe
6. Generate a deployment report in `reportDir`

---

### `diamond upgrade`

Add, replace, or remove facets in an existing Diamond.

```bash
# Replace a facet (default action)
diamond upgrade -n polygon --address 0x123... -f GovernanceFacet

# Add a new facet
diamond upgrade -n polygon --address 0x123... -f NewFacet --action add

# Remove a facet
diamond upgrade -n polygon --address 0x123... -f ObsoleteFacet --action remove

# Upgrade multiple facets at once
diamond upgrade -n polygon --address 0x123... -f FacetA FacetB
```

---

### `diamond verify`

Query DiamondLoupe and compare on-chain state against your config.

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

Display all on-chain facets, addresses, and function selectors.

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

Compare on-chain Diamond state with your local config — shows what needs to be upgraded.

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
      mnemonic: "test test test ..."

  polygon:
    rpc: "${POLYGON_RPC_URL}"       # Env vars resolved automatically
    chainId: 137
    accounts:
      privateKey: "${DEPLOYER_PRIVATE_KEY}"

facets:
  - name: "DiamondCutFacet"
    contract: "DiamondCutFacet"
    selectors: "auto"              # Auto-extract from ABI

  - name: "GovernanceFacet"
    contract: "GovernanceFacet"
    selectors: "auto"
    init:
      contract: "GovernanceInit"  # Initializer contract
      function: "init"
      args:
        - "100"    # quorum
        - "3600"   # votingPeriod

  - name: "TokenFacet"
    contract: "TokenFacet"
    selectors:                    # Explicit selectors
      - "0x70a08231"
      - "0xa9059cbb"

verification:
  etherscan:
    apiKey: "${ETHERSCAN_API_KEY}"

settings:
  gasMultiplier: 1.2    # Safety factor applied to gas estimates
  confirmations: 2      # Blocks to wait per transaction
  reportDir: "./deployments"
```

### Environment Variables

All `${VAR_NAME}` placeholders in the config are resolved from `process.env` at runtime. This allows you to keep secrets out of the config file.

Create a `.env` file (use `dotenv` or export variables in your shell):

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/...
export ETHERSCAN_API_KEY=...
```

---

## Artifact Compatibility

The CLI supports both **Hardhat** and **Foundry** artifact formats:

| Tool | Artifact Path |
|------|--------------|
| Hardhat | `artifacts/contracts/Foo.sol/Foo.json` |
| Foundry | `out/Foo.sol/Foo.json` |
| Flat | `artifacts/Foo.json` |

Set `artifactsDir` in your config to the root of your artifact directory.

---

## Deployment Reports

Each `diamond deploy` generates a timestamped JSON report:

```
deployments/
├── polygon-2026-01-15_10-30-00.json
├── polygon-latest.json              ← Always points to most recent
└── localhost-2026-01-14_09-00-00.json
```

Report format:
```json
{
  "version": "1.0.0",
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

---

## Development

```bash
git clone https://github.com/ChainPrimitives/diamond-deployer-cli
cd diamond-deployer-cli
npm install
npm run build          # Compile TypeScript
npm run test           # Run tests
npm run test:coverage  # Coverage report
npm run dev            # Run CLI in dev mode (tsx, no build)
```

---

## License

MIT © 2026 [Subaskar Sivakumar](https://github.com/Subaskar-S)
