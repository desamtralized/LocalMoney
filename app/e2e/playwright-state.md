# Playwright Test State Memory

## Current Test Session State

### Chain Configuration
- **Target Chain**: Solana Devnet
- **Default Chain on Load**: BNB Smart Chain (need to switch)

### Wallet Configuration
- **Wallet Type**: Dev Wallet (Mock Phantom)
- **Maker Address**: 7gG7tH3bY7B3Anc6RmDQHoWgkNUhzXDBaTc55ikqkXxR
- **Taker Address**: Fcu81FSmGnwXerKQjCHxRwYYX2F8ftdyt1EVBEJeiqev
- **SOL Balance (Maker)**: ~2 SOL (airdropped)
- **SOL Balance (Taker)**: Needs airdrop

### Program Initialization Status (Devnet)
- [x] Hub Config initialized
- [x] Offer Counter initialized
- [x] Trade Counter initialized
- [x] Price Oracle Registry initialized
- [ ] USD Price - NOT initialized (PDA derivation issue)
- [ ] COP Price - NOT initialized (PDA derivation issue)

### SDK Fixes Applied
- [x] Fixed `tokenMint` account in offer.ts createOffer() - moved from args to accounts

## Required Actions After Page Load/Refresh

### Step 1: Switch to Solana Devnet
```
1. Click chain selector button (shows "BNB Smart Chain")
2. Click "Solana Devnet" option in dropdown
```

### Step 2: Enable Dev Wallet
```
1. Dev Wallet checkbox may be checked but provider not injected
2. If wallet not connected:
   - Uncheck "Dev Wallet" checkbox
   - Re-check "Dev Wallet" checkbox
3. Wait for "Loading..." to disappear
4. Verify wallet address shows in header (7gG7tH3b...kqkXxR for maker)
```

### Step 3: Navigate to Offers (for maker)
```
1. Click "My Offers" in navigation
2. Click create offer icon (SVG next to "My Offers" heading)
```

## Offer Creation Form Fields
- Min amount: textbox with placeholder "0"
- Max amount: textbox with placeholder "0"
- Telegram: textbox with placeholder "@username"
- Description: textbox with placeholder "Bank transfer, Paypal, Cash..."
- Margin: textbox with "0%"
- Market price: combobox (Above/Below)
- Token: USDC (default)
- Fiat: COP (default)

## Known Issues

1. **Page refresh resets chain to BNB Smart Chain** - localStorage stores devWalletEnabled but the default chain is still BSC
2. **Dev wallet provider not auto-injected on mount** - Need to toggle checkbox off/on
3. **Devnet rate limiting** - 429 errors when hitting RPC too frequently

## Test Wallet Keys (for reference)
- Maker secret: Located in /app/public/test-wallets/maker.json
- Taker secret: Located in /app/public/test-wallets/taker.json
