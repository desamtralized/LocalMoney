import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint } from "@solana/spl-token";
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    offer: new PublicKey("GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn"),
    price: new PublicKey("51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
    trade: new PublicKey("kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB")
  };
  
  // Setup connection and provider
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  
  // Use default wallet (local validator authority)
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  
  console.log("Using wallet:", wallet.publicKey.toString());
  
  // Calculate Hub PDA
  const [hubPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("hub")],
    programIds.hub
  );
  
  console.log("Hub PDA:", hubPda.toString());
  
  // Check if hub is already initialized
  const hubAccount = await connection.getAccountInfo(hubPda);
  if (hubAccount) {
    console.log("Hub account already exists. Size:", hubAccount.data.length, "bytes");
    return;
  }
  
  // Create a mock USDC token mint
  const mockUsdcMint = Keypair.generate();
  console.log("Mock USDC mint:", mockUsdcMint.publicKey.toString());
  
  // Create the token mint
  const lamports = await getMinimumBalanceForRentExemptMint(connection);
  const decimals = 6; // Standard for USDC
  
  const transaction = new anchor.web3.Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mockUsdcMint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mockUsdcMint.publicKey,
      decimals,
      wallet.publicKey,
      wallet.publicKey
    )
  );
  
  const signature = await provider.sendAndConfirm(transaction, [mockUsdcMint]);
  console.log("Created mock USDC mint:", signature);
  
  // Load hub program from IDL
  const hubIdlPath = path.join(__dirname, '../target/idl/hub.json');
  const hubIdl = JSON.parse(fs.readFileSync(hubIdlPath, 'utf8'));
  const hubProgram = new anchor.Program(hubIdl, programIds.hub, provider);
  
  // Define hub configuration
  const hubConfig = {
    offerProgram: programIds.offer,
    tradeProgram: programIds.trade,
    profileProgram: programIds.profile,
    priceProgram: programIds.price,
    priceProvider: wallet.publicKey,
    localMarket: PublicKey.default,
    localTokenMint: mockUsdcMint.publicKey,
    chainFeeCollector: Keypair.generate().publicKey,
    warchest: Keypair.generate().publicKey,
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
  }
}

main().catch(err => {
  console.error("Error in main:", err);
}); 