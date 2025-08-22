import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

// BN utilities
export function toBN(value: number | string | BN): BN {
  if (BN.isBN(value)) {
    return value;
  }
  return new BN(value);
}

export function fromBN(value: BN, decimals: number = 0): number {
  return value.toNumber() / Math.pow(10, decimals);
}

// Amount formatting utilities
export function formatAmount(amount: BN | number, decimals: number = 6): string {
  const value = BN.isBN(amount) ? amount.toNumber() : amount;
  const formatted = (value / Math.pow(10, decimals)).toFixed(decimals);
  return formatted.replace(/\.?0+$/, '');
}

export function parseAmount(amount: string | number, decimals: number = 6): BN {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new BN(Math.floor(value * Math.pow(10, decimals)));
}

// PublicKey utilities
export function isValidPublicKey(key: string): boolean {
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
}

export function shortenAddress(address: PublicKey | string, chars: number = 4): string {
  const str = address.toString();
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}

// Enum converters for IDL types
export function toEnum<T extends Record<string, any>>(
  value: string,
  enumType: T
): Record<string, any> {
  return { [value]: {} };
}

export function fromEnum<T extends Record<string, any>>(
  enumValue: T
): string {
  return Object.keys(enumValue)[0];
}

// Fiat currency helpers
export const FIAT_CURRENCIES = {
  USD: 'usd',
  EUR: 'eur',
  GBP: 'gbp',
  CAD: 'cad',
  AUD: 'aud',
  JPY: 'jpy',
  CNY: 'cny',
  INR: 'inr',
  SGD: 'sgd',
  HKD: 'hkd',
} as const;

export type FiatCurrencyCode = keyof typeof FIAT_CURRENCIES;

export function toFiatCurrencyEnum(currency: FiatCurrencyCode | string): any {
  const code = currency.toUpperCase();
  if (code in FIAT_CURRENCIES) {
    return { [FIAT_CURRENCIES[code as FiatCurrencyCode]]: {} };
  }
  return { [currency.toLowerCase()]: {} };
}

// Trade state helpers
export const TRADE_STATES = {
  RequestCreated: 'requestCreated',
  RequestAccepted: 'requestAccepted',
  EscrowFunded: 'escrowFunded',
  FiatDeposited: 'fiatDeposited',
  EscrowReleased: 'escrowReleased',
  EscrowRefunded: 'escrowRefunded',
  RequestCancelled: 'requestCancelled',
  DisputeOpened: 'disputeOpened',
  DisputeResolved: 'disputeResolved',
} as const;

export type TradeStateType = keyof typeof TRADE_STATES;

export function parseTradeState(state: any): TradeStateType {
  const stateKey = Object.keys(state)[0];
  for (const [key, value] of Object.entries(TRADE_STATES)) {
    if (value === stateKey) {
      return key as TradeStateType;
    }
  }
  return 'RequestCreated' as TradeStateType;
}

// Offer type helpers
export const OFFER_TYPES = {
  Buy: 'buy',
  Sell: 'sell',
} as const;

export type OfferTypeValue = keyof typeof OFFER_TYPES;

export function toOfferTypeEnum(type: OfferTypeValue | string): any {
  const normalized = type.toLowerCase();
  if (normalized === 'buy' || normalized === 'sell') {
    return { [normalized]: {} };
  }
  throw new Error(`Invalid offer type: ${type}`);
}

// Time utilities
export function getCurrentTimestamp(): BN {
  return new BN(Math.floor(Date.now() / 1000));
}

export function isExpired(expiryTimestamp: BN): boolean {
  return getCurrentTimestamp().gt(expiryTimestamp);
}

export function getExpiryTimestamp(durationSeconds: number): BN {
  return getCurrentTimestamp().add(new BN(durationSeconds));
}

export function formatTimestamp(timestamp: BN): string {
  return new Date(timestamp.toNumber() * 1000).toISOString();
}

// Validation utilities
export function validateAmount(
  amount: BN,
  min?: BN,
  max?: BN
): { valid: boolean; error?: string } {
  if (amount.lte(new BN(0))) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }
  
  if (min && amount.lt(min)) {
    return { valid: false, error: `Amount must be at least ${min.toString()}` };
  }
  
  if (max && amount.gt(max)) {
    return { valid: false, error: `Amount must be at most ${max.toString()}` };
  }
  
  return { valid: true };
}

export function validateRate(rate: BN): { valid: boolean; error?: string } {
  if (rate.lte(new BN(0))) {
    return { valid: false, error: 'Rate must be greater than 0' };
  }
  
  return { valid: true };
}

export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  
  if (username.length > 32) {
    return { valid: false, error: 'Username must be at most 32 characters' };
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscore, and hyphen' };
  }
  
  return { valid: true };
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true };
}

// Buffer utilities
export function toBuffer(value: BN | number, size: number = 8): Buffer {
  const bn = BN.isBN(value) ? value : new BN(value);
  return bn.toArrayLike(Buffer, 'le', size);
}

export function fromBuffer(buffer: Buffer): BN {
  return new BN(buffer, 'le');
}

// Error parsing utilities
export function parseAnchorError(error: any): {
  code?: number;
  message: string;
  logs?: string[];
} {
  if (error.error?.errorCode) {
    return {
      code: error.error.errorCode.code || error.error.errorCode.number,
      message: error.error.errorMessage || 'Unknown error',
      logs: error.logs,
    };
  }
  
  if (error.logs && Array.isArray(error.logs)) {
    const errorLog = error.logs.find((log: string) => 
      log.includes('Error') || log.includes('failed')
    );
    
    return {
      message: errorLog || error.message || 'Unknown error',
      logs: error.logs,
    };
  }
  
  return {
    message: error.message || error.toString() || 'Unknown error',
  };
}

// Constants
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const USDC_DECIMALS = 6;
export const DEFAULT_COMMITMENT = 'confirmed' as const;
export const DEFAULT_EXPIRY_DURATION = 86400; // 24 hours in seconds

// Export everything
export default {
  // BN utilities
  toBN,
  fromBN,
  formatAmount,
  parseAmount,
  
  // PublicKey utilities
  isValidPublicKey,
  shortenAddress,
  
  // Enum converters
  toEnum,
  fromEnum,
  toFiatCurrencyEnum,
  toOfferTypeEnum,
  parseTradeState,
  
  // Time utilities
  getCurrentTimestamp,
  isExpired,
  getExpiryTimestamp,
  formatTimestamp,
  
  // Validation utilities
  validateAmount,
  validateRate,
  validateUsername,
  validateEmail,
  
  // Buffer utilities
  toBuffer,
  fromBuffer,
  
  // Error parsing
  parseAnchorError,
  
  // Constants
  LAMPORTS_PER_SOL,
  USDC_DECIMALS,
  DEFAULT_COMMITMENT,
  DEFAULT_EXPIRY_DURATION,
  FIAT_CURRENCIES,
  TRADE_STATES,
  OFFER_TYPES,
};