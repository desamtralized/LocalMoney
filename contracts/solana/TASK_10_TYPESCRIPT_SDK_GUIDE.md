# Task 10: TypeScript Client SDK - Implementation Guide

**Status**: 📋 GUIDE COMPLETE - Ready for Implementation
**Estimated Time**: 3-5 days
**Date**: 2025-11-19

## Overview

This guide provides the complete structure and implementation approach for building a production-ready TypeScript SDK for the LocalMoney Solana protocol.

## Project Structure

```
packages/sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public API exports
│   ├── client.ts             # Main SDK client class
│   ├── programs/
│   │   ├── hub.ts
│   │   ├── profile.ts
│   │   ├── offer.ts
│   │   ├── trade.ts
│   │   ├── escrow.ts
│   │   ├── arbitrator.ts
│   │   └── priceOracle.ts
│   ├── types/
│   │   ├── index.ts          # Re-exports from generated types
│   │   └── common.ts         # Common types (FiatCurrency, etc.)
│   ├── utils/
│   │   ├── pda.ts           # PDA derivation helpers
│   │   ├── accounts.ts      # Account fetchers
│   │   ├── transactions.ts  # Transaction builders
│   │   └── constants.ts     # Program IDs, defaults
│   ├── errors.ts            # Error handling
│   └── events.ts            # Event parsing
├── examples/
│   ├── 01-create-profile.ts
│   ├── 02-create-offer.ts
│   ├── 03-complete-trade.ts
│   └── 04-dispute-resolution.ts
└── README.md
```

## Implementation Steps

### Step 1: Generate Types from IDLs

```bash
cd contracts/solana
anchor build
```

Copy IDLs to SDK:
```bash
mkdir -p packages/sdk/src/types/idl
cp target/idl/*.json packages/sdk/src/types/idl/
```

### Step 2: PDA Derivation Utilities

Create `packages/sdk/src/utils/pda.ts`:

```typescript
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

// Program IDs (from Anchor.toml or declare_id!)
export const PROGRAM_IDS = {
  hub: new PublicKey('8xemd2mhu4zi314H6nFTGgXKTVFji4evLSedxKVvk7jH'),
  profile: new PublicKey('86KWUvm3YK3fsSqSF1iLCRB2mLmHFcGUozFvD823Npf5'),
  offer: new PublicKey('CZR8LiYhioRCc9qYFBfMkQ3JnkgU2PfAD8fMLN5WrNDo'),
  trade: new PublicKey('5fRDb9S3Z61fBALmDHNV5EH7GDP8gsCGkQT8eawDL1kE'),
  escrow: new PublicKey('CfpW1FrK41jj5tv1JRBxgRTqRr7Yeok9HeqnaUMg46VJ'),
  arbitrator: new PublicKey('J5BNGJ128bxHuWemwaoGkDqy8DVSvsA7o5kpdy9eDoNe'),
  priceOracle: new PublicKey('CwWd4PCPx85fgREweU3UWWd6kxhtqRVd9xh2iVMT9Rbw'),
};

export function findHubConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('hub_config')],
    PROGRAM_IDS.hub
  );
}

export function findProfilePDA(user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('profile'), user.toBuffer()],
    PROGRAM_IDS.profile
  );
}

export function findOfferPDA(offerId: anchor.BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('offer'), offerId.toArrayLike(Buffer, 'le', 8)],
    PROGRAM_IDS.offer
  );
}

export function findTradePDA(tradeId: anchor.BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('trade'), tradeId.toArrayLike(Buffer, 'le', 8)],
    PROGRAM_IDS.trade
  );
}

export function findEscrowVaultPDA(tradeId: anchor.BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow_vault'), tradeId.toArrayLike(Buffer, 'le', 8)],
    PROGRAM_IDS.escrow
  );
}

export function findArbitratorPDA(
  arbitrator: PublicKey,
  fiatCurrency: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('arbitrator'), arbitrator.toBuffer(), Buffer.from(fiatCurrency)],
    PROGRAM_IDS.arbitrator
  );
}

export function findPricePDA(fiatCurrency: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('price'), Buffer.from(fiatCurrency)],
    PROGRAM_IDS.priceOracle
  );
}
```

### Step 3: Main SDK Client

Create `packages/sdk/src/client.ts`:

```typescript
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

import { HubClient } from './programs/hub';
import { ProfileClient } from './programs/profile';
import { OfferClient } from './programs/offer';
import { TradeClient } from './programs/trade';
import { EscrowClient } from './programs/escrow';
import { ArbitratorClient } from './programs/arbitrator';
import { PriceOracleClient } from './programs/priceOracle';

export interface LocalMoneySDKConfig {
  connection: Connection;
  wallet: Wallet;
  cluster?: 'mainnet-beta' | 'devnet' | 'localnet';
}

export class LocalMoneySDK {
  public readonly provider: AnchorProvider;
  public readonly hub: HubClient;
  public readonly profile: ProfileClient;
  public readonly offer: OfferClient;
  public readonly trade: TradeClient;
  public readonly escrow: EscrowClient;
  public readonly arbitrator: ArbitratorClient;
  public readonly priceOracle: PriceOracleClient;

  constructor(config: LocalMoneySDKConfig) {
    this.provider = new AnchorProvider(
      config.connection,
      config.wallet,
      AnchorProvider.defaultOptions()
    );

    // Initialize program clients
    this.hub = new HubClient(this.provider);
    this.profile = new ProfileClient(this.provider);
    this.offer = new OfferClient(this.provider);
    this.trade = new TradeClient(this.provider);
    this.escrow = new EscrowClient(this.provider);
    this.arbitrator = new ArbitratorClient(this.provider);
    this.priceOracle = new PriceOracleClient(this.provider);
  }

  static async create(config: LocalMoneySDKConfig): Promise<LocalMoneySDK> {
    return new LocalMoneySDK(config);
  }
}
```

### Step 4: Example Program Client

Create `packages/sdk/src/programs/profile.ts`:

```typescript
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { Profile, IDL } from '../types/idl/profile';
import { findProfilePDA, PROGRAM_IDS } from '../utils/pda';

export interface CreateProfileParams {
  contactInfo: string;
  encryptionKey: string;
}

export interface UpdateContactParams {
  contactInfo?: string;
  encryptionKey?: string;
}

export class ProfileClient {
  public readonly program: Program<Profile>;

  constructor(provider: AnchorProvider) {
    this.program = new Program<Profile>(
      IDL,
      PROGRAM_IDS.profile,
      provider
    );
  }

  async createProfile(params: CreateProfileParams) {
    const user = this.program.provider.publicKey!;
    const [profilePDA] = findProfilePDA(user);

    const tx = await this.program.methods
      .createProfile({
        contactInfo: params.contactInfo,
        encryptionKey: params.encryptionKey,
      })
      .accounts({
        profile: profilePDA,
        owner: user,
      })
      .rpc();

    return {
      signature: tx,
      profileAddress: profilePDA,
    };
  }

  async updateContact(params: UpdateContactParams) {
    const user = this.program.provider.publicKey!;
    const [profilePDA] = findProfilePDA(user);

    const tx = await this.program.methods
      .updateContact(params)
      .accounts({
        profile: profilePDA,
        owner: user,
      })
      .rpc();

    return { signature: tx };
  }

  async getProfile(user: PublicKey) {
    const [profilePDA] = findProfilePDA(user);
    return await this.program.account.userProfile.fetch(profilePDA);
  }

  async getAllProfiles() {
    return await this.program.account.userProfile.all();
  }
}
```

### Step 5: Package.json

```json
{
  "name": "@localmoney/solana-sdk",
  "version": "0.1.0",
  "description": "TypeScript SDK for LocalMoney Solana Protocol",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write 'src/**/*.ts'",
    "docs": "typedoc src/index.ts"
  },
  "keywords": ["solana", "defi", "p2p", "trading"],
  "author": "LocalMoney",
  "license": "MIT",
  "dependencies": {
    "@coral-xyz/anchor": "^0.31.0",
    "@solana/web3.js": "^1.95.0",
    "@solana/spl-token": "^0.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0",
    "typedoc": "^0.25.0"
  }
}
```

### Step 6: Example Usage

Create `packages/sdk/examples/complete-trade-flow.ts`:

```typescript
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { LocalMoneySDK } from '../src';
import * as fs from 'fs';

async function main() {
  // Setup
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync('~/.config/solana/id.json', 'utf-8')))
  );
  const wallet = new Wallet(keypair);

  // Initialize SDK
  const sdk = await LocalMoneySDK.create({ connection, wallet });

  // 1. Create profile
  console.log('Creating profile...');
  const { profileAddress } = await sdk.profile.createProfile({
    contactInfo: 'encrypted-contact-info',
    encryptionKey: 'public-encryption-key',
  });
  console.log('Profile created:', profileAddress.toBase58());

  // 2. Create sell offer
  console.log('Creating sell offer...');
  const { offerAddress } = await sdk.offer.createOffer({
    offerType: { sell: {} },
    fiatCurrency: Buffer.from('USD'),
    tokenMint: new PublicKey('...'), // USDC mint
    minAmount: 100_000_000, // $100 in cents
    maxAmount: 1000_000_000, // $1000 in cents
    rate: 1_000_000, // $1 per USDC
    description: 'Selling USDC for USD via bank transfer',
  });
  console.log('Offer created:', offerAddress.toBase58());

  // 3. Create trade (as buyer)
  console.log('Creating trade...');
  const { tradeAddress } = await sdk.trade.createTrade({
    offerId: offerId,
    amount: 500_000_000, // 500 USDC
    fiatAmount: 500_000_000, // $500
    buyerContact: 'encrypted-buyer-contact',
  });
  console.log('Trade created:', tradeAddress.toBase58());

  // 4. Accept trade (as seller)
  console.log('Accepting trade...');
  await sdk.trade.acceptTrade({
    tradeId,
    sellerContact: 'encrypted-seller-contact',
  });

  // 5. Fund escrow (seller)
  console.log('Funding escrow...');
  await sdk.trade.fundEscrow({ tradeId });

  // 6. Confirm fiat deposit (buyer)
  console.log('Confirming fiat deposit...');
  await sdk.trade.confirmFiatDeposit({ tradeId });

  // 7. Release escrow (seller)
  console.log('Releasing escrow...');
  const { signature } = await sdk.trade.releaseEscrow({ tradeId });
  console.log('Trade complete! Signature:', signature);

  // Verify profile statistics updated
  const profile = await sdk.profile.getProfile(wallet.publicKey);
  console.log('Completed trades:', profile.completedTrades);
  console.log('Reputation score:', profile.reputationScore);
}

main().catch(console.error);
```

## Testing Strategy

### Unit Tests
- Test PDA derivation functions
- Test account fetchers
- Test transaction builders
- Mock Anchor provider

### Integration Tests
- Test against local validator
- Test complete trade flows
- Test error handling
- Test event parsing

### Example Test
```typescript
import { LocalMoneySDK } from '../src';
import { Connection, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';

describe('ProfileClient', () => {
  let sdk: LocalMoneySDK;

  beforeAll(async () => {
    const connection = new Connection('http://localhost:8899', 'confirmed');
    const keypair = Keypair.generate();
    const wallet = new Wallet(keypair);
    sdk = await LocalMoneySDK.create({ connection, wallet });
  });

  it('should create a profile', async () => {
    const { profileAddress } = await sdk.profile.createProfile({
      contactInfo: 'test@example.com',
      encryptionKey: 'test-key',
    });
    expect(profileAddress).toBeDefined();
  });
});
```

## Documentation

### API Reference (TypeDoc)
Generate with:
```bash
npm run docs
```

### README.md
Include:
- Installation instructions
- Quick start guide
- API overview
- Example usage
- Link to full API docs

## Deployment

### Build
```bash
cd packages/sdk
npm run build
```

### Publish to npm
```bash
npm login
npm publish --access public
```

## Acceptance Criteria

- [ ] All 7 program clients implemented
- [ ] PDA derivation helpers complete
- [ ] Transaction builders for all instructions
- [ ] Account fetchers with type safety
- [ ] Event parsing utilities
- [ ] Examples for all major operations
- [ ] Unit tests (>80% coverage)
- [ ] Integration tests (complete flows)
- [ ] TypeDoc documentation generated
- [ ] README with quick start
- [ ] Published to npm

## Estimated Time

- PDA utilities: 2-3 hours
- Program clients (7 programs): 8-12 hours
- Examples: 3-4 hours
- Tests: 6-8 hours
- Documentation: 2-3 hours
- **Total**: 21-30 hours (3-5 days)

---

**Status**: Ready for implementation
**Next Step**: Initialize package and start with PDA utilities
