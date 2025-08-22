# PRP: Phase 3 - SDK Overhaul

## Objective
Transform the monolithic SDK into a three-layer architecture (instructions, transactions, RPC) following Squads Protocol patterns, implement code generation from IDL using Solita or Anchor's native generator, add comprehensive TypeScript types, and create test utilities for improved developer experience.

## Context and Research Findings

### Current SDK Issues
Based on `/contracts/solana/sdk/src/index.ts`:
- **Monolithic Class**: All functionality mixed in single file (1000+ lines expected)
- **Manual Type Definitions**: Types imported from generated files but not properly structured
- **No Layer Separation**: Instructions, transactions, and RPC mixed together
- **Limited Test Utilities**: No fixture generators or scenario testers
- **Type Safety Issues**: Manual IDL imports without proper code generation pipeline

### Squads Protocol SDK Architecture
From `SQUADS_PROTOCOL_ANALYSIS.md` (lines 134-144):
```typescript
// Layer 1: Instructions (raw instruction builders)
export * as instructions from "./instructions";

// Layer 2: Transactions (unsigned transaction builders)  
export * as transactions from "./transactions";

// Layer 3: RPC (signed transaction executors)
export * as rpc from "./rpc";
```

### Existing Infrastructure
- IDL files exist: `hub.json`, `profile.json`, `price.json`, `offer.json`, `trade.json`
- Basic types imported from `./types/` directory
- Anchor/Coral-xyz dependencies in place
- Test files in `/contracts/solana/sdk/tests/`

## Implementation Blueprint

### Task Order
1. Set up code generation pipeline (Solita or Anchor IDL)
2. Create three-layer directory structure
3. Generate type-safe instruction builders (Layer 1)
4. Implement transaction composers (Layer 2)
5. Build RPC execution layer (Layer 3)
6. Create domain-specific SDK modules
7. Implement test utilities and fixtures
8. Add comprehensive TypeScript types
9. Create example usage and documentation

### Target SDK Architecture
```
contracts/solana/sdk/
├── src/
│   ├── index.ts                 // Main exports
│   ├── generated/               // Auto-generated from IDL
│   │   ├── hub/
│   │   ├── offer/
│   │   ├── price/
│   │   ├── profile/
│   │   └── trade/
│   ├── instructions/            // Layer 1: Raw instructions
│   │   ├── index.ts
│   │   ├── hub.ts
│   │   ├── offer.ts
│   │   ├── price.ts
│   │   ├── profile.ts
│   │   └── trade.ts
│   ├── transactions/            // Layer 2: Transaction builders
│   │   ├── index.ts
│   │   ├── trading-flow.ts
│   │   ├── offer-management.ts
│   │   ├── profile-setup.ts
│   │   └── composites.ts
│   ├── rpc/                     // Layer 3: RPC executors
│   │   ├── index.ts
│   │   ├── methods.ts
│   │   ├── confirmations.ts
│   │   └── error-handling.ts
│   ├── pdas/                    // PDA derivation helpers
│   │   ├── index.ts
│   │   └── derivations.ts
│   ├── utils/                   // Utility functions
│   │   ├── index.ts
│   │   ├── byte-utils.ts
│   │   ├── bn-utils.ts
│   │   └── validation.ts
│   ├── modules/                 // Domain-specific SDKs
│   │   ├── TradingSDK.ts
│   │   ├── OfferSDK.ts
│   │   ├── ProfileSDK.ts
│   │   └── PriceSDK.ts
│   └── test-utils/              // Test utilities
│       ├── index.ts
│       ├── fixtures.ts
│       ├── scenarios.ts
│       └── validators.ts
├── tests/
├── package.json
└── tsconfig.json
```

## Specific Implementation Details

### 1. Code Generation Setup

#### Option A: Using Solita (Recommended)
```json
// package.json scripts
{
  "scripts": {
    "generate": "npm run generate:idl && npm run generate:types",
    "generate:idl": "anchor build && anchor idl init --filepath target/idl/*.json",
    "generate:types": "solita -k ./src/generated"
  }
}
```

```bash
# Install Solita
npm install --save-dev @metaplex-foundation/solita

# Create .solitarc.js configuration
```

```javascript
// .solitarc.js
const path = require('path');

module.exports = {
  idlDir: path.join(__dirname, '../target/idl'),
  sdkDir: path.join(__dirname, 'src/generated'),
  binaryInstallDir: path.join(__dirname, '.solita'),
  programName: 'localmoney',
  programId: 'LOCAL11111111111111111111111111111111111111',
  idls: [
    { name: 'hub', programId: 'HUB111111111111111111111111111111111111111' },
    { name: 'offer', programId: 'OFFER1111111111111111111111111111111111111' },
    { name: 'price', programId: 'PRICE1111111111111111111111111111111111111' },
    { name: 'profile', programId: 'PROF11111111111111111111111111111111111111' },
    { name: 'trade', programId: '5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM' },
  ],
};
```

#### Option B: Using Anchor's Native Generator
```typescript
// scripts/generate-types.ts
import { IdlCoder } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';

const IDL_DIR = '../target/idl';
const OUTPUT_DIR = './src/generated';

function generateTypes(idlName: string) {
  const idl = JSON.parse(
    fs.readFileSync(path.join(IDL_DIR, `${idlName}.json`), 'utf-8')
  );
  
  // Generate TypeScript types
  const types = IdlCoder.generateTypes(idl);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, idlName, 'types.ts'),
    types
  );
  
  // Generate instruction builders
  const instructions = IdlCoder.generateInstructions(idl);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, idlName, 'instructions.ts'),
    instructions
  );
}

['hub', 'offer', 'price', 'profile', 'trade'].forEach(generateTypes);
```

### 2. Layer 1: Instructions

```typescript
// src/instructions/trade.ts
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import * as generated from '../generated/trade';
import { deriveTradeAddress } from '../pdas';

export interface CreateTradeInstructionArgs {
  tradeId: BN;
  offerId: BN;
  amount: BN;
  lockedPrice: BN;
  expiryDuration: BN;
  buyerContact: string;
  arbitrator: PublicKey;
}

export function createTradeInstruction(
  accounts: {
    trade: PublicKey;
    buyer: PublicKey;
    offer: PublicKey;
    seller: PublicKey;
    tokenMint: PublicKey;
    hubConfig: PublicKey;
    profileProgram: PublicKey;
    offerProgram: PublicKey;
    priceProgram: PublicKey;
    systemProgram: PublicKey;
  },
  args: CreateTradeInstructionArgs,
  programId: PublicKey
): TransactionInstruction {
  return generated.createCreateTradeInstruction(
    accounts,
    args,
    programId
  );
}

export function acceptRequestInstruction(
  accounts: {
    trade: PublicKey;
    seller: PublicKey;
    sellerProfile: PublicKey;
    profileProgram: PublicKey;
  },
  args: { tradeId: BN },
  programId: PublicKey
): TransactionInstruction {
  return generated.createAcceptRequestInstruction(
    accounts,
    args,
    programId
  );
}

// Additional instruction builders...
```

### 3. Layer 2: Transactions

```typescript
// src/transactions/trading-flow.ts
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { 
  createTradeInstruction,
  acceptRequestInstruction,
  fundEscrowInstruction,
  releaseEscrowInstruction
} from '../instructions/trade';
import { deriveTradeAddress, deriveEscrowAddress } from '../pdas';
import BN from 'bn.js';

export interface TradingFlowParams {
  tradeId: BN;
  offerId: BN;
  amount: BN;
  buyer: PublicKey;
  seller: PublicKey;
  tokenMint: PublicKey;
}

export async function buildCreateTradeTx(
  connection: Connection,
  params: TradingFlowParams
): Promise<Transaction> {
  const tx = new Transaction();
  
  // Derive PDAs
  const [tradeAddress] = deriveTradeAddress(params.tradeId);
  const [escrowAddress] = deriveEscrowAddress(params.tradeId);
  
  // Add instruction
  tx.add(
    createTradeInstruction(
      {
        trade: tradeAddress,
        buyer: params.buyer,
        // ... other accounts
      },
      {
        tradeId: params.tradeId,
        offerId: params.offerId,
        amount: params.amount,
        // ... other args
      },
      TRADE_PROGRAM_ID
    )
  );
  
  // Set recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.buyer;
  
  return tx;
}

export async function buildCompleteTradingFlowTx(
  connection: Connection,
  params: TradingFlowParams
): Promise<Transaction[]> {
  const txs: Transaction[] = [];
  
  // Transaction 1: Create trade
  txs.push(await buildCreateTradeTx(connection, params));
  
  // Transaction 2: Accept and fund
  const acceptFundTx = new Transaction();
  acceptFundTx.add(
    acceptRequestInstruction(/* ... */),
    fundEscrowInstruction(/* ... */)
  );
  txs.push(acceptFundTx);
  
  // Transaction 3: Release
  const releaseTx = new Transaction();
  releaseTx.add(releaseEscrowInstruction(/* ... */));
  txs.push(releaseTx);
  
  return txs;
}
```

### 4. Layer 3: RPC Methods

```typescript
// src/rpc/methods.ts
import { Connection, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as transactions from '../transactions';
import { confirmTransaction, TransactionError } from './confirmations';

export class LocalMoneyRPC {
  constructor(
    private connection: Connection,
    private wallet: Wallet,
    private options: {
      commitment?: Commitment;
      skipPreflight?: boolean;
      maxRetries?: number;
    } = {}
  ) {}
  
  async createTrade(params: CreateTradeParams): Promise<string> {
    try {
      // Build transaction
      const tx = await transactions.buildCreateTradeTx(
        this.connection,
        params
      );
      
      // Sign transaction
      tx.partialSign(this.wallet.payer);
      
      // Send and confirm
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.wallet.payer],
        {
          commitment: this.options.commitment || 'confirmed',
          skipPreflight: this.options.skipPreflight || false,
        }
      );
      
      return signature;
    } catch (error) {
      throw new TransactionError('Failed to create trade', error);
    }
  }
  
  async executeTradingFlow(
    params: TradingFlowParams
  ): Promise<string[]> {
    const txs = await transactions.buildCompleteTradingFlowTx(
      this.connection,
      params
    );
    
    const signatures: string[] = [];
    
    for (const tx of txs) {
      const sig = await this.sendAndConfirm(tx);
      signatures.push(sig);
      
      // Wait for confirmation before next transaction
      await this.confirmTransaction(sig);
    }
    
    return signatures;
  }
  
  private async sendAndConfirm(tx: Transaction): Promise<string> {
    let retries = 0;
    const maxRetries = this.options.maxRetries || 3;
    
    while (retries < maxRetries) {
      try {
        return await sendAndConfirmTransaction(
          this.connection,
          tx,
          [this.wallet.payer]
        );
      } catch (error) {
        retries++;
        if (retries >= maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
    
    throw new Error('Max retries exceeded');
  }
}
```

### 5. PDA Derivation Helpers

```typescript
// src/pdas/derivations.ts
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

const SEED_PREFIX = Buffer.from('localmoney');
const SEED_TRADE = Buffer.from('trade');
const SEED_OFFER = Buffer.from('offer');
const SEED_PROFILE = Buffer.from('profile');
const SEED_ESCROW = Buffer.from('escrow');

export function deriveTradeAddress(
  tradeId: BN,
  programId: PublicKey = TRADE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_TRADE, tradeId.toArrayLike(Buffer, 'le', 8)],
    programId
  );
}

export function deriveOfferAddress(
  offerId: BN,
  programId: PublicKey = OFFER_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_OFFER, offerId.toArrayLike(Buffer, 'le', 8)],
    programId
  );
}

export function deriveProfileAddress(
  user: PublicKey,
  programId: PublicKey = PROFILE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIX, SEED_PROFILE, user.toBuffer()],
    programId
  );
}

export function deriveEscrowAddress(
  tradeId: BN,
  programId: PublicKey = TRADE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      SEED_PREFIX,
      SEED_TRADE,
      tradeId.toArrayLike(Buffer, 'le', 8),
      SEED_ESCROW
    ],
    programId
  );
}
```

### 6. Domain-Specific SDK Modules

```typescript
// src/modules/TradingSDK.ts
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program } from '@coral-xyz/anchor';
import * as instructions from '../instructions/trade';
import * as transactions from '../transactions/trading-flow';
import * as rpc from '../rpc';
import { deriveTradeAddress } from '../pdas';
import BN from 'bn.js';

export class TradingSDK {
  private program: Program;
  private rpc: rpc.LocalMoneyRPC;
  
  constructor(
    private connection: Connection,
    private wallet: Wallet,
    private programId: PublicKey = TRADE_PROGRAM_ID
  ) {
    const provider = new AnchorProvider(connection, wallet, {});
    this.program = new Program(TradeIDL, programId, provider);
    this.rpc = new rpc.LocalMoneyRPC(connection, wallet);
  }
  
  // High-level methods
  async createTrade(params: {
    offerId: number;
    amount: number;
    buyerContact: string;
    expiryDuration?: number;
  }): Promise<{
    signature: string;
    tradeId: BN;
    tradeAddress: PublicKey;
  }> {
    const tradeId = new BN(Date.now());
    const [tradeAddress] = deriveTradeAddress(tradeId);
    
    const signature = await this.rpc.createTrade({
      tradeId,
      offerId: new BN(params.offerId),
      amount: new BN(params.amount),
      buyerContact: params.buyerContact,
      expiryDuration: new BN(params.expiryDuration || 86400),
      buyer: this.wallet.publicKey,
    });
    
    return { signature, tradeId, tradeAddress };
  }
  
  async getTrade(tradeId: BN): Promise<Trade> {
    const [tradeAddress] = deriveTradeAddress(tradeId);
    return await this.program.account.trade.fetch(tradeAddress);
  }
  
  async acceptTrade(tradeId: BN): Promise<string> {
    return await this.rpc.acceptRequest({ tradeId });
  }
  
  async fundEscrow(tradeId: BN, amount: BN): Promise<string> {
    return await this.rpc.fundEscrow({ tradeId, amount });
  }
  
  async releaseFunds(tradeId: BN): Promise<string> {
    return await this.rpc.releaseEscrow({ tradeId });
  }
  
  // Query methods
  async getTradesByBuyer(buyer: PublicKey): Promise<Trade[]> {
    return await this.program.account.trade.all([
      {
        memcmp: {
          offset: 8 + 8, // After discriminator and id
          bytes: buyer.toBase58(),
        },
      },
    ]);
  }
  
  async getActiveTrades(): Promise<Trade[]> {
    const trades = await this.program.account.trade.all();
    return trades.filter(t => 
      t.account.state !== 'EscrowReleased' &&
      t.account.state !== 'EscrowRefunded' &&
      t.account.state !== 'RequestCancelled'
    );
  }
}
```

### 7. Test Utilities

```typescript
// src/test-utils/fixtures.ts
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { TradingSDK, OfferSDK, ProfileSDK } from '../modules';

export interface TestContext {
  connection: Connection;
  buyer: Keypair;
  seller: Keypair;
  tradingSdk: TradingSDK;
  offerSdk: OfferSDK;
  profileSdk: ProfileSDK;
}

export async function setupTestContext(): Promise<TestContext> {
  const connection = new Connection('http://localhost:8899', 'confirmed');
  
  const buyer = Keypair.generate();
  const seller = Keypair.generate();
  
  // Airdrop SOL
  await connection.requestAirdrop(buyer.publicKey, 10 * 1e9);
  await connection.requestAirdrop(seller.publicKey, 10 * 1e9);
  
  // Create SDKs
  const buyerWallet = new Wallet(buyer);
  const sellerWallet = new Wallet(seller);
  
  const tradingSdk = new TradingSDK(connection, buyerWallet);
  const offerSdk = new OfferSDK(connection, sellerWallet);
  const profileSdk = new ProfileSDK(connection, buyerWallet);
  
  return {
    connection,
    buyer,
    seller,
    tradingSdk,
    offerSdk,
    profileSdk,
  };
}

export async function createTestOffer(
  sdk: OfferSDK,
  options: Partial<{
    offerType: 'buy' | 'sell';
    amount: number;
    rate: number;
    minAmount: number;
    maxAmount: number;
  }> = {}
): Promise<{ offerId: BN; offerAddress: PublicKey }> {
  const defaults = {
    offerType: 'buy' as const,
    amount: 1000_000000, // 1000 USDC
    rate: 100, // 1:1 rate
    minAmount: 10_000000,
    maxAmount: 10000_000000,
  };
  
  const params = { ...defaults, ...options };
  
  return await sdk.createOffer(params);
}

export async function createTestTrade(
  sdk: TradingSDK,
  offerId: BN,
  options: Partial<{
    amount: number;
    buyerContact: string;
  }> = {}
): Promise<{ tradeId: BN; tradeAddress: PublicKey }> {
  const defaults = {
    amount: 100_000000, // 100 USDC
    buyerContact: 'test@example.com',
  };
  
  const params = { ...defaults, ...options };
  
  const result = await sdk.createTrade({
    offerId: offerId.toNumber(),
    ...params,
  });
  
  return {
    tradeId: result.tradeId,
    tradeAddress: result.tradeAddress,
  };
}
```

```typescript
// src/test-utils/scenarios.ts
export async function completeTradingScenario(
  context: TestContext
): Promise<void> {
  // 1. Create profiles
  await context.profileSdk.createProfile({
    username: 'buyer123',
    region: 'US',
  });
  
  const sellerProfileSdk = new ProfileSDK(
    context.connection,
    new Wallet(context.seller)
  );
  await sellerProfileSdk.createProfile({
    username: 'seller456',
    region: 'EU',
  });
  
  // 2. Create offer
  const { offerId } = await createTestOffer(context.offerSdk);
  
  // 3. Create trade
  const { tradeId } = await createTestTrade(
    context.tradingSdk,
    offerId
  );
  
  // 4. Accept trade (as seller)
  const sellerTradingSdk = new TradingSDK(
    context.connection,
    new Wallet(context.seller)
  );
  await sellerTradingSdk.acceptTrade(tradeId);
  
  // 5. Fund escrow
  await sellerTradingSdk.fundEscrow(tradeId, new BN(100_000000));
  
  // 6. Mark fiat deposited (buyer)
  await context.tradingSdk.markFiatDeposited(tradeId);
  
  // 7. Release funds (seller)
  await sellerTradingSdk.releaseFunds(tradeId);
  
  // Verify final state
  const trade = await context.tradingSdk.getTrade(tradeId);
  if (trade.state !== 'EscrowReleased') {
    throw new Error(`Expected EscrowReleased, got ${trade.state}`);
  }
}
```

### 8. Main SDK Entry Point

```typescript
// src/index.ts
// Layer 1: Instructions
export * as instructions from './instructions';

// Layer 2: Transactions
export * as transactions from './transactions';

// Layer 3: RPC
export * as rpc from './rpc';

// PDA Helpers
export * from './pdas';

// Utilities
export * from './utils';

// Domain SDKs
export { TradingSDK } from './modules/TradingSDK';
export { OfferSDK } from './modules/OfferSDK';
export { ProfileSDK } from './modules/ProfileSDK';
export { PriceSDK } from './modules/PriceSDK';

// Test Utilities
export * as testUtils from './test-utils';

// Generated Types
export * from './generated';

// Constants
export const PROGRAM_IDS = {
  hub: new PublicKey('HUB_PROGRAM_ID'),
  offer: new PublicKey('OFFER_PROGRAM_ID'),
  price: new PublicKey('PRICE_PROGRAM_ID'),
  profile: new PublicKey('PROFILE_PROGRAM_ID'),
  trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM'),
};

// Convenience class for backward compatibility
export class LocalMoneySDK {
  public trading: TradingSDK;
  public offers: OfferSDK;
  public profiles: ProfileSDK;
  public prices: PriceSDK;
  
  constructor(connection: Connection, wallet: Wallet) {
    this.trading = new TradingSDK(connection, wallet);
    this.offers = new OfferSDK(connection, wallet);
    this.profiles = new ProfileSDK(connection, wallet);
    this.prices = new PriceSDK(connection, wallet);
  }
}
```

## Validation Gates

```bash
# 1. Install dependencies and generate types
npm install
npm run generate

# 2. Verify three-layer structure
ls -la src/instructions/ src/transactions/ src/rpc/

# 3. Check generated types
ls -la src/generated/

# 4. Build TypeScript
npm run build

# 5. Run type checking
npm run typecheck

# 6. Test instruction builders
npm test -- src/instructions

# 7. Test transaction composers
npm test -- src/transactions

# 8. Test RPC methods
npm test -- src/rpc

# 9. Integration test with local validator
solana-test-validator &
npm run test:integration

# 10. Test utilities validation
npm run test:fixtures
```

## Error Handling Strategy

1. **Type Safety**: All parameters strongly typed with TypeScript
2. **Runtime Validation**: Validate inputs before building instructions
3. **RPC Errors**: Wrap Solana errors with context
4. **Retry Logic**: Automatic retry for transient failures
5. **Transaction Confirmation**: Proper confirmation with timeout

## Known Gotchas

1. **IDL Sync**: Keep IDL files updated after program changes
2. **Buffer Conversions**: Use consistent LE byte ordering
3. **PDA Derivation**: Must match exact program implementation
4. **Type Generation**: Regenerate after IDL changes
5. **Version Management**: Handle multiple program versions

## Migration Guide

```typescript
// Old SDK usage
const sdk = new LocalMoneySDK(connection, wallet);
await sdk.createTrade(/* mixed params */);

// New SDK usage - Option 1: Domain SDK
const tradingSdk = new TradingSDK(connection, wallet);
await tradingSdk.createTrade(/* typed params */);

// New SDK usage - Option 2: Direct layers
import { instructions, transactions, rpc } from '@localmoney/sdk';

// Layer 1: Build instruction
const ix = instructions.trade.createTradeInstruction(/* ... */);

// Layer 2: Build transaction
const tx = await transactions.buildCreateTradeTx(/* ... */);

// Layer 3: Execute
const sig = await rpc.executeTransaction(tx);
```

## Success Metrics

- [ ] Code generation pipeline working
- [ ] Three layers clearly separated
- [ ] All types auto-generated from IDL
- [ ] Test utilities reduce boilerplate by 50%
- [ ] Type errors caught at compile time
- [ ] SDK bundle size < 100KB
- [ ] Documentation coverage > 90%

## References

- Squads SDK: https://github.com/squads-protocol/v4/tree/main/sdk
- Solita Documentation: https://github.com/metaplex-foundation/solita
- Anchor TypeScript: https://www.anchor-lang.com/docs/javascript-anchor
- Web3.js Best Practices: https://solana-labs.github.io/solana-web3.js/
- TypeScript Handbook: https://www.typescriptlang.org/docs/

## Confidence Score: 8/10

High confidence due to:
- Clear three-layer pattern from Squads
- Existing IDL files and type infrastructure
- Well-established tools (Solita/Anchor)
- Straightforward migration path

Points deducted for:
- Code generation setup complexity
- Potential breaking changes for SDK users
- Testing infrastructure needs significant work