const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint } = require("@solana/spl-token");
const fs = require('fs');
const path = require('path');

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
  
  // Create a new keypair and airdrop SOL
  const admin = Keypair.generate();
  
  console.log("Generated admin keypair:", admin.publicKey.toString());
  
  // Airdrop SOL
  console.log("Airdropping 2 SOL to admin...");
  const airdropSignature = await connection.requestAirdrop(
    admin.publicKey,
    2 * anchor.web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSignature);
  console.log("Airdrop confirmed!");
  
  // Create provider with our keypair
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  
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
      fromPubkey: admin.publicKey,
      newAccountPubkey: mockUsdcMint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mockUsdcMint.publicKey,
      decimals,
      admin.publicKey,
      admin.publicKey
    )
  );
  
  const signature = await provider.sendAndConfirm(transaction, [mockUsdcMint]);
  console.log("Created mock USDC mint:", signature);
  
  // Load hub program from IDL
  const hubIdlPath = path.join(__dirname, '../target/idl/hub.json');
  const hubIdl = JSON.parse(fs.readFileSync(hubIdlPath, 'utf8'));
  
  try {
    // Manually set up the program 
    const hubProgram = new anchor.Program(hubIdl, programIds.hub, provider);
    
    // Define hub configuration
    const hubConfig = {
      offerProgram: programIds.offer,
      tradeProgram: programIds.trade,
      profileProgram: programIds.profile,
      priceProgram: programIds.price,
      priceProvider: admin.publicKey,
      localMarket: PublicKey.default,
      localTokenMint: mockUsdcMint.publicKey,
      chainFeeCollector: admin.publicKey,
      warchest: admin.publicKey,
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
    
    // Initialize the hub
    const hubTx = await hubProgram.methods
      .initialize(hubConfig)
      .accounts({
        hub: hubPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
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