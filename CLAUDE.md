# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LocalMoney is a decentralized P2P marketplace for Interchain & IBC assets. It enables users to trade crypto assets for fiat currencies across multiple IBC-enabled blockchains.

## Architecture

The project consists of three main components:

1. **Frontend Application** (`/app`): Vue 3 SPA for user interaction
2. **Smart Contracts** (`/contracts/cosmwasm`): CosmWasm contracts implementing the protocol logic
3. **Deployment Scripts** (`/deploy`): Automated deployment and management tools

### Smart Contract Architecture

The protocol uses five interconnected contracts:
- **Hub**: Main coordinator contract that manages the protocol
- **Offer**: Handles creation and management of P2P trade offers
- **Trade**: Manages active trades and escrow functionality
- **Profile**: User profiles and reputation system
- **Price**: Oracle for price feeds and currency conversion

## Common Development Commands

### Building and Testing

```bash
# Full project build
just build

# Run all tests
just test

# Format code (Rust, TOML, shell, Markdown)
just fmt

# Lint Rust code
just lint

# Type check
just check

# Optimize contracts for deployment
just optimize
```

### Frontend Development

```bash
# Navigate to frontend directory
cd app

# Start development server (port 3333)
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Lint TypeScript/Vue files
npm run lint

# Type checking
npm run typecheck
```

### Contract Deployment

```bash
# Deploy a specific contract to Mantra testnet (default)
just deploy mantra-testnet <contract_name>

# Store contract on chain
just store <chain> <contract_name>

# Deploy a pool configuration
just deploy-pool <chain> <pool_file>

# Available chains: mantra-testnet, neutron, kujira, terra, juno
```

### Testing Individual Contracts

```bash
# Run tests for a specific contract
cd contracts/cosmwasm/contracts/<contract_name>
cargo test

# Run tests with output
cargo test -- --nocapture
```

## Key Technologies

- **Frontend**: Vue 3, Vite, TypeScript, Pinia, CosmJS
- **Smart Contracts**: Rust, CosmWasm
- **Build Tools**: Just, Cargo, npm
- **Supported Chains**: Neutron (NTRN), Kujira, Terra, Juno, Mantra

## Important Files and Directories

- `justfile`: Main command runner configuration
- `app/src/network/cosmos/config/`: Chain-specific configurations
- `contracts/cosmwasm/contracts/`: Smart contract implementations
- `deploy/src/`: Deployment scripts and utilities
- `app/src/components/`: Vue components
- `app/src/store/`: Pinia state management stores

## Development Guidelines

1. The project uses NTRN as the primary token denomination
2. All contract interactions go through the Hub contract
3. Frontend uses CosmJS for blockchain interactions
4. State management is handled by Pinia stores in `app/src/store/`
5. Internationalization is implemented - add translations to `app/src/locales/`
6. Network configurations are in `app/src/network/cosmos/config/`

## Testing Approach

- Frontend tests use Jest and are located in `app/tests/`
- Contract tests use Rust's built-in test framework
- Integration tests can be run from the `app/tests/` directory
- Use `cargo test` for individual contract testing
- Use `npm run test` for frontend unit tests

## Current Development Status

- Active branch: `feat/mantra`
- Main branch for PRs: `main`
- Recent focus: Mantra chain integration and CosmJS dependency upgrades
- Solana contracts have been removed from the project