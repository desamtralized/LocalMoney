# Essential Commands for LocalMoney Development

## Frontend Development (app/)
```bash
# Development server
yarn dev

# Build for production
yarn build

# Run tests
yarn test

# Linting and formatting
yarn lint          # Check code style
yarn lint:fix      # Fix linting issues
yarn typecheck     # TypeScript type checking

# Preview production build
yarn preview
```

## Solana Contracts (contracts/solana/)
```bash
# Install dependencies
yarn install

# Build programs
anchor build

# Run tests
anchor test
# Or using the configured script:
yarn run mocha -t 1000000 tests/

# Deploy to localnet
anchor deploy

# Linting and formatting
yarn lint          # Check Prettier formatting
yarn lint:fix      # Apply Prettier formatting

# Rust formatting
cargo fmt

# Rust linting
cargo clippy
```

## CosmWasm Contracts (contracts/cosmwasm/)
```bash
# Build all contracts
cargo build

# Run tests
cargo test

# Format code
cargo fmt

# Lint code
cargo clippy

# Optimize for deployment
./optimize.sh

# Run all checks
./all.sh
```

## Git Operations
```bash
# Current branch: solana-prps
# Main branch: main

git status
git add .
git commit -m "message"
git push origin solana-prps
```