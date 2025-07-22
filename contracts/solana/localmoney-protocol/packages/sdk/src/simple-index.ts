// Re-export essential Solana types
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
export { PublicKey, Connection, Keypair, Wallet };
export { BN } from 'bn.js';

// Simple SDK exports that compile correctly
export { 
  LocalMoneySDK as default, 
  LocalMoneySDK,
  createWallet, 
  createConnection, 
  ENDPOINTS,
  CONSTANTS 
} from './simple-sdk';

// Common currency enum
export enum FiatCurrency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  JPY = 'JPY',
  AUD = 'AUD',
  CAD = 'CAD',
  CHF = 'CHF',
  CNY = 'CNY',
  KRW = 'KRW',
  INR = 'INR'
}

// Offer and Trade types
export enum OfferType {
  Buy = 'Buy',
  Sell = 'Sell'
}

export enum OfferState {
  Active = 'Active',
  Paused = 'Paused',
  Archive = 'Archive'
}

export enum TradeState {
  RequestCreated = 'RequestCreated',
  RequestCanceled = 'RequestCanceled',
  RequestExpired = 'RequestExpired',
  RequestAccepted = 'RequestAccepted',
  EscrowFunded = 'EscrowFunded',
  EscrowCanceled = 'EscrowCanceled',
  EscrowRefunded = 'EscrowRefunded',
  FiatDeposited = 'FiatDeposited',
  EscrowReleased = 'EscrowReleased',
  EscrowDisputed = 'EscrowDisputed',
  SettledForMaker = 'SettledForMaker',
  SettledForTaker = 'SettledForTaker'
}

// Import required modules for quickStart
import { LocalMoneySDK, createConnection, createWallet } from './simple-sdk';

/**
 * Quick start function for development
 */
export async function quickStart(options: {
  keypair?: Keypair;
  endpoint?: string;
} = {}): Promise<LocalMoneySDK> {
  const { keypair, endpoint = 'http://localhost:8899' } = options;
  
  const connection = createConnection(endpoint);
  const userKeypair = keypair || Keypair.generate();
  const wallet = createWallet(userKeypair);
  
  return LocalMoneySDK.createLocal(wallet);
}

/**
 * Version information
 */
export const SDK_VERSION = '0.1.0';