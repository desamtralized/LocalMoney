import { PublicKey, TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import { Trade } from '../types/trade';
import { PROGRAM_IDS } from '../generated';

const TradeIDL = require('../types/trade.json');

export interface CreateTradeInstructionArgs {
  tradeId: BN;
  offerId: BN;
  amount: BN;
  lockedPrice: BN;
  expiryDuration: BN;
  buyerContact: string;
  arbitrator: PublicKey;
}

export interface AcceptRequestInstructionArgs {
  tradeId: BN;
}

export interface FundEscrowInstructionArgs {
  tradeId: BN;
  amount: BN;
}

export interface MarkFiatDepositedInstructionArgs {
  tradeId: BN;
}

export interface ReleaseEscrowInstructionArgs {
  tradeId: BN;
}

export interface RefundEscrowInstructionArgs {
  tradeId: BN;
}

export interface CancelRequestInstructionArgs {
  tradeId: BN;
}

export interface UpdateTradeContactInstructionArgs {
  tradeId: BN;
  newContact: string;
}

export async function createTradeInstruction(
  program: Program<Trade>,
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
  args: CreateTradeInstructionArgs
): Promise<TransactionInstruction> {
  return await program.methods
    .create_trade(
      args.tradeId,
      args.offerId,
      args.amount,
      args.lockedPrice,
      args.expiryDuration,
      args.buyerContact,
      args.arbitrator
    )
    .accounts({
      trade: accounts.trade,
      buyer: accounts.buyer,
      offer: accounts.offer,
      seller: accounts.seller,
      tokenMint: accounts.tokenMint,
      hubConfig: accounts.hubConfig,
      profileProgram: accounts.profileProgram,
      offerProgram: accounts.offerProgram,
      priceProgram: accounts.priceProgram,
      systemProgram: accounts.systemProgram,
    })
    .instruction();
}

export function acceptRequestInstruction(
  program: Program<Trade>,
  accounts: {
    trade: PublicKey;
    seller: PublicKey;
    sellerProfile: PublicKey;
    profileProgram: PublicKey;
  },
  args: AcceptRequestInstructionArgs
): TransactionInstruction {
  return program.methods
    .acceptRequest(args.tradeId)
    .accounts({
      trade: accounts.trade,
      seller: accounts.seller,
      sellerProfile: accounts.sellerProfile,
      profileProgram: accounts.profileProgram,
    })
    .instruction();
}

export function fundEscrowInstruction(
  program: Program<Trade>,
  accounts: {
    trade: PublicKey;
    escrow: PublicKey;
    seller: PublicKey;
    sellerTokenAccount: PublicKey;
    tokenProgram: PublicKey;
    systemProgram: PublicKey;
  },
  args: FundEscrowInstructionArgs
): TransactionInstruction {
  return program.methods
    .fundEscrow(args.tradeId, args.amount)
    .accounts({
      trade: accounts.trade,
      escrow: accounts.escrow,
      seller: accounts.seller,
      sellerTokenAccount: accounts.sellerTokenAccount,
      tokenProgram: accounts.tokenProgram,
      systemProgram: accounts.systemProgram,
    })
    .instruction();
}

export function markFiatDepositedInstruction(
  program: Program<Trade>,
  accounts: {
    trade: PublicKey;
    buyer: PublicKey;
  },
  args: MarkFiatDepositedInstructionArgs
): TransactionInstruction {
  return program.methods
    .markFiatDeposited(args.tradeId)
    .accounts({
      trade: accounts.trade,
      buyer: accounts.buyer,
    })
    .instruction();
}

export function releaseEscrowInstruction(
  program: Program<Trade>,
  accounts: {
    trade: PublicKey;
    escrow: PublicKey;
    seller: PublicKey;
    buyer: PublicKey;
    buyerTokenAccount: PublicKey;
    tokenProgram: PublicKey;
    hubConfig: PublicKey;
    hubFeeAccount: PublicKey;
  },
  args: ReleaseEscrowInstructionArgs
): TransactionInstruction {
  return program.methods
    .releaseEscrow(args.tradeId)
    .accounts({
      trade: accounts.trade,
      escrow: accounts.escrow,
      seller: accounts.seller,
      buyer: accounts.buyer,
      buyerTokenAccount: accounts.buyerTokenAccount,
      tokenProgram: accounts.tokenProgram,
      hubConfig: accounts.hubConfig,
      hubFeeAccount: accounts.hubFeeAccount,
    })
    .instruction();
}

export function refundEscrowInstruction(
  program: Program<Trade>,
  accounts: {
    trade: PublicKey;
    escrow: PublicKey;
    seller: PublicKey;
    sellerTokenAccount: PublicKey;
    buyer: PublicKey;
    tokenProgram: PublicKey;
  },
  args: RefundEscrowInstructionArgs
): TransactionInstruction {
  return program.methods
    .refundEscrow(args.tradeId)
    .accounts({
      trade: accounts.trade,
      escrow: accounts.escrow,
      seller: accounts.seller,
      sellerTokenAccount: accounts.sellerTokenAccount,
      buyer: accounts.buyer,
      tokenProgram: accounts.tokenProgram,
    })
    .instruction();
}

export function cancelRequestInstruction(
  program: Program<Trade>,
  accounts: {
    trade: PublicKey;
    buyer: PublicKey;
  },
  args: CancelRequestInstructionArgs
): TransactionInstruction {
  return program.methods
    .cancelRequest(args.tradeId)
    .accounts({
      trade: accounts.trade,
      buyer: accounts.buyer,
    })
    .instruction();
}

export function updateTradeContactInstruction(
  program: Program<Trade>,
  accounts: {
    trade: PublicKey;
    buyer: PublicKey;
  },
  args: UpdateTradeContactInstructionArgs
): TransactionInstruction {
  return program.methods
    .updateTradeContact(args.tradeId, args.newContact)
    .accounts({
      trade: accounts.trade,
      buyer: accounts.buyer,
    })
    .instruction();
}