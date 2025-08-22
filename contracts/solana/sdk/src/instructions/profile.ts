import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import { Profile } from '../types/profile';
import { PROGRAM_IDS } from '../generated';

const ProfileIDL = require('../types/profile.json');

export interface CreateProfileInstructionArgs {
  username: string;
  region: string;
  contactInfo?: string | null;
}

export interface UpdateProfileInstructionArgs {
  username?: string | null;
  region?: string | null;
  contactInfo?: string | null;
}

export interface UpdateReputationInstructionArgs {
  successfulTrades: number;
  totalVolume: BN;
  rating: number;
}

export interface VerifyProfileInstructionArgs {
  verificationLevel: number;
}

export function createProfileInstruction(
  program: Program<Profile>,
  accounts: {
    profile: PublicKey;
    user: PublicKey;
    systemProgram: PublicKey;
  },
  args: CreateProfileInstructionArgs
): TransactionInstruction {
  return program.methods
    .createProfile(
      args.username,
      args.region,
      args.contactInfo || null
    )
    .accounts({
      profile: accounts.profile,
      user: accounts.user,
      systemProgram: accounts.systemProgram,
    })
    .instruction();
}

export function updateProfileInstruction(
  program: Program<Profile>,
  accounts: {
    profile: PublicKey;
    user: PublicKey;
  },
  args: UpdateProfileInstructionArgs
): TransactionInstruction {
  return program.methods
    .updateProfile(
      args.username || null,
      args.region || null,
      args.contactInfo || null
    )
    .accounts({
      profile: accounts.profile,
      user: accounts.user,
    })
    .instruction();
}

export function updateReputationInstruction(
  program: Program<Profile>,
  accounts: {
    profile: PublicKey;
    authority: PublicKey;
  },
  args: UpdateReputationInstructionArgs
): TransactionInstruction {
  return program.methods
    .updateReputation(
      args.successfulTrades,
      args.totalVolume,
      args.rating
    )
    .accounts({
      profile: accounts.profile,
      authority: accounts.authority,
    })
    .instruction();
}

export function verifyProfileInstruction(
  program: Program<Profile>,
  accounts: {
    profile: PublicKey;
    verifier: PublicKey;
  },
  args: VerifyProfileInstructionArgs
): TransactionInstruction {
  return program.methods
    .verifyProfile(args.verificationLevel)
    .accounts({
      profile: accounts.profile,
      verifier: accounts.verifier,
    })
    .instruction();
}