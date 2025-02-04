import { PublicKey, Keypair } from '@solana/web3.js';

export interface PaymentMethod {
  type: 'BankTransfer' | 'MobileMoney' | 'Other';
  bankName?: string;
  accountInfo?: string;
  provider?: string;
  phoneNumber?: string;
  name?: string;
  details?: string;
}

export interface CreateOfferParams {
  offerAccount: Keypair;
  tokenMint: PublicKey;
  amount: bigint;
  pricePerToken: bigint;
  minAmount: bigint;
  maxAmount: bigint;
  paymentMethod: PaymentMethod;
  creator: Keypair;
  tokenAccount: PublicKey;
}

export interface CreateTradeParams {
  tradeAccount: Keypair;
  offerAccount: PublicKey;
  amount: bigint;
  escrowAccount: PublicKey;
  buyer: Keypair;
}

export interface Offer {
  creator: PublicKey;
  tokenMint: PublicKey;
  amount: bigint;
  pricePerToken: bigint;
  minAmount: bigint;
  maxAmount: bigint;
  paymentMethod: PaymentMethod;
  status: 'Active' | 'Paused' | 'Closed';
  createdAt: number;
  updatedAt: number;
}

export interface Trade {
  seller: PublicKey;
  buyer: PublicKey | null;
  amount: bigint;
  price: bigint;
  tokenMint: PublicKey;
  escrowAccount: PublicKey;
  status: 'Open' | 'InProgress' | 'Completed' | 'Cancelled' | 'Disputed';
  createdAt: number;
  updatedAt: number;
}

export interface Profile {
  username: string;
  reputation: number;
  tradesCompleted: number;
  tradesDisputed: number;
  isVerified: boolean;
}

export interface DecodedProfile {
  username: string;
  reputation: number;
  tradesCompleted: number;
  tradesDisputed: number;
  isVerified: number;
}

export interface CurrencyPrice {
  currency: string;
  usdPrice: bigint;
  updatedAt: bigint;
}

export interface PriceRoute {
  offerAsset: string;
  pool: PublicKey;
}

export interface HubConfig {
  admin: PublicKey;
  priceProgram: PublicKey;
  tradeProgram: PublicKey;
  profileProgram: PublicKey;
  offerProgram: PublicKey;
  feeAccount: PublicKey;
  feeBasisPoints: number;
  isPaused: boolean;
}

export interface CreateProfileArgs {
  variant: string;
  username: string;
}

export interface UpdateProfileArgs {
  variant: string;
  username?: string;
}

export interface UpdateReputationArgs {
  variant: string;
  scoreDelta: number;
}

export interface UpdatePricesArgs {
  variant: string;
  prices: CurrencyPrice[];
}

export interface RegisterPriceRouteArgs {
  variant: string;
  denom: string;
  route: PriceRoute[];
}

export interface InitializeHubArgs {
  variant: string;
  priceProgram: PublicKey;
  tradeProgram: PublicKey;
  profileProgram: PublicKey;
  offerProgram: PublicKey;
  feeAccount: PublicKey;
  feeBasisPoints: number;
}

export interface UpdateHubConfigArgs {
  variant: string;
  feeBasisPoints?: number;
  feeAccount?: PublicKey;
}

export interface SimpleInstructionArgs {
  variant: string;
} 