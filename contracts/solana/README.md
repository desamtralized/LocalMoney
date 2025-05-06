# LocalMoney Protocol - Solana Implementation

This repository contains the Solana/Anchor implementation of the LocalMoney protocol, a decentralized peer-to-peer fiat-to-crypto trading platform.

## Project Structure

The protocol is composed of five core programs:

1. **Hub** - Central configuration, admin and registration orchestration
2. **Offer** - Create, update, and query trade offers
3. **Profile** - Manage user profiles, contacts, and counters
4. **Price** - Oracle for fiat and on-chain asset price feeds and conversion routes
5. **Trade** - P2P trade lifecycle, escrow, disputes, and settlements

## Development Setup

### Prerequisites

- Rust ≥ 1.85.0
- Solana CLI ≥ 2.1.15
- Anchor CLI ≥ 0.31.1
- Node.js ≥ 18.x
- Yarn ≥ 1.22

### Building and Testing

```bash
# Build all programs
anchor build

# Run tests
anchor test

# Deploy to localnet
anchor deploy

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## License

See the LICENSE file in the root directory for details.

## Documentation

For more information about the LocalMoney protocol specification, see `contracts/cosmwasm/PROTOCOL_SPEC.md` in the parent directory. 