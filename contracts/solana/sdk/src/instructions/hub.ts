import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import { Hub } from '../types/hub';
import { PROGRAM_IDS } from '../generated';

const HubIDL = require('../types/hub.json');

export interface InitializeHubInstructionArgs {
  platformFeeBps: number;
  minTradeAmount: BN;
  maxTradeAmount: BN;
  emergencyPause: boolean;
}

export interface UpdateHubConfigInstructionArgs {
  platformFeeBps?: number | null;
  minTradeAmount?: BN | null;
  maxTradeAmount?: BN | null;
  emergencyPause?: boolean | null;
}

export interface SetHubAuthorityInstructionArgs {
  newAuthority: PublicKey;
}

export interface SetFeeRecipientInstructionArgs {
  feeRecipient: PublicKey;
}

export interface PauseHubInstructionArgs {}

export interface UnpauseHubInstructionArgs {}

export function initializeHubInstruction(
  program: Program<Hub>,
  accounts: {
    hubConfig: PublicKey;
    authority: PublicKey;
    feeRecipient: PublicKey;
    systemProgram: PublicKey;
  },
  args: InitializeHubInstructionArgs
): TransactionInstruction {
  return program.methods
    .initializeHub(
      args.platformFeeBps,
      args.minTradeAmount,
      args.maxTradeAmount,
      args.emergencyPause
    )
    .accounts({
      hubConfig: accounts.hubConfig,
      authority: accounts.authority,
      feeRecipient: accounts.feeRecipient,
      systemProgram: accounts.systemProgram,
    })
    .instruction();
}

export function updateHubConfigInstruction(
  program: Program<Hub>,
  accounts: {
    hubConfig: PublicKey;
    authority: PublicKey;
  },
  args: UpdateHubConfigInstructionArgs
): TransactionInstruction {
  return program.methods
    .updateHubConfig(
      args.platformFeeBps || null,
      args.minTradeAmount || null,
      args.maxTradeAmount || null,
      args.emergencyPause || null
    )
    .accounts({
      hubConfig: accounts.hubConfig,
      authority: accounts.authority,
    })
    .instruction();
}

export function setHubAuthorityInstruction(
  program: Program<Hub>,
  accounts: {
    hubConfig: PublicKey;
    currentAuthority: PublicKey;
  },
  args: SetHubAuthorityInstructionArgs
): TransactionInstruction {
  return program.methods
    .setHubAuthority(args.newAuthority)
    .accounts({
      hubConfig: accounts.hubConfig,
      currentAuthority: accounts.currentAuthority,
    })
    .instruction();
}

export function setFeeRecipientInstruction(
  program: Program<Hub>,
  accounts: {
    hubConfig: PublicKey;
    authority: PublicKey;
  },
  args: SetFeeRecipientInstructionArgs
): TransactionInstruction {
  return program.methods
    .setFeeRecipient(args.feeRecipient)
    .accounts({
      hubConfig: accounts.hubConfig,
      authority: accounts.authority,
    })
    .instruction();
}

export function pauseHubInstruction(
  program: Program<Hub>,
  accounts: {
    hubConfig: PublicKey;
    authority: PublicKey;
  },
  args: PauseHubInstructionArgs
): TransactionInstruction {
  return program.methods
    .pauseHub()
    .accounts({
      hubConfig: accounts.hubConfig,
      authority: accounts.authority,
    })
    .instruction();
}

export function unpauseHubInstruction(
  program: Program<Hub>,
  accounts: {
    hubConfig: PublicKey;
    authority: PublicKey;
  },
  args: UnpauseHubInstructionArgs
): TransactionInstruction {
  return program.methods
    .unpauseHub()
    .accounts({
      hubConfig: accounts.hubConfig,
      authority: accounts.authority,
    })
    .instruction();
}