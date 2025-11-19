# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Environment Setup

Never downgrade anchor, dependencies or tools to falsely fix issues.

## Core Development Commands

### Frontend (Vue.js Application)
```bash
cd app
npm install                # Install dependencies
npm run dev                 # Start development server on port 3333
npm run build               # Build production bundle
npm run lint                # Run ESLint
npm run lint:fix            # Fix linting issues
npm run typecheck           # Type-check with vue-tsc
npm run test                # Run Jest tests
```

### CosmWasm Smart Contracts
```bash
cd contracts/cosmwasm
cargo build --release --target wasm32-unknown-unknown  # Build all contracts
cargo test                                              # Run tests
cargo schema                                            # Generate JSON schemas
```

### EVM Smart Contracts (BSC/Ethereum)
```bash
cd contracts/evm
just compile                # Compile contracts with Hardhat
just test                   # Run all tests
just test-security          # Run security tests
just coverage               # Generate coverage report
just gas-report             # Generate gas usage report
just size                   # Check contract sizes
just check-prices bsc       # Check prices on BSC
```

## High-Level Architecture

### Multi-Chain P2P Trading Protocol

The LocalMoney protocol is a decentralized peer-to-peer trading system that operates across multiple blockchain networks:

#### Core Protocol (CosmWasm - Cosmos chains)
Five interconnected smart contracts manage the complete trading lifecycle:
- **Hub Contract**: Central orchestrator for configuration and inter-contract coordination
- **Offer Contract**: Manages buy/sell offer creation and lifecycle
- **Trade Contract**: Core trading engine with escrow, state management, and dispute resolution
- **Profile Contract**: User profiles, reputation tracking, and contact information
- **Price Contract**: Oracle for fiat currency rates and crypto pricing via DEX integration

#### EVM Extension (BSC/Ethereum)
The protocol has been extended to EVM chains with deployments on BSC mainnet:
- Hub: `0x696F771E329DF4550044686C995AB9028fD3a724`
- Trade: `0xe0cdc4bDb60fCeC0ED1FFedcbbFb86839206862f`
- Escrow: `0xA07BfE2A3eE903Dde4e62ADc76cC32b57B0e0Cd2`
- Offer: `0x5B1E3C79A6A84BD436Fe2141A13E1767C178E621`
- Profile: `0x9a1AD40c90E5f282152Aa9F56d18B99F31794B68`

#### Cross-Chain Integration (Axelar Network)
The protocol is being extended for cross-chain operation through Axelar:
- BSC deployment serves as the primary hub
- Satellite contracts on other chains (Polygon, Avalanche, Base, etc.)
- Axelar GMP for cross-chain message passing
- Axelar ITS for cross-chain token transfers

### Frontend Architecture
- Vue 3 + TypeScript application
- Multi-wallet support (Keplr for Cosmos, MetaMask for EVM, Phantom for Solana)
- Chain-agnostic interface adapting to connected network
- Real-time price feeds and trading interface

### Trading Flow
1. **Offer Creation**: Users create buy/sell offers with price, limits, and fiat currency
2. **Trade Initiation**: Taker accepts offer, creating trade request with escrow
3. **Escrow & Settlement**: Cryptocurrency locked, fiat exchanged off-chain, then released
4. **Dispute Resolution**: Arbitrator system for handling disputes with encrypted communication

## Adding New Fiat Currencies

To add a new fiat currency to the system, follow these steps:

### 1. CosmWasm Contracts
Check if the currency is already defined in `/contracts/cosmwasm/packages/protocol/src/currencies.rs`. Most ISO currency codes are already included.

### 2. Frontend Application
Update the following files in the frontend:

#### a. `/app/src/utils/fiats-config.json`
Add the new currency configuration:
```json
"XXX": {
  "icon": "/flags/xxx.png",
  "display": "XXX",
  "code": "XXX"
}
```

#### b. `/app/src/types/components.interface.ts`
Add the currency to the FiatCurrency const object:
```typescript
export const FiatCurrency = {
  // ... existing currencies
  XXX: 'XXX',
} as const
```

#### c. `/app/src/ui/pages/Dashboard.vue`
Add the currency to the supportedFiats array:
```typescript
const supportedFiats = [
  // ... existing currencies
  FiatCurrency.XXX,
]
```

#### d. `/app/public/flags/xxx.png`
Add the flag image file for the new currency.

### 3. Price Aggregator Service
Update the following files in `/fiat-prices-aggregator/`:

#### a. `/src/api/yadio.rs`
Add the currency field to the Prices struct and its Default implementation:
```rust
pub struct Prices {
    // ... existing fields
    pub XXX: f64,
}

impl Default for Prices {
    fn default() -> Self {
        Prices {
            // ... existing fields
            XXX: 0.0,
        }
    }
}
```

#### b. `/src/main.rs`
Add the currency to the all_prices vector:
```rust
let all_prices = vec![
    // ... existing currencies
    (price.XXX, FiatCurrency::XXX),
];
```

Update the total count in the log message to reflect the new total number of currencies.

### 4. Testing
After making these changes:
1. Build the frontend: `cd app && npm run build`
2. Build the price aggregator: `cd fiat-prices-aggregator && cargo build`
3. Build the CosmWasm contracts: `cd contracts/cosmwasm && cargo build --release --target wasm32-unknown-unknown`

## Code Search Guidelines

### Use ast-grep for Semantic Code Search
**IMPORTANT**: Always use `ast-grep` (sg) for searching code patterns and semantic structures. Only use `rg` (ripgrep) for plain text searches in documentation, comments, or logs.

### ast-grep Quick Reference

#### Basic Search Commands
```bash
# Search for a pattern in all files
sg --pattern 'console.log($$$)'

# Search in specific language files
sg --pattern 'useState($$$)' --lang tsx

# Search with file filtering
sg --pattern 'function $FUNC($$$) { $$$ }' 'src/**/*.js'

# Interactive mode for exploring matches
sg scan --interactive
```

#### Common Pattern Variables
- `$VAR` - Matches any single node (identifier, expression, etc.)
- `$$$` - Matches zero or more nodes (wildcards)
- `$_` - Matches any single node but ignores the matched content
- `$$ARGS` - Matches multiple arguments/parameters

#### Language-Specific Patterns

##### TypeScript/JavaScript
```bash
# Find all function declarations
sg --pattern 'function $FUNC($$$) { $$$ }' --lang ts

# Find arrow functions
sg --pattern 'const $VAR = ($$$) => $$$' --lang ts

# Find React components
sg --pattern 'function $COMP($$$) { return <$$$ /> }' --lang tsx

# Find useState hooks
sg --pattern 'const [$VAR, $SETTER] = useState($$$)' --lang tsx

# Find async functions
sg --pattern 'async function $FUNC($$$) { $$$ }' --lang ts

# Find class definitions
sg --pattern 'class $CLASS { $$$ }' --lang ts

# Find imports from specific module
sg --pattern 'import { $$$ } from "react"' --lang ts
```

##### Solidity
```bash
# Find contract definitions
sg --pattern 'contract $CONTRACT { $$$ }' --lang solidity

# Find function modifiers
sg --pattern 'modifier $MOD($$$) { $$$ }' --lang solidity

# Find events
sg --pattern 'event $EVENT($$$);' --lang solidity

# Find mappings
sg --pattern 'mapping($KEY => $VALUE) $VAR;' --lang solidity

# Find require statements
sg --pattern 'require($CONDITION, $$$);' --lang solidity
```

##### Rust
```bash
# Find function definitions
sg --pattern 'fn $FUNC($$$) -> $RET { $$$ }' --lang rust

# Find struct definitions
sg --pattern 'struct $STRUCT { $$$ }' --lang rust

# Find impl blocks
sg --pattern 'impl $TYPE { $$$ }' --lang rust

# Find match expressions
sg --pattern 'match $EXPR { $$$ }' --lang rust

# Find derive macros
sg --pattern '#[derive($$$)]' --lang rust

# Find Result returns
sg --pattern 'Result<$OK, $ERR>' --lang rust
```

##### Vue
```bash
# Find component definitions
sg --pattern '<script setup lang="ts">$$$</script>' --lang vue

# Find computed properties
sg --pattern 'const $VAR = computed(() => $$$)' --lang vue

# Find template refs
sg --pattern 'const $VAR = ref($$$)' --lang vue

# Find props definitions
sg --pattern 'defineProps<{ $$$ }>' --lang vue
```

#### Advanced Search Techniques

##### Using Rules Files
Create `.ast-grep/rules/` directory with YAML rule files:

```yaml
# .ast-grep/rules/find-console-logs.yml
id: console-logs
language: javascript
pattern: console.log($$$)
message: Found console.log statement
severity: warning
```

Run with: `sg scan`

##### Combining with Other Tools
```bash
# Find all functions and count them
sg --pattern 'function $FUNC($$$) { $$$ }' --json | jq length

# Find and replace pattern
sg --pattern 'console.log($ARG)' --rewrite 'logger.debug($ARG)'

# Find pattern and show context
sg --pattern 'throw new Error($$$)' -C 3
```

##### Project-Specific Searches

###### LocalMoney Contract Patterns
```bash
# Find all contract execute handlers
sg --pattern 'pub fn execute($$$) -> Result<Response, ContractError> { $$$ }' --lang rust

# Find all query handlers
sg --pattern 'pub fn query($$$) -> StdResult<Binary> { $$$ }' --lang rust

# Find message definitions
sg --pattern '#[derive($$$)]
pub enum ExecuteMsg { $$$ }' --lang rust

# Find state variables
sg --pattern 'pub const $VAR: $TYPE = $$$;' --lang rust
```

###### Vue Component Patterns
```bash
# Find all API calls
sg --pattern 'await $API.$METHOD($$$)' --lang ts

# Find Pinia store usage
sg --pattern 'const $STORE = use$$$Store()' --lang ts

# Find route definitions
sg --pattern '{ path: $PATH, component: $COMP }' --lang ts
```

###### Solidity Security Patterns
```bash
# Find potential reentrancy vulnerabilities
sg --pattern '$CONTRACT.$METHOD{value: $$$}($$$)' --lang solidity

# Find unchecked arithmetic
sg --pattern 'unchecked { $$$ }' --lang solidity

# Find delegate calls
sg --pattern 'delegatecall($$$)' --lang solidity
```

### When to Use Each Tool

#### Use ast-grep for:
- Finding function definitions, class declarations, or specific code structures
- Searching for API usage patterns
- Finding all instances of a specific syntax pattern
- Refactoring code (with --rewrite flag)
- Security audits and code smell detection
- Understanding code relationships and dependencies

#### Use ripgrep (rg) for:
- Searching in comments and documentation
- Finding TODO/FIXME markers
- Searching for string literals or error messages
- Quick text searches in configuration files
- Log file analysis
- Non-code file searches (JSON, YAML, Markdown)

### Common Workflow Examples

```bash
# 1. Find all functions that handle errors
sg --pattern 'function $FUNC($$$) {
  $$$
  catch ($ERR) { $$$ }
  $$$
}' --lang ts

# 2. Find all hardcoded addresses in Solidity
sg --pattern 'address($ADDR)' --lang solidity | grep -i '0x'

# 3. Find all async functions without try-catch
sg --pattern 'async function $FUNC($$$) { $$$ }' --lang ts | \
  xargs -I {} sh -c 'echo {} | sg --pattern "try { $$$ } catch"'

# 4. Find React components with specific props
sg --pattern '<$COMP loading={$VAL} $$$ />' --lang tsx

# 5. Find all test files with specific test patterns
sg --pattern 'describe("$DESC", () => { $$$ })' 'test/**/*.ts'
```