# LocalMoney Client SDK

TypeScript/JavaScript client SDK for interacting with LocalMoney programs on Solana.

## Installation

```bash
npm install localmoney-client
```

## Usage

### Initialize the Client

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { LocalMoneyClient, OfferClient, TradeClient } from 'localmoney-client';

// Connect to a Solana cluster
const connection = new Connection('https://api.devnet.solana.com');

// Initialize your wallet
const payer = Keypair.generate(); // Or load your existing keypair

// Create client instances
const offerClient = new OfferClient(connection, payer);
const tradeClient = new TradeClient(connection, payer);
```

### Create and Manage Offers

```typescript
// Create a new offer
const offerAccount = Keypair.generate();
const tokenMint = new PublicKey('...'); // Your token mint address
const amount = BigInt(1000000); // Amount in smallest units (e.g., lamports)
const pricePerToken = BigInt(500000); // Price per token in smallest units
const minAmount = BigInt(100000);
const maxAmount = BigInt(1000000);

const paymentMethod = {
  type: 'BankTransfer',
  bankName: 'Example Bank',
  accountInfo: '1234567890',
};

await offerClient.createOffer(
  offerAccount,
  tokenMint,
  amount,
  pricePerToken,
  minAmount,
  maxAmount,
  paymentMethod,
);

// Update an offer
await offerClient.updateOffer(
  offerAccount.publicKey,
  BigInt(550000), // New price
);

// Pause an offer
await offerClient.pauseOffer(offerAccount.publicKey);

// Resume an offer
await offerClient.resumeOffer(offerAccount.publicKey);

// Close an offer
await offerClient.closeOffer(offerAccount.publicKey);
```

### Create and Manage Trades

```typescript
// Create a new trade
const tradeAccount = Keypair.generate();
const escrowAccount = new PublicKey('...'); // Your escrow account
const amount = BigInt(500000);
const price = BigInt(250000);

await tradeClient.createTrade(
  tradeAccount,
  tokenMint,
  escrowAccount,
  amount,
  price,
);

// Accept a trade
await tradeClient.acceptTrade(tradeAccount.publicKey);

// Complete a trade
const sellerTokenAccount = new PublicKey('...'); // Seller's token account
await tradeClient.completeTrade(
  tradeAccount.publicKey,
  escrowAccount,
  sellerTokenAccount,
);

// Cancel a trade
await tradeClient.cancelTrade(
  tradeAccount.publicKey,
  escrowAccount,
  sellerTokenAccount,
);

// Dispute a trade
await tradeClient.disputeTrade(tradeAccount.publicKey);
```

## Error Handling

All methods can throw errors. Make sure to handle them appropriately:

```typescript
try {
  await offerClient.createOffer(...);
} catch (error) {
  console.error('Failed to create offer:', error);
}
```

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

## License

MIT 