# Frontend Fixes Applied

## 1. USDC Price Fallback (1:1 USD)
**Problem**: No price route configured for USDC IBC token
**Solution**: Added graceful fallback in `CosmosChain.ts` that treats 1 USDC = 1 USD when price route is missing

### Changes in `/app/src/network/cosmos/CosmosChain.ts`:
- Modified `updateFiatPrice()` method to catch price route errors
- Added special handling for USDC tokens (IBC and native)
- Returns hardcoded 1:1 USD price (100 cents) when no route exists

## 2. Transaction Event Parsing Errors
**Problem**: "couldn't read events" error after sending transactions
**Solution**: Created robust event extraction utilities that handle multiple CosmJS formats

### New file `/app/src/network/cosmos/utils/events.ts`:
- `extractEventAttribute()`: Safely extracts attributes from transaction events
- Handles old format (`logs[0].events`), new format (`events`), and rawLog fallback
- Supports both string and base64 encoded attributes
- `extractOfferId()` and `extractTradeId()`: Specific helpers for offer and trade IDs

### Updated methods in `CosmosChain.ts`:
- `createOffer()`: Now uses `extractOfferId()` with proper error handling
- `openTrade()`: Now uses `extractTradeId()` with proper error handling

## 3. Environment Variables Configuration
**Problem**: Hardcoded contract addresses in the app
**Solution**: Updated configuration to use environment variables

### Changes in `/app/src/network/cosmos/config/cosmoshub.ts`:
- All contract addresses now read from `process.env`
- Added fallbacks for missing environment variables

### Updated `/app/.env`:
- Added all new contract addresses from deployment
- Added missing configuration values (ADMIN_ADDR, CHAIN_FEE_COLLECTOR, etc.)

## Testing Recommendations

1. **USDC Price Fallback**:
   - Try to view offers with USDC denomination
   - Should show prices without errors
   - Console should log: "No price route for USDC, using 1:1 USD fallback"

2. **Transaction Events**:
   - Create a new offer
   - Open a new trade
   - Both should complete without "couldn't read events" errors

3. **Environment Variables**:
   - Restart the app after .env changes
   - Verify connection to new contracts on Cosmos Hub mainnet

## Notes
- CosmJS libraries are at v0.33.0 which should be compatible
- The event extraction utilities handle multiple formats for future compatibility
- USDC 1:1 USD fallback is temporary until proper price routes are configured