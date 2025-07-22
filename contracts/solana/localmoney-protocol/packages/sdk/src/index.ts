// Main SDK export
export { LocalMoneySDK, createWallet, createConnection, ENDPOINTS } from './sdk';

// Enhanced Wallet System
export { 
  LocalMoneyWallet, 
  WalletType, 
  WalletConnectionState, 
  WalletUtils, 
  createLocalMoneyWallet,
  type WalletInfo,
  type WalletState,
  type WalletConnectionOptions,
  type WalletEvents,
  type SigningResult
} from './wallet';

// Program SDKs
export { HubSDK } from './programs/hub';
export { ProfileSDK } from './programs/profile';
export { PriceSDK } from './programs/price';

// Types and interfaces
export * from './types';

// Utilities
export { PDAGenerator, Utils, ErrorHandler, TransactionBuilder } from './utils';

// Re-export commonly used Solana types
export { PublicKey, Connection, Keypair, Transaction } from '@solana/web3.js';
export { BN } from 'bn.js';

/**
 * Version information
 */
export const SDK_VERSION = '0.1.0';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  commitment: 'confirmed' as const,
  rpcTimeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
};

/**
 * Network configurations
 */
export const NETWORK_CONFIGS = {
  mainnet: {
    name: 'Mainnet Beta',
    endpoint: 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed' as const,
  },
  devnet: {
    name: 'Devnet',
    endpoint: 'https://api.devnet.solana.com',
    commitment: 'confirmed' as const,
  },
  testnet: {
    name: 'Testnet',
    endpoint: 'https://api.testnet.solana.com',
    commitment: 'confirmed' as const,
  },
  localhost: {
    name: 'Localhost',
    endpoint: 'http://localhost:8899',
    commitment: 'confirmed' as const,
  },
} as const;

/**
 * Protocol constants
 */
export const PROTOCOL_CONSTANTS = {
  // Fee limits
  MAX_PLATFORM_FEE_BPS: 1000, // 10%
  MAX_ARBITRATION_FEE_BPS: 500, // 5%
  
  // Time limits
  MAX_TRADE_EXPIRATION_SECONDS: 2 * 24 * 60 * 60, // 2 days
  MAX_DISPUTE_TIMER_SECONDS: 24 * 60 * 60, // 1 day
  DEFAULT_PRICE_STALENESS_SECONDS: 60 * 60, // 1 hour
  
  // String limits
  MAX_OFFER_DESCRIPTION_LENGTH: 140,
  MAX_CONTACT_INFO_LENGTH: 500,
  MAX_DISPUTE_REASON_LENGTH: 500,
  
  // Activity limits
  DEFAULT_MAX_ACTIVE_OFFERS: 5,
  DEFAULT_MAX_ACTIVE_TRADES: 3,
  
  // Precision
  PRICE_PRECISION: 100000000, // 1e8
  AMOUNT_PRECISION: 1000000000, // 1e9 (SOL precision)
} as const;

/**
 * Error codes used throughout the protocol
 */
export const ERROR_CODES = {
  // General
  UNAUTHORIZED: 'Unauthorized',
  INVALID_AMOUNT: 'InvalidAmount',
  INVALID_AMOUNT_RANGE: 'InvalidAmountRange',
  EXCESSIVE_FEES: 'ExcessiveFees',
  INVALID_TIMER: 'InvalidTimer',
  
  // Profile
  PROFILE_NOT_FOUND: 'ProfileNotFound',
  PROFILE_VALIDATION_FAILED: 'ProfileValidationFailed',
  CONTACT_INFO_REQUIRED: 'ContactInfoRequired',
  
  // Price
  PRICE_STALE: 'PriceStale',
  PRICE_LOCK_EXPIRED: 'PriceLockExpired',
  INVALID_TIMESTAMP: 'InvalidTimestamp',
  NO_HISTORY_DATA: 'NoHistoryData',
  
  // Offer
  OFFER_NOT_FOUND: 'OfferNotFound',
  OFFER_LIMIT_EXCEEDED: 'OfferLimitExceeded',
  INVALID_OFFER_STATE: 'InvalidOfferState',
  
  // Trade
  TRADE_NOT_FOUND: 'TradeNotFound',
  TRADE_LIMIT_EXCEEDED: 'TradeLimitExceeded',
  INVALID_TRADE_STATE: 'InvalidTradeState',
  ESCROW_NOT_FUNDED: 'EscrowNotFunded',
  
  // Arbitration
  ARBITRATOR_NOT_FOUND: 'ArbitratorNotFound',
  DISPUTE_NOT_FOUND: 'DisputeNotFound',
  INVALID_ARBITRATION_FEE: 'InvalidArbitrationFee',
  
  // Hub
  HUB_NOT_INITIALIZED: 'HubNotInitialized',
  INVALID_PROGRAM_TYPE: 'InvalidProgramType',
  INVALID_FEE_CONFIGURATION: 'InvalidFeeConfiguration',
  INVALID_FEE_COLLECTOR: 'InvalidFeeCollector',
} as const;

/**
 * Quick start helper function
 */
export async function quickStart(options: {
  endpoint?: string;
  keypair?: Keypair;
  network?: keyof typeof NETWORK_CONFIGS;
}): Promise<LocalMoneySDK> {
  const { endpoint, keypair, network = 'localhost' } = options;
  
  // Determine endpoint
  const rpcEndpoint = endpoint || NETWORK_CONFIGS[network].endpoint;
  
  // Create connection
  const connection = createConnection(rpcEndpoint);
  
  // Create or use provided keypair
  const userKeypair = keypair || Keypair.generate();
  const wallet = createWallet(userKeypair);
  
  // Create SDK instance
  if (network === 'localhost') {
    return LocalMoneySDK.createLocal(wallet);
  } else {
    return LocalMoneySDK.create(connection, wallet);
  }
}

/**
 * Utility function for airdrop on development networks
 */
export async function requestAirdrop(
  connection: Connection,
  publicKey: PublicKey,
  lamports: number = 1000000000 // 1 SOL
): Promise<string> {
  const signature = await connection.requestAirdrop(publicKey, lamports);
  await connection.confirmTransaction(signature);
  return signature;
}