const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const { createMint } = require("@solana/spl-token");
const fs = require('fs');
const path = require('path');

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
  
  // Use a new keypair as wallet
  const wallet = new anchor.Wallet(Keypair.generate());
  console.log("Using wallet:", wallet.publicKey.toString());
  
  // Airdrop SOL to the new wallet
  console.log("Airdropping 2 SOL to wallet...");
  const airdropSignature = await connection.requestAirdrop(
    wallet.publicKey,
    2 * anchor.web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSignature);
  console.log("Airdrop confirmed!");
  
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  
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
  const hubIdl = JSON.parse(fs.readFileSync(hubIdlPath, 'utf8'));
  
  // Create program
  const hubProgram = new anchor.Program(hubIdl, HUB_PROGRAM_ID, provider);
  
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
    if (err.logs) {
      console.error("Transaction logs:", err.logs);
    }
  }
}

main().catch(err => {
  console.error("Error in main:", err);
}); 