import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log("Starting hub initialization...");
  
  // Program ID from Anchor.toml
  const HUB_PROGRAM_ID = new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG");
  const OFFER_PROGRAM_ID = new PublicKey("GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn");
  const PRICE_PROGRAM_ID = new PublicKey("51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG");
  const PROFILE_PROGRAM_ID = new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq");
  const TRADE_PROGRAM_ID = new PublicKey("kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB");
  
  // Setup connection and provider
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  
  // Use default wallet (local validator authority)
  const wallet = anchor.Wallet.local();
  const provider = new AnchorProvider(
    connection,
    wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  
  console.log("Using wallet:", wallet.publicKey.toString());
  
  // Calculate Hub PDA
  const [hubPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("hub")],
    HUB_PROGRAM_ID
  );
  
  console.log("Hub PDA:", hubPda.toString());
  
  // Check if hub is already initialized
  const hubAccount = await connection.getAccountInfo(hubPda);
  if (hubAccount) {
    console.log("Hub account already exists. Size:", hubAccount.data.length, "bytes");
    return;
  }
  
  // Create a mock USDC token mint
  const mockUsdcMint = await createMint(
    connection,
    wallet.payer,
    wallet.publicKey,
    null,
    6 // Standard USDC decimals
  );
  console.log("Created mock USDC mint:", mockUsdcMint.toString());
  
  // Load hub IDL
  const hubIdlPath = path.join(__dirname, '../target/idl/hub.json');
  const hubIdl = JSON.parse(fs.readFileSync(hubIdlPath, 'utf8')) as Idl;
  
  // Initialize the hub program directly with Anchor workspace approach
  const hubProgram = anchor.workspace.hub as Program<any>;
  
  // Define hub configuration
  const hubConfig = {
    offerProgram: OFFER_PROGRAM_ID,
    tradeProgram: TRADE_PROGRAM_ID,
    profileProgram: PROFILE_PROGRAM_ID,
    priceProgram: PRICE_PROGRAM_ID,
    priceProvider: wallet.publicKey,
    localMarket: PublicKey.default,
    localTokenMint: mockUsdcMint,
    chainFeeCollector: wallet.publicKey,
    warchest: wallet.publicKey,
    activeOffersLimit: 10,
    activeTradesLimit: 10,
    arbitrationFeePct: 1, // 1%
    burnFeePct: 0, // 0%
    chainFeePct: 1, // 1%
    warchestFeePct: 1, // 1%
    tradeExpirationTimer: 60 * 60 * 24, // 1 day in seconds
    tradeDisputeTimer: 60 * 60 * 48, // 2 days in seconds
    tradeLimitMin: 10, // $10 USD min
    tradeLimitMax: 10000, // $10,000 USD max
  };
  
  try {
    // Initialize the hub
    const hubTx = await hubProgram.methods
      .initialize(hubConfig)
      .accounts({
        hub: hubPda,
        admin: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Hub initialized successfully. Transaction:", hubTx);
  } catch (err) {
    console.error("Error initializing hub:", err);
    console.error("Error details:", err.logs || err.message);
  }
}

main().catch(err => {
  console.error("Error in main:", err);
}); 