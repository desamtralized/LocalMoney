import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, BN, Wallet } from '@coral-xyz/anchor';
import { 
  createProfileInstruction,
  updateProfileInstruction,
  updateReputationInstruction,
  verifyProfileInstruction
} from '../instructions/profile';
import { deriveProfileAddress } from '../pdas';
import { Profile } from '../types/profile';
import { PROGRAM_IDS } from '../generated';

const ProfileIDL = require('../types/profile.json');

export interface CreateProfileTransactionParams {
  user: PublicKey;
  username: string;
  region: string;
  contactInfo?: string;
}

export interface UpdateProfileTransactionParams {
  user: PublicKey;
  username?: string;
  region?: string;
  contactInfo?: string;
}

export interface UpdateReputationTransactionParams {
  profile: PublicKey;
  authority: PublicKey;
  successfulTrades: number;
  totalVolume: BN;
  rating: number;
}

export async function buildCreateProfileTransaction(
  connection: Connection,
  wallet: Wallet,
  params: CreateProfileTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Profile>(ProfileIDL, PROGRAM_IDS.profile, provider);
  
  const tx = new Transaction();
  
  // Derive profile PDA
  const [profileAddress] = deriveProfileAddress(params.user);
  
  tx.add(
    createProfileInstruction(
      program,
      {
        profile: profileAddress,
        user: params.user,
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      },
      {
        username: params.username,
        region: params.region,
        contactInfo: params.contactInfo || null,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.user;
  
  return tx;
}

export async function buildUpdateProfileTransaction(
  connection: Connection,
  wallet: Wallet,
  params: UpdateProfileTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Profile>(ProfileIDL, PROGRAM_IDS.profile, provider);
  
  const tx = new Transaction();
  
  const [profileAddress] = deriveProfileAddress(params.user);
  
  tx.add(
    updateProfileInstruction(
      program,
      {
        profile: profileAddress,
        user: params.user,
      },
      {
        username: params.username || null,
        region: params.region || null,
        contactInfo: params.contactInfo || null,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.user;
  
  return tx;
}

export async function buildUpdateReputationTransaction(
  connection: Connection,
  wallet: Wallet,
  params: UpdateReputationTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Profile>(ProfileIDL, PROGRAM_IDS.profile, provider);
  
  const tx = new Transaction();
  
  tx.add(
    updateReputationInstruction(
      program,
      {
        profile: params.profile,
        authority: params.authority,
      },
      {
        successfulTrades: params.successfulTrades,
        totalVolume: params.totalVolume,
        rating: params.rating,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.authority;
  
  return tx;
}

export async function buildVerifyProfileTransaction(
  connection: Connection,
  wallet: Wallet,
  params: {
    profile: PublicKey;
    verifier: PublicKey;
    verificationLevel: number;
  }
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Profile>(ProfileIDL, PROGRAM_IDS.profile, provider);
  
  const tx = new Transaction();
  
  tx.add(
    verifyProfileInstruction(
      program,
      {
        profile: params.profile,
        verifier: params.verifier,
      },
      {
        verificationLevel: params.verificationLevel,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.verifier;
  
  return tx;
}

export async function buildCompleteProfileSetupTransaction(
  connection: Connection,
  wallet: Wallet,
  params: {
    user: PublicKey;
    username: string;
    region: string;
    contactInfo?: string;
  }
): Promise<Transaction> {
  return buildCreateProfileTransaction(connection, wallet, params);
}