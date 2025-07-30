# Codebase Structure

## Root Directory
```
LocalMoney/
├── app/                 # Vue.js frontend application
├── contracts/           # Smart contracts
│   ├── solana/         # Solana/Anchor programs
│   └── cosmwasm/       # CosmWasm contracts
├── deploy/             # Deployment scripts and configs
├── PRPs/               # Protocol Revision Proposals
├── img/                # Images and assets
└── *.md               # Documentation files
```

## Frontend Structure (app/)
```
app/
├── src/
│   ├── components/     # Vue components
│   ├── pages/          # Route pages
│   ├── stores/         # Pinia state management
│   └── types/          # TypeScript type definitions
├── tests/              # Jest tests
├── public/             # Static assets
├── locales/            # i18n translations
└── package.json        # Dependencies and scripts
```

## Solana Contracts (contracts/solana/)
```
solana/
├── programs/           # Anchor programs
│   ├── hub/           # Hub contract (central coordinator)
│   ├── offer/         # Offer management
│   ├── trade/         # Trade execution & escrow
│   ├── profile/       # User profiles & reputation
│   └── price/         # Price oracle feeds
├── sdk/               # TypeScript SDK
├── app/               # Integration examples
├── tests/             # Program tests (currently deleted)
└── Anchor.toml        # Anchor configuration
```

## CosmWasm Contracts (contracts/cosmwasm/)
```
cosmwasm/
├── contracts/         # Smart contract implementations
├── packages/          # Shared packages and types
└── scripts/           # Build and deployment utilities
```

## Key Configuration Files
- `CLAUDE.md` - Development guidelines
- `Anchor.toml` - Solana program configuration
- `package.json` - Node.js dependencies and scripts
- `Cargo.toml` - Rust workspace configuration