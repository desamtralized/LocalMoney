# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LocalMoney is a decentralized P2P trading protocol that enables cryptocurrency-to-fiat trading through an escrow-based system. The project is currently being migrated from CosmWasm to Solana using the Anchor Framework.

## Repository Structure

- **`app/`** - Vue.js frontend application for the trading interface
- **`contracts/cosmwasm/`** - Original CosmWasm smart contracts (reference implementation)
- **`contracts/solana/`** - New Solana programs using Anchor Framework (migration target)
- **`deploy/`** - Deployment scripts and utilities
- **`contracts/`** - Protocol documentation and migration guides

## Common Commands

### Frontend Development (app/)
```bash
cd app
yarn dev                 # Start development server on port 3333
yarn build              # Build production frontend
yarn test               # Run Jest tests with verbose output
yarn lint               # Run ESLint
yarn lint:fix           # Fix ESLint errors automatically
yarn typecheck          # Run Vue TypeScript type checking
```

### Smart Contracts

#### CosmWasm (contracts/cosmwasm/)
```bash
cd contracts/cosmwasm
cargo +nightly build    # Build with specific nightly toolchain
sh optimize.sh          # Generate .wasm files in artifacts/ (requires Docker)
```

#### Solana Programs (contracts/solana/localmoney-protocol/)
```bash
cd contracts/solana/localmoney-protocol
anchor build            # Build all Solana programs
anchor test             # Run program tests
yarn test              # Run TypeScript integration tests
```

### Testing Workflows

#### Frontend Integration Tests
```bash
cd app
yarn test -t 'setup protocol'                    # Initialize protocol only
yarn test -t 'fees'                             # Test fee configurations
yarn test -t 'price test'                       # Pre-populate price contract
yarn test -t 'setup protocol|fees|price test'   # Combined test suite
```

## Architecture Overview

### Hub-and-Spoke Design
The protocol consists of five interconnected programs/contracts:

1. **Hub** - Central configuration and program registry
2. **Profile** - User profile and reputation management  
3. **Price** - Price oracle and currency conversion
4. **Offer** - Buy/sell offer management
5. **Trade** - Trade execution, escrow, and dispute resolution

### Migration Status
The project is migrating from CosmWasm to Solana following a phased approach:
- **Phase 0**: Environment setup ✅
- **Phase 1**: Foundation programs (Hub, Profile, Price) 🔄
- **Phase 2**: Core trading programs (Offer, Trade)
- **Phase 3**: Advanced features and arbitration
- **Phase 4**: Testing and quality assurance

### Key Implementation Patterns

#### Solana/Anchor Patterns
- Use Program Derived Addresses (PDAs) for all protocol accounts
- Consistent PDA seeds: `b"config"`, `b"offer"`, `b"trade"`, etc.
- Always validate PDAs with seeds and bumps
- Implement Cross-Program Calls (CPIs) for program interactions
- Use custom error codes for comprehensive error handling

#### Data Models
- **Offers**: Support 20+ fiat currencies with rate-based pricing
- **Trades**: 12 distinct states from creation to completion
- **Profiles**: Track reputation, activity limits, and contact info
- **Prices**: USD-normalized multi-currency support

## Development Guidelines

### Migration Priority Order
Implement programs in dependency order:
1. Hub (foundation)
2. Profile (user management)
3. Price (oracle infrastructure)
4. Offer (depends on Profile + Price)
5. Trade (depends on all others)

### Protocol Constraints
- Maximum platform fee: 10%
- Maximum trade expiration: 2 days
- Maximum dispute timer: 1 day  
- Offer description limit: 140 characters
- Active offers/trades limits per user (configurable)

### Security Requirements
- Validate all PDAs with proper seeds and bumps
- Implement comprehensive access control
- Encrypt sensitive contact information
- Enforce protocol limits and constraints
- Track all state changes with history

## Key Files and Documentation

- **`contracts/LocalMoney_Protocol_Specification.md`** - Complete protocol specification
- **`contracts/LocalMoney_Migration_Task_List.md`** - Detailed migration task breakdown
- **`contracts/LocalMoney_Solana_Migration_Guide.md`** - Technical migration patterns
- **`contracts/.cursor/rules/`** - Development workflow and architecture guidelines

## Testing Strategy

### Frontend Tests
- Integration tests for protocol interactions
- UI component testing with Jest
- E2E workflow validation

### Contract/Program Tests  
- Unit tests for all instructions/functions
- Integration tests for cross-program interactions
- Security tests for access control
- End-to-end trading workflow tests

Run comprehensive test suites before any major changes to ensure protocol integrity.