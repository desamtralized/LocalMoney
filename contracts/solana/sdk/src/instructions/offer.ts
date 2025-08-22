import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import { Offer } from '../types/offer';
import { PROGRAM_IDS } from '../generated';

const OfferIDL = require('../types/offer.json');

export interface CreateOfferInstructionArgs {
  offerId: BN;
  offerType: any; // Will be the enum type from IDL
  fiatCurrency: any; // Will be the enum type from IDL
  rate: BN;
  minAmount?: BN;
  maxAmount?: BN;
  fiatAmount?: BN;
  tokenMint?: PublicKey;
  terms?: string | null;
  description?: string | null;
}

export interface UpdateOfferInstructionArgs {
  offerId: BN;
  rate?: BN;
  minAmount?: BN;
  maxAmount?: BN;
  terms?: string | null;
  description?: string | null;
}

export interface ActivateOfferInstructionArgs {
  offerId: BN;
}

export interface DeactivateOfferInstructionArgs {
  offerId: BN;
}

export interface CloseOfferInstructionArgs {
  offerId: BN;
}

export function createOfferInstruction(
  program: Program<Offer>,
  accounts: {
    offer: PublicKey;
    owner: PublicKey;
    ownerProfile: PublicKey;
    tokenMint: PublicKey;
    hubConfig: PublicKey;
    profileProgram: PublicKey;
    systemProgram: PublicKey;
  },
  args: CreateOfferInstructionArgs
): TransactionInstruction {
  return program.methods
    .createOffer(
      args.offerId,
      args.offerType,
      args.fiatCurrency,
      args.rate,
      args.minAmount || null,
      args.maxAmount || null,
      args.fiatAmount || null,
      args.tokenMint || null,
      args.terms || null,
      args.description || null
    )
    .accounts({
      offer: accounts.offer,
      owner: accounts.owner,
      ownerProfile: accounts.ownerProfile,
      tokenMint: accounts.tokenMint,
      hubConfig: accounts.hubConfig,
      profileProgram: accounts.profileProgram,
      systemProgram: accounts.systemProgram,
    })
    .instruction();
}

export function updateOfferInstruction(
  program: Program<Offer>,
  accounts: {
    offer: PublicKey;
    owner: PublicKey;
  },
  args: UpdateOfferInstructionArgs
): TransactionInstruction {
  return program.methods
    .updateOffer(
      args.offerId,
      args.rate || null,
      args.minAmount || null,
      args.maxAmount || null,
      args.terms || null,
      args.description || null
    )
    .accounts({
      offer: accounts.offer,
      owner: accounts.owner,
    })
    .instruction();
}

export function activateOfferInstruction(
  program: Program<Offer>,
  accounts: {
    offer: PublicKey;
    owner: PublicKey;
  },
  args: ActivateOfferInstructionArgs
): TransactionInstruction {
  return program.methods
    .activateOffer(args.offerId)
    .accounts({
      offer: accounts.offer,
      owner: accounts.owner,
    })
    .instruction();
}

export function deactivateOfferInstruction(
  program: Program<Offer>,
  accounts: {
    offer: PublicKey;
    owner: PublicKey;
  },
  args: DeactivateOfferInstructionArgs
): TransactionInstruction {
  return program.methods
    .deactivateOffer(args.offerId)
    .accounts({
      offer: accounts.offer,
      owner: accounts.owner,
    })
    .instruction();
}

export function closeOfferInstruction(
  program: Program<Offer>,
  accounts: {
    offer: PublicKey;
    owner: PublicKey;
  },
  args: CloseOfferInstructionArgs
): TransactionInstruction {
  return program.methods
    .closeOffer(args.offerId)
    .accounts({
      offer: accounts.offer,
      owner: accounts.owner,
    })
    .instruction();
}