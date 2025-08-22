import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, BN, Wallet } from '@coral-xyz/anchor';
import { 
  createOfferInstruction,
  updateOfferInstruction,
  activateOfferInstruction,
  deactivateOfferInstruction,
  closeOfferInstruction
} from '../instructions/offer';
import { deriveOfferAddress, deriveProfileAddress } from '../pdas';
import { Offer } from '../types/offer';
import { PROGRAM_IDS } from '../generated';

const OfferIDL = require('../types/offer.json');

export interface CreateOfferTransactionParams {
  offerId: BN;
  owner: PublicKey;
  tokenMint: PublicKey;
  hubConfig: PublicKey;
  offerType: any;
  fiatCurrency: any;
  rate: BN;
  minAmount?: BN;
  maxAmount?: BN;
  fiatAmount?: BN;
  terms?: string;
  description?: string;
}

export interface UpdateOfferTransactionParams {
  offerId: BN;
  owner: PublicKey;
  rate?: BN;
  minAmount?: BN;
  maxAmount?: BN;
  terms?: string;
  description?: string;
}

export interface ToggleOfferTransactionParams {
  offerId: BN;
  owner: PublicKey;
  activate: boolean;
}

export async function buildCreateOfferTransaction(
  connection: Connection,
  wallet: Wallet,
  params: CreateOfferTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Offer>(OfferIDL, PROGRAM_IDS.offer, provider);
  
  const tx = new Transaction();
  
  // Derive PDAs
  const [offerAddress] = deriveOfferAddress(params.offerId);
  const [ownerProfile] = deriveProfileAddress(params.owner);
  
  tx.add(
    createOfferInstruction(
      program,
      {
        offer: offerAddress,
        owner: params.owner,
        ownerProfile: ownerProfile,
        tokenMint: params.tokenMint,
        hubConfig: params.hubConfig,
        profileProgram: new PublicKey(PROGRAM_IDS.profile),
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      },
      {
        offerId: params.offerId,
        offerType: params.offerType,
        fiatCurrency: params.fiatCurrency,
        rate: params.rate,
        minAmount: params.minAmount,
        maxAmount: params.maxAmount,
        fiatAmount: params.fiatAmount,
        tokenMint: params.tokenMint,
        terms: params.terms || null,
        description: params.description || null,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.owner;
  
  return tx;
}

export async function buildUpdateOfferTransaction(
  connection: Connection,
  wallet: Wallet,
  params: UpdateOfferTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Offer>(OfferIDL, PROGRAM_IDS.offer, provider);
  
  const tx = new Transaction();
  
  const [offerAddress] = deriveOfferAddress(params.offerId);
  
  tx.add(
    updateOfferInstruction(
      program,
      {
        offer: offerAddress,
        owner: params.owner,
      },
      {
        offerId: params.offerId,
        rate: params.rate,
        minAmount: params.minAmount,
        maxAmount: params.maxAmount,
        terms: params.terms,
        description: params.description,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.owner;
  
  return tx;
}

export async function buildToggleOfferTransaction(
  connection: Connection,
  wallet: Wallet,
  params: ToggleOfferTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Offer>(OfferIDL, PROGRAM_IDS.offer, provider);
  
  const tx = new Transaction();
  
  const [offerAddress] = deriveOfferAddress(params.offerId);
  
  if (params.activate) {
    tx.add(
      activateOfferInstruction(
        program,
        {
          offer: offerAddress,
          owner: params.owner,
        },
        {
          offerId: params.offerId,
        }
      )
    );
  } else {
    tx.add(
      deactivateOfferInstruction(
        program,
        {
          offer: offerAddress,
          owner: params.owner,
        },
        {
          offerId: params.offerId,
        }
      )
    );
  }
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.owner;
  
  return tx;
}

export async function buildCloseOfferTransaction(
  connection: Connection,
  wallet: Wallet,
  params: {
    offerId: BN;
    owner: PublicKey;
  }
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Offer>(OfferIDL, PROGRAM_IDS.offer, provider);
  
  const tx = new Transaction();
  
  const [offerAddress] = deriveOfferAddress(params.offerId);
  
  tx.add(
    closeOfferInstruction(
      program,
      {
        offer: offerAddress,
        owner: params.owner,
      },
      {
        offerId: params.offerId,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.owner;
  
  return tx;
}

export async function buildOfferLifecycleTransactions(
  connection: Connection,
  wallet: Wallet,
  params: {
    offerId: BN;
    owner: PublicKey;
    tokenMint: PublicKey;
    hubConfig: PublicKey;
    offerType: any;
    fiatCurrency: any;
    rate: BN;
    minAmount?: BN;
    maxAmount?: BN;
    terms?: string;
    description?: string;
  }
): Promise<{
  create: Transaction;
  activate: Transaction;
  deactivate: Transaction;
  close: Transaction;
}> {
  return {
    create: await buildCreateOfferTransaction(connection, wallet, params),
    activate: await buildToggleOfferTransaction(connection, wallet, {
      offerId: params.offerId,
      owner: params.owner,
      activate: true,
    }),
    deactivate: await buildToggleOfferTransaction(connection, wallet, {
      offerId: params.offerId,
      owner: params.owner,
      activate: false,
    }),
    close: await buildCloseOfferTransaction(connection, wallet, {
      offerId: params.offerId,
      owner: params.owner,
    }),
  };
}