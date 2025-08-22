// LocalMoney SDK - Three-Layer Architecture
// Following Squads Protocol SDK pattern

import { Connection, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { TradingSDK, OfferSDK, ProfileSDK, PriceSDK } from './modules';

// ============================================
// Layer 1: Instructions (Raw instruction builders)
// ============================================
export * as instructions from './instructions';

// ============================================
// Layer 2: Transactions (Unsigned transaction builders)
// ============================================
export * as transactions from './transactions';

// ============================================
// Layer 3: RPC (Signed transaction executors)
// ============================================
export * as rpc from './rpc';

// ============================================
// PDA Helpers
// ============================================
export * from './pdas';

// ============================================
// Utilities
// ============================================
export * from './utils';

// ============================================
// Domain SDKs
// ============================================
export { TradingSDK } from './modules/TradingSDK';
export { OfferSDK } from './modules/OfferSDK';
export { ProfileSDK } from './modules/ProfileSDK';
export { PriceSDK } from './modules/PriceSDK';

// ============================================
// Test Utilities (only exported in development)
// ============================================
export * as testUtils from './test-utils';

// ============================================
// Generated Types
// ============================================
export * from './generated';

// ============================================
// Constants
// ============================================
export const PROGRAM_IDS = {
  hub: 'AJ6C5CHNQADfT2pJ9bQLx1rn5bKmYj1w1DnssmhXGHKF',
  offer: 'Gvypc9RLNbCPLUw9wvRT3fYCcNKMZyLLuRdpvDeCpN9W',
  price: 'Jn1xJ1tTEoQ5mdSkHJcWcgA9HTiKmuHqCLQrhVCnQxb',
  profile: 'H2NTK2NqRQBTgvd9wYpAUUndcBGgkCtiCHQJkCQP5xGd',
  trade: '5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM',
} as const;

// ============================================
// LocalMoneySDK - Main SDK Class (for backward compatibility)
// ============================================
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
  
  // Convenience methods that delegate to domain SDKs
  async createTrade(params: Parameters<TradingSDK['createTrade']>[0]) {
    return this.trading.createTrade(params);
  }
  
  async createOffer(params: Parameters<OfferSDK['createOffer']>[0]) {
    return this.offers.createOffer(params);
  }
  
  async createProfile(params: Parameters<ProfileSDK['createProfile']>[0]) {
    return this.profiles.createProfile(params);
  }
  
  async updatePrice(params: Parameters<PriceSDK['updatePrice']>[0]) {
    return this.prices.updatePrice(params);
  }
}

// ============================================
// Type Exports
// ============================================

// Re-export types from modules
export type { 
  CreateTradeParams, 
  TradeInfo 
} from './modules/TradingSDK';

export type { 
  CreateOfferParams, 
  UpdateOfferParams, 
  OfferInfo 
} from './modules/OfferSDK';

export type { 
  CreateProfileParams, 
  UpdateProfileParams, 
  ProfileInfo 
} from './modules/ProfileSDK';

export type { 
  PriceFeedInfo, 
  UpdatePriceParams 
} from './modules/PriceSDK';

// Re-export test types
export type {
  TestContext,
  TestWallets,
  TestTokens,
} from './test-utils';

// ============================================
// Default Export
// ============================================
export default LocalMoneySDK;

// ============================================
// Version Info
// ============================================
export const VERSION = '2.0.0';
export const SDK_NAME = 'LocalMoney Solana SDK';

// ============================================
// Quick Start Functions
// ============================================

/**
 * Create SDK instance with connection and wallet
 */
export function createSDK(connection: Connection, wallet: Wallet): LocalMoneySDK {
  return new LocalMoneySDK(connection, wallet);
}

/**
 * Create individual domain SDKs
 */
export function createTradingSDK(connection: Connection, wallet: Wallet): TradingSDK {
  return new TradingSDK(connection, wallet);
}

export function createOfferSDK(connection: Connection, wallet: Wallet): OfferSDK {
  return new OfferSDK(connection, wallet);
}

export function createProfileSDK(connection: Connection, wallet: Wallet): ProfileSDK {
  return new ProfileSDK(connection, wallet);
}

export function createPriceSDK(connection: Connection, wallet: Wallet): PriceSDK {
  return new PriceSDK(connection, wallet);
}

// ============================================
// Usage Examples (as comments for documentation)
// ============================================

/**
 * Example 1: Using domain-specific SDK
 * ```typescript
 * import { createTradingSDK } from '@localmoney/sdk';
 * 
 * const tradingSdk = createTradingSDK(connection, wallet);
 * const { tradeId } = await tradingSdk.createTrade({
 *   offerId: 123,
 *   amount: 100000000,
 *   buyerContact: 'buyer@example.com'
 * });
 * ```
 */

/**
 * Example 2: Using three-layer architecture
 * ```typescript
 * import { instructions, transactions, rpc } from '@localmoney/sdk';
 * 
 * // Layer 1: Build instruction
 * const ix = instructions.trade.createTradeInstruction(...);
 * 
 * // Layer 2: Build transaction
 * const tx = await transactions.buildCreateTradeTransaction(...);
 * 
 * // Layer 3: Execute via RPC
 * const sig = await rpc.executeTransaction(tx);
 * ```
 */

/**
 * Example 3: Using the main SDK class
 * ```typescript
 * import { LocalMoneySDK } from '@localmoney/sdk';
 * 
 * const sdk = new LocalMoneySDK(connection, wallet);
 * 
 * // Create profile
 * await sdk.createProfile({
 *   username: 'trader123',
 *   region: 'US'
 * });
 * 
 * // Create offer
 * const { offerId } = await sdk.createOffer({
 *   offerType: 'buy',
 *   fiatCurrency: 'USD',
 *   rate: 100,
 *   tokenMint: usdcMint
 * });
 * 
 * // Create trade
 * const { tradeId } = await sdk.createTrade({
 *   offerId: offerId.toNumber(),
 *   amount: 100000000,
 *   buyerContact: 'buyer@example.com'
 * });
 * ```
 */