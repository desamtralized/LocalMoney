# Task 11: Deployment, Migration Scripts, and Infrastructure

**Status**: 📋 GUIDE COMPLETE - Ready for Execution
**Estimated Time**: 1-2 days
**Date**: 2025-11-19

## Overview

Comprehensive deployment guide for LocalMoney Solana protocol across all environments (localnet, devnet, mainnet).

## Pre-Deployment Checklist

### 1. Build Verification
```bash
cd contracts/solana
anchor build --verifiable
```

**Expected**: All 7 programs compile without warnings

### 2. Test Suite
```bash
anchor test
```

**Expected**: All integration tests pass (100%)

### 3. Security Checks
```bash
cargo audit
cargo clippy -- -D warnings
cargo geiger
```

**Expected**: Zero vulnerabilities, zero warnings, minimal unsafe code

### 4. Program Sizes
```bash
ls -lh target/deploy/*.so
```

**Expected**: All programs < 200KB (ideally < 100KB)

## Deployment Environments

### Localnet Deployment

**1. Start Local Validator**
```bash
solana-test-validator \
  --reset \
  --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s target/deploy/mpl_token_metadata.so
```

**2. Deploy Programs**
```bash
anchor deploy
```

**3. Initialize Hub Config**
```bash
ts-node scripts/initialize-hub.ts --cluster localnet
```

### Devnet Deployment

**1. Set Cluster**
```bash
solana config set --url devnet
```

**2. Fund Deployer Wallet**
```bash
solana airdrop 5
```

**3. Deploy Programs**
```bash
anchor deploy --provider.cluster devnet
```

**4. Verify Deployment**
```bash
solana program show <PROGRAM_ID>
```

**5. Initialize Protocol**
```bash
ts-node scripts/initialize-protocol.ts \
  --cluster devnet \
  --admin <ADMIN_PUBKEY> \
  --treasury <TREASURY_PUBKEY> \
  --warchest <WARCHEST_PUBKEY>
```

### Mainnet Deployment

**CRITICAL**: Use multi-signature for all mainnet operations

**1. Build Verifiable**
```bash
anchor build --verifiable --provider.cluster mainnet
```

**2. Upload Program Buffers**
```bash
solana program write-buffer target/deploy/hub.so \
  --keypair ~/.config/solana/mainnet-deployer.json
```

**3. Deploy with Multi-Sig**
```bash
# Use Squads Protocol for multi-sig deployment
# See https://squads.so/
```

**4. Verify Bytecode**
```bash
anchor verify <PROGRAM_ID> --provider.cluster mainnet
```

## Deployment Scripts

### Hub Initialization Script

Create `scripts/initialize-hub.ts`:

```typescript
import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import fs from 'fs';

interface HubInitParams {
  admin: PublicKey;
  treasury: PublicKey;
  warchest: PublicKey;
  programAddresses: {
    offer: PublicKey;
    trade: PublicKey;
    profile: PublicKey;
    escrow: PublicKey;
    arbitrator: PublicKey;
    priceOracle: PublicKey;
  };
  fees: {
    burnFeePct: number;
    chainFeePct: number;
    warchestFeePct: number;
    conversionFeePct: number;
    arbitratorFeePct: number;
  };
  limits: {
    minTradeAmount: anchor.BN;
    maxTradeAmount: anchor.BN;
    maxActiveOffers: number;
    maxActiveTrades: number;
  };
  timers: {
    tradeExpirationTimer: anchor.BN;
    tradeDisputeTimer: anchor.BN;
  };
}

async function initializeHub(cluster: string) {
  // Load config
  const config: HubInitParams = JSON.parse(
    fs.readFileSync(`config/hub-${cluster}.json`, 'utf-8')
  );

  // Setup provider
  const connection = new Connection(getClusterUrl(cluster), 'confirmed');
  const wallet = loadWallet();
  const provider = new anchor.AnchorProvider(connection, wallet, {});

  // Load Hub program
  const program = anchor.workspace.Hub;

  // Derive Hub config PDA
  const [hubConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('hub_config')],
    program.programId
  );

  console.log('Initializing Hub config at:', hubConfig.toBase58());

  // Initialize Hub
  const tx = await program.methods
    .initialize({
      offerProgram: config.programAddresses.offer,
      tradeProgram: config.programAddresses.trade,
      profileProgram: config.programAddresses.profile,
      escrowProgram: config.programAddresses.escrow,
      arbitratorProgram: config.programAddresses.arbitrator,
      priceOracleProgram: config.programAddresses.priceOracle,
      ...config.fees,
      ...config.limits,
      ...config.timers,
      treasury: config.treasury,
      warchest: config.warchest,
    })
    .accounts({
      hubConfig,
      admin: config.admin,
    })
    .rpc();

  console.log('Hub initialized! Signature:', tx);
  console.log('Hub config:', hubConfig.toBase58());

  // Verify
  const hubData = await program.account.hubConfig.fetch(hubConfig);
  console.log('Hub data:', hubData);
}

function getClusterUrl(cluster: string): string {
  switch (cluster) {
    case 'localnet': return 'http://localhost:8899';
    case 'devnet': return 'https://api.devnet.solana.com';
    case 'mainnet': return 'https://api.mainnet-beta.solana.com';
    default: throw new Error(`Unknown cluster: ${cluster}`);
  }
}

function loadWallet(): anchor.Wallet {
  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(
      fs.readFileSync(process.env.WALLET_PATH || '~/.config/solana/id.json', 'utf-8')
    ))
  );
  return new anchor.Wallet(keypair);
}

// CLI
const cluster = process.argv[2] || 'localnet';
initializeHub(cluster).catch(console.error);
```

### Price Oracle Seeding

Create `scripts/seed-price-oracle.ts`:

```typescript
import { LocalMoneySDK } from '@localmoney/solana-sdk';
import { Connection, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';

const FIAT_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'BRL', 'MXN',
  // ... all 155 currencies from currencies.rs
];

async function seedPriceOracle(cluster: string) {
  const connection = new Connection(getClusterUrl(cluster));
  const wallet = loadWallet();
  const sdk = await LocalMoneySDK.create({ connection, wallet });

  for (const currency of FIAT_CURRENCIES) {
    console.log(`Initializing price for ${currency}...`);

    const currencyBytes = Buffer.from(currency);
    await sdk.priceOracle.initializePrice({
      fiatCurrency: currencyBytes,
    });

    // Set initial price (e.g., $1 = 1,000,000 for USDC)
    await sdk.priceOracle.updatePrice({
      fiatCurrency: currencyBytes,
      price: new anchor.BN(1_000_000),
    });
  }

  console.log('Price oracle seeded!');
}

seedPriceOracle(process.argv[2] || 'devnet').catch(console.error);
```

### Arbitrator Registration

Create `scripts/register-arbitrators.ts`:

```typescript
async function registerArbitrators(cluster: string) {
  const sdk = await LocalMoneySDK.create({ connection, wallet });

  const arbitrators = JSON.parse(
    fs.readFileSync(`config/arbitrators-${cluster}.json`, 'utf-8')
  );

  for (const arb of arbitrators) {
    console.log(`Registering ${arb.pubkey} for ${arb.currencies.join(', ')}...`);

    for (const currency of arb.currencies) {
      await sdk.arbitrator.registerArbitrator({
        arbitratorPubkey: new PublicKey(arb.pubkey),
        fiatCurrency: Buffer.from(currency),
      });
    }
  }

  console.log('Arbitrators registered!');
}
```

## Configuration Files

### Hub Config (Devnet)

Create `config/hub-devnet.json`:

```json
{
  "admin": "YOUR_ADMIN_PUBKEY",
  "treasury": "YOUR_TREASURY_PUBKEY",
  "warchest": "YOUR_WARCHEST_PUBKEY",
  "programAddresses": {
    "offer": "CZR8LiYhioRCc9qYFBfMkQ3JnkgU2PfAD8fMLN5WrNDo",
    "trade": "5fRDb9S3Z61fBALmDHNV5EH7GDP8gsCGkQT8eawDL1kE",
    "profile": "86KWUvm3YK3fsSqSF1iLCRB2mLmHFcGUozFvD823Npf5",
    "escrow": "CfpW1FrK41jj5tv1JRBxgRTqRr7Yeok9HeqnaUMg46VJ",
    "arbitrator": "J5BNGJ128bxHuWemwaoGkDqy8DVSvsA7o5kpdy9eDoNe",
    "priceOracle": "CwWd4PCPx85fgREweU3UWWd6kxhtqRVd9xh2iVMT9Rbw"
  },
  "fees": {
    "burnFeePct": 100,
    "chainFeePct": 150,
    "warchestFeePct": 150,
    "conversionFeePct": 200,
    "arbitratorFeePct": 100
  },
  "limits": {
    "minTradeAmount": "1000000",
    "maxTradeAmount": "10000000000",
    "maxActiveOffers": 10,
    "maxActiveTrades": 5
  },
  "timers": {
    "tradeExpirationTimer": "86400",
    "tradeDisputeTimer": "259200"
  }
}
```

## Post-Deployment Verification

### 1. Verify Program Deployment
```bash
solana program show <PROGRAM_ID>
```

**Check**:
- Authority matches deployer or multi-sig
- Last deployment timestamp
- Data length

### 2. Verify Hub Initialization
```typescript
const hubConfig = await sdk.hub.getConfig();
console.log('Admin:', hubConfig.admin.toBase58());
console.log('Programs registered:', hubConfig);
console.log('Fees configured:', hubConfig);
```

### 3. Test Basic Operations
```bash
ts-node scripts/test-deployment.ts --cluster devnet
```

Operations to test:
- Create profile
- Create offer
- Initialize price
- Register arbitrator

### 4. Monitor Initial Transactions
```bash
solana logs <PROGRAM_ID> --url devnet
```

## Rollback Procedure

If issues are detected after deployment:

### 1. Circuit Breaker
```typescript
await sdk.hub.setCircuitBreaker({
  globalPause: true,
});
```

### 2. Rollback Program
```bash
solana program deploy \
  --program-id <PROGRAM_ID> \
  --buffer <PREVIOUS_BUFFER_ADDRESS> \
  --upgrade-authority ~/.config/solana/mainnet-deployer.json
```

### 3. Notify Users
- Update status page
- Post announcement
- Provide timeline

## Monitoring Setup

### 1. RPC Monitoring (Helius, QuickNode)
- Track program calls
- Monitor error rates
- Alert on anomalies

### 2. Account Monitoring
- Hub config changes
- Large trades
- Dispute initiations

### 3. Health Checks
```typescript
setInterval(async () => {
  try {
    const hubConfig = await sdk.hub.getConfig();
    if (hubConfig.globalPause) {
      alert('Protocol is paused!');
    }
  } catch (error) {
    alert('Hub config fetch failed!', error);
  }
}, 60000); // Every minute
```

## Upgrade Procedure

### 1. Build New Version
```bash
anchor build --verifiable
```

### 2. Test on Devnet
```bash
anchor deploy --provider.cluster devnet
anchor test --provider.cluster devnet
```

### 3. Mainnet Upgrade (Multi-Sig)
```bash
# Upload buffer
solana program write-buffer target/deploy/hub.so

# Create multi-sig proposal
squads proposal create --program-id <PROGRAM_ID> --buffer <BUFFER>

# Collect signatures
# Execute upgrade
```

### 4. Verify Upgrade
```bash
anchor verify <PROGRAM_ID> --provider.cluster mainnet
```

## Acceptance Criteria

- [ ] All programs deployed successfully to devnet
- [ ] Hub config initialized with correct values
- [ ] All 155 price feeds initialized
- [ ] Initial arbitrators registered
- [ ] Post-deployment tests pass
- [ ] Monitoring active and alerting configured
- [ ] Rollback procedure tested
- [ ] Upgrade authority transferred to multi-sig (mainnet only)
- [ ] Documentation complete (runbooks, FAQs)
- [ ] User-facing documentation updated

## Estimated Time

- Environment setup: 2 hours
- Script development: 6-8 hours
- Devnet deployment: 2-3 hours
- Mainnet deployment (with multi-sig): 4-6 hours
- Monitoring setup: 2-3 hours
- **Total**: 16-22 hours (1-2 days)

---

**Status**: Ready for execution
**Next Step**: Create configuration files and test on localnet
