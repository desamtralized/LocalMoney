import { PublicKey } from '@solana/web3.js';
import type { BN } from 'bn.js';

// Currency Types
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
  INR = 'INR',
  BRL = 'BRL',
  MXN = 'MXN',
  RUB = 'RUB',
  ZAR = 'ZAR',
  SEK = 'SEK',
  NOK = 'NOK',
  DKK = 'DKK',
  PLN = 'PLN',
  TRY = 'TRY',
  SGD = 'SGD'
}

// Offer Types
export enum OfferType {
  Buy = 'Buy',
  Sell = 'Sell'
}

export enum OfferState {
  Active = 'Active',
  Paused = 'Paused',
  Archive = 'Archive'
}

// Trade Types
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

// Arbitration Types
export enum ArbitratorStatus {
  Active = 'Active',
  Inactive = 'Inactive',
  Suspended = 'Suspended'
}

export enum DisputeStatus {
  Open = 'Open',
  UnderReview = 'UnderReview',
  Resolved = 'Resolved',
  Expired = 'Expired'
}

export enum DisputeResolution {
  FavorBuyer = 'FavorBuyer',
  FavorSeller = 'FavorSeller',
  Split = 'Split'
}

// Account Interfaces
export interface GlobalConfig {
  authority: PublicKey;
  offerProgram: PublicKey;
  tradeProgram: PublicKey;
  profileProgram: PublicKey;
  priceProgram: PublicKey;
  priceProvider: PublicKey;
  localMint: PublicKey;
  chainFeeCollector: PublicKey;
  warchest: PublicKey;
  activeOffersLimit: number;
  activeTradesLimit: number;
  arbitrationFeeBps: number;
  burnFeeBps: number;
  chainFeeBps: number;
  warchestFeeBps: number;
  tradeExpirationTimer: BN;
  tradeDisputeTimer: BN;
  tradeLimitMin: BN;
  tradeLimitMax: BN;
  bump: number;
}

export interface Profile {
  owner: PublicKey;
  encryptedContactInfo: string;
  totalTrades: BN;
  successfulTrades: BN;
  reputationScore: BN;
  totalTradeVolume: BN;
  activeOffersCount: number;
  activeTradesCount: number;
  totalOffersCount: BN;
  lastActivityTimestamp: BN;
  bump: number;
}

export interface CurrencyPrice {
  currency: FiatCurrency;
  priceUsd: BN;
  timestamp: BN;
  confidence: number;
  source: PublicKey;
  bump: number;
}

export interface Offer {
  id: BN;
  maker: PublicKey;
  offerType: OfferType;
  tokenMint: PublicKey;
  fiatCurrency: FiatCurrency;
  rate: BN;
  minAmount: BN;
  maxAmount: BN;
  availableAmount: BN;
  description: string;
  state: OfferState;
  createdAt: BN;
  expiresAt: BN;
  lockedRateUsd: BN;
  exchangeRate: BN;
  priceTimestamp: BN;
  priceSource: PublicKey;
  bump: number;
}

export interface Trade {
  id: BN;
  offerId: BN;
  maker: PublicKey;
  taker: PublicKey;
  tokenMint: PublicKey;
  amount: BN;
  rate: BN;
  fiatCurrency: FiatCurrency;
  state: TradeState;
  createdAt: BN;
  expiresAt: BN;
  escrowFundedAt: BN;
  makerContact: string;
  takerContact: string;
  lockedPriceUsd: BN;
  exchangeRate: BN;
  priceTimestamp: BN;
  priceSource: PublicKey;
  bump: number;
}

export interface Arbitrator {
  id: BN;
  authority: PublicKey;
  status: ArbitratorStatus;
  reputationScore: BN;
  totalDisputes: BN;
  resolvedDisputes: BN;
  activeDisputes: number;
  feeBps: number;
  languages: string[];
  specializations: string[];
  lastActivityAt: BN;
  bump: number;
}

// Instruction Parameter Types
export interface InitializeHubParams {
  offerProgram: PublicKey;
  tradeProgram: PublicKey;
  profileProgram: PublicKey;
  priceProgram: PublicKey;
  priceProvider: PublicKey;
  localMint: PublicKey;
  chainFeeCollector: PublicKey;
  warchest: PublicKey;
  activeOffersLimit: number;
  activeTradesLimit: number;
  arbitrationFeeBps: number;
  burnFeeBps: number;
  chainFeeBps: number;
  warchestFeeBps: number;
  tradeExpirationTimer: BN;
  tradeDisputeTimer: BN;
  tradeLimitMin: BN;
  tradeLimitMax: BN;
}

export interface CreateOfferParams {
  offerType: OfferType;
  tokenMint: PublicKey;
  fiatCurrency: FiatCurrency;
  rate: BN;
  minAmount: BN;
  maxAmount: BN;
  description: string;
  expiresAt?: BN;
}

export interface CreateTradeParams {
  offerId: BN;
  amount: BN;
  contact: string;
}

export interface UpdateProfileParams {
  encryptedContactInfo?: string;
}

export interface UpdatePriceParams {
  currency: FiatCurrency;
  priceUsd: BN;
  confidence: number;
}

export interface RegisterArbitratorParams {
  feeBps: number;
  languages: string[];
  specializations: string[];
}

// PDA Seeds
export const GLOBAL_CONFIG_SEED = 'config';
export const PROFILE_SEED = 'profile';
export const PRICE_CONFIG_SEED = 'price_config';
export const CURRENCY_PRICE_SEED = 'currency_price';
export const OFFER_COUNTER_SEED = 'offer_counter';
export const OFFER_SEED = 'offer';
export const TRADE_COUNTER_SEED = 'trade_counter';
export const TRADE_SEED = 'trade';
export const ARBITRATOR_COUNTER_SEED = 'arbitrator_counter';
export const ARBITRATOR_SEED = 'arbitrator';

// Utility Types
export interface SDKConfig {
  rpcUrl: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export interface TransactionResult {
  signature: string;
  success: boolean;
  error?: string;
}

export interface ProgramAddresses {
  hub: PublicKey;
  profile: PublicKey;
  price: PublicKey;
  offer: PublicKey;
  trade: PublicKey;
  arbitration: PublicKey;
}