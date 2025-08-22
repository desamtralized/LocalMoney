import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import { Price } from '../types/price';
import { PROGRAM_IDS } from '../generated';

const PriceIDL = require('../types/price.json');

export interface InitializePriceFeedInstructionArgs {
  tokenMint: PublicKey;
}

export interface UpdatePriceInstructionArgs {
  newPrice: BN;
  confidence: BN;
}

export interface SetOracleInstructionArgs {
  oracle: PublicKey;
}

export interface SetPriceAuthorityInstructionArgs {
  newAuthority: PublicKey;
}

export function initializePriceFeedInstruction(
  program: Program<Price>,
  accounts: {
    priceFeed: PublicKey;
    authority: PublicKey;
    tokenMint: PublicKey;
    systemProgram: PublicKey;
  },
  args: InitializePriceFeedInstructionArgs
): TransactionInstruction {
  return program.methods
    .initializePriceFeed(args.tokenMint)
    .accounts({
      priceFeed: accounts.priceFeed,
      authority: accounts.authority,
      tokenMint: accounts.tokenMint,
      systemProgram: accounts.systemProgram,
    })
    .instruction();
}

export function updatePriceInstruction(
  program: Program<Price>,
  accounts: {
    priceFeed: PublicKey;
    oracle: PublicKey;
  },
  args: UpdatePriceInstructionArgs
): TransactionInstruction {
  return program.methods
    .updatePrice(args.newPrice, args.confidence)
    .accounts({
      priceFeed: accounts.priceFeed,
      oracle: accounts.oracle,
    })
    .instruction();
}

export function setOracleInstruction(
  program: Program<Price>,
  accounts: {
    priceFeed: PublicKey;
    authority: PublicKey;
  },
  args: SetOracleInstructionArgs
): TransactionInstruction {
  return program.methods
    .setOracle(args.oracle)
    .accounts({
      priceFeed: accounts.priceFeed,
      authority: accounts.authority,
    })
    .instruction();
}

export function setPriceAuthorityInstruction(
  program: Program<Price>,
  accounts: {
    priceFeed: PublicKey;
    currentAuthority: PublicKey;
  },
  args: SetPriceAuthorityInstructionArgs
): TransactionInstruction {
  return program.methods
    .setPriceAuthority(args.newAuthority)
    .accounts({
      priceFeed: accounts.priceFeed,
      currentAuthority: accounts.currentAuthority,
    })
    .instruction();
}