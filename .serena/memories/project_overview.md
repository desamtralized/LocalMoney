# LocalMoney Project Overview

## Purpose
LocalMoney is a decentralized peer-to-peer (P2P) trading protocol that facilitates secure fiat-to-cryptocurrency exchanges through an escrow mechanism with integrated dispute resolution. It's an interchain marketplace supporting both Cosmos/CosmWasm and Solana ecosystems.

## Architecture
The protocol consists of five interconnected smart contracts:
1. **Hub Contract** - Central orchestrator and configuration manager
2. **Offer Contract** - Manages buy/sell offer creation and lifecycle
3. **Trade Contract** - Handles escrow, trading execution, and dispute resolution
4. **Profile Contract** - User profile management and reputation tracking
5. **Price Contract** - Oracle price feeds and fiat conversion rates

## Tech Stack

### Frontend (app/)
- **Framework**: Vue 3 with TypeScript
- **Build Tool**: Vite with SSG (Static Site Generation)
- **State Management**: Pinia
- **UI**: Vue components with SCSS
- **Blockchain Integration**: CosmJS for Cosmos chains
- **Testing**: Jest with testing-library

### Smart Contracts
- **Solana**: Anchor framework (v0.31.1) with Rust
- **CosmWasm**: Rust smart contracts for Cosmos ecosystem
- **Solana Version**: 2.1.21

### Development Tools
- **Linting**: ESLint with Prettier
- **Type Checking**: TypeScript with strict mode
- **Package Management**: Yarn (frontend), Cargo (Rust)