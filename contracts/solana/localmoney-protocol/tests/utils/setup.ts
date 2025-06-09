import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Hub } from "../../target/types/hub";
import { Offer } from "../../target/types/offer";
import { Trade } from "../../target/types/trade";
import { Profile } from "../../target/types/profile";
import { Price } from "../../target/types/price";

export interface TestWorkspace {
  provider: AnchorProvider;
  connection: Connection;
  hubProgram: Program<Hub>;
  offerProgram: Program<Offer>;
  tradeProgram: Program<Trade>;
  profileProgram: Program<Profile>;
  priceProgram: Program<Price>;
  authority: Keypair;
}

export function setupTestWorkspace(): TestWorkspace {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Get programs from workspace
  const hubProgram = anchor.workspace.Hub as Program<Hub>;
  const offerProgram = anchor.workspace.Offer as Program<Offer>;
  const tradeProgram = anchor.workspace.Trade as Program<Trade>;
  const profileProgram = anchor.workspace.Profile as Program<Profile>;
  const priceProgram = anchor.workspace.Price as Program<Price>;

  // Create test authority keypair
  const authority = Keypair.generate();

  return {
    provider,
    connection: provider.connection,
    hubProgram,
    offerProgram,
    tradeProgram,
    profileProgram,
    priceProgram,
    authority,
  };
}

export async function airdropSol(connection: Connection, publicKey: PublicKey, lamports: number = 1000000000) {
  const signature = await connection.requestAirdrop(publicKey, lamports);
  await connection.confirmTransaction(signature);
}

export function findGlobalConfigPDA(hubProgramId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    hubProgramId
  );
}

export function findProfilePDA(owner: PublicKey, profileProgramId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), owner.toBuffer()],
    profileProgramId
  );
}

export function findOfferPDA(offerId: number, offerProgramId: PublicKey): [PublicKey, number] {
  const offerIdBuffer = Buffer.alloc(8);
  offerIdBuffer.writeBigUInt64LE(BigInt(offerId), 0);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from("offer"), offerIdBuffer],
    offerProgramId
  );
}

export function findTradePDA(tradeId: number, tradeProgramId: PublicKey): [PublicKey, number] {
  const tradeIdBuffer = Buffer.alloc(8);
  tradeIdBuffer.writeBigUInt64LE(BigInt(tradeId), 0);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from("trade"), tradeIdBuffer],
    tradeProgramId
  );
}

// Test data generators
export function createValidInitializeParams() {
  return {
    offerProgram: anchor.workspace.Offer.programId,
    tradeProgram: anchor.workspace.Trade.programId,
    profileProgram: anchor.workspace.Profile.programId,
    priceProgram: anchor.workspace.Price.programId,
    priceProvider: Keypair.generate().publicKey,
    localMint: Keypair.generate().publicKey,
    chainFeeCollector: Keypair.generate().publicKey,
    warchest: Keypair.generate().publicKey,
    activeOffersLimit: 5,
    activeTradesLimit: 3,
    arbitrationFeeBps: 200,  // 2%
    burnFeeBps: 100,         // 1%
    chainFeeBps: 50,         // 0.5%
    warchestFeeBps: 50,      // 0.5%
    tradeExpirationTimer: new anchor.BN(86400), // 1 day
    tradeDisputeTimer: new anchor.BN(43200),    // 12 hours
    tradeLimitMin: new anchor.BN(10000000),     // $10 USD (6 decimals)
    tradeLimitMax: new anchor.BN(1000000000000), // $1M USD (6 decimals)
  };
}

export function createValidUpdateConfigParams() {
  return {
    chainFeeCollector: null,
    warchest: null,
    priceProvider: null,
    activeOffersLimit: 10,
    activeTradesLimit: 5,
    arbitrationFeeBps: 250,  // 2.5%
    burnFeeBps: 100,         // 1%
    chainFeeBps: 75,         // 0.75%
    warchestFeeBps: 75,      // 0.75%
    tradeExpirationTimer: new anchor.BN(172800), // 2 days
    tradeDisputeTimer: new anchor.BN(86400),     // 1 day
    tradeLimitMin: new anchor.BN(5000000),       // $5 USD (6 decimals)
    tradeLimitMax: new anchor.BN(500000000000),  // $500K USD (6 decimals)
  };
} 