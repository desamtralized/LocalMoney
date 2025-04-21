import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log("Starting LocalMoney lifecycle initialization...");
  
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

  // Create a second user for trading
  const secondUser = Keypair.generate();
  console.log("Created second user:", secondUser.publicKey.toString());
  
  // Fund the second user with some SOL
  const airdropSignature = await connection.requestAirdrop(
    secondUser.publicKey,
    2 * anchor.web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSignature);
  console.log("Funded second user with 2 SOL");
  
  // ------------------ STEP 1: INITIALIZE HUB ------------------
  console.log("\n--- STEP 1: Initialize Hub ---");
  
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
  } else {
    // Create mock USDC token mint
    const mockUsdcMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6 // Standard USDC decimals
    );
    console.log("Created mock USDC mint:", mockUsdcMint.toString());
    
    // Load hub program
    const hubProgram = new Program(
      JSON.parse(fs.readFileSync(path.join(__dirname, '../target/idl/hub.json'), 'utf8')),
      programIds.hub,
      provider
    );
    
    // Define hub configuration
    const hubConfig = {
      offerProgram: programIds.offer,
      tradeProgram: programIds.trade,
      profileProgram: programIds.profile,
      priceProgram: programIds.price,
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
      return;
    }
  }

  // ------------------ STEP 2: INITIALIZE PROFILE & PRICE PROGRAMS ------------------
  console.log("\n--- STEP 2: Initialize Profile & Price Programs ---");
  
  // Load profile and price programs
  const profileProgram = new Program(
    JSON.parse(fs.readFileSync(path.join(__dirname, '../target/idl/profile.json'), 'utf8')),
    programIds.profile,
    provider
  );
  const priceProgram = new Program(
    JSON.parse(fs.readFileSync(path.join(__dirname, '../target/idl/price.json'), 'utf8')),
    programIds.price,
    provider
  );
  
  // Calculate Profile Config PDA
  const [profileConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("profile_config")],
    programIds.profile
  );
  
  // Check if profile config is already initialized
  const profileConfigAccount = await connection.getAccountInfo(profileConfigPda);
  if (profileConfigAccount) {
    console.log("Profile config already exists.");
  } else {
    try {
      // Initialize the profile program
      const profileTx = await profileProgram.methods
        .initialize()
        .accounts({
          authority: wallet.publicKey,
          hubAuthority: wallet.publicKey,
          profileConfig: profileConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Profile program initialized. Transaction:", profileTx);
      
      // Register profile program with hub
      const registerProfileTx = await profileProgram.methods
        .registerHub()
        .accounts({
          authority: wallet.publicKey,
          hubAuthority: wallet.publicKey,
          profileConfig: profileConfigPda,
        })
        .rpc();
      
      console.log("Profile program registered with hub. Transaction:", registerProfileTx);
    } catch (err) {
      console.error("Error initializing profile program:", err);
    }
  }
  
  // Calculate Price Config PDA
  const [priceConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("price_config")],
    programIds.price
  );
  
  // Check if price config is already initialized
  const priceConfigAccount = await connection.getAccountInfo(priceConfigPda);
  if (priceConfigAccount) {
    console.log("Price config already exists.");
  } else {
    try {
      // Initialize the price program
      const priceTx = await priceProgram.methods
        .initialize()
        .accounts({
          authority: wallet.publicKey,
          hubAuthority: wallet.publicKey,
          priceConfig: priceConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Price program initialized. Transaction:", priceTx);
      
      // Register price program with hub
      const registerPriceTx = await priceProgram.methods
        .registerHub()
        .accounts({
          authority: wallet.publicKey,
          hubAuthority: wallet.publicKey,
          priceConfig: priceConfigPda,
        })
        .rpc();
      
      console.log("Price program registered with hub. Transaction:", registerPriceTx);
    } catch (err) {
      console.error("Error initializing price program:", err);
    }
  }

  // ------------------ STEP 3: CREATE USER PROFILES ------------------
  console.log("\n--- STEP 3: Create User Profiles ---");
  
  // Calculate PDAs for user profiles
  const [adminProfilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), wallet.publicKey.toBuffer()],
    programIds.profile
  );
  
  const [secondUserProfilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), secondUser.publicKey.toBuffer()],
    programIds.profile
  );
  
  // Check if admin profile already exists
  const adminProfileAccount = await connection.getAccountInfo(adminProfilePda);
  if (adminProfileAccount) {
    console.log("Admin profile already exists.");
  } else {
    try {
      // Create profile for admin user
      const createAdminProfileTx = await profileProgram.methods
        .createProfile({
          displayName: "Admin User",
          email: "admin@localmoney.com",
          phoneNumber: "+1234567890",
          telegramUsername: "@admin",
          avatarUrl: "https://example.com/avatar.png",
        })
        .accounts({
          owner: wallet.publicKey,
          profile: adminProfilePda,
          profileConfig: profileConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Admin profile created. Transaction:", createAdminProfileTx);
    } catch (err) {
      console.error("Error creating admin profile:", err);
    }
  }
  
  // Create profile for second user
  const secondUserProfileAccount = await connection.getAccountInfo(secondUserProfilePda);
  if (secondUserProfileAccount) {
    console.log("Second user profile already exists.");
  } else {
    try {
      // Create profile for second user
      const createSecondUserProfileTx = await profileProgram.methods
        .createProfile({
          displayName: "Trader",
          email: "trader@localmoney.com",
          phoneNumber: "+9876543210",
          telegramUsername: "@trader",
          avatarUrl: "https://example.com/trader.png",
        })
        .accounts({
          owner: secondUser.publicKey,
          profile: secondUserProfilePda,
          profileConfig: profileConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([secondUser])
        .rpc();
      
      console.log("Second user profile created. Transaction:", createSecondUserProfileTx);
    } catch (err) {
      console.error("Error creating second user profile:", err);
    }
  }

  // ------------------ STEP 4: CREATE OFFERS ------------------
  console.log("\n--- STEP 4: Create Offers ---");
  
  // Load offer program
  const offerProgram = new Program(
    JSON.parse(fs.readFileSync(path.join(__dirname, '../target/idl/offer.json'), 'utf8')),
    programIds.offer,
    provider
  );
  
  // Initialize offer program if not already initialized
  try {
    // Check if offer program is already initialized
    // Since we don't have a direct way to check, we'll just try to initialize it
    await offerProgram.methods
      .initialize()
      .accounts({
        owner: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Offer program initialized.");
  } catch (err) {
    console.log("Offer program might already be initialized or there was an error:", err);
  }
  
  // Calculate offer counter PDA for admin
  const [adminOfferCounterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("offer_counter"), wallet.publicKey.toBuffer()],
    programIds.offer
  );
  
  // Check if offer counter exists
  const adminOfferCounterAccount = await connection.getAccountInfo(adminOfferCounterPda);
  if (!adminOfferCounterAccount) {
    try {
      // Create offer counter for admin
      const createOfferCounterTx = await offerProgram.methods
        .createOfferCounter()
        .accounts({
          owner: wallet.publicKey,
          offerCounter: adminOfferCounterPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Admin offer counter created. Transaction:", createOfferCounterTx);
    } catch (err) {
      console.error("Error creating admin offer counter:", err);
    }
  }
  
  // Create a sell offer from admin
  try {
    // Calculate offer PDA (assuming count is 0 for the first offer)
    const offerCount = adminOfferCounterAccount ? 
      offerProgram.coder.accounts.decode("OfferCounter", adminOfferCounterAccount.data).count : 0;
    
    const [offerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("offer"), wallet.publicKey.toBuffer(), Buffer.from([offerCount])],
      programIds.offer
    );
    
    // Get local token mint from hub account
    const hubData = hubAccount ? 
      await connection.getAccountInfo(hubPda) : null;
    
    // This is a placeholder - in a real implementation you'd properly decode the hub data
    // to get the local token mint
    const localTokenMint = hubData ? 
      new PublicKey("So11111111111111111111111111111111111111112") : // Placeholder
      new PublicKey("So11111111111111111111111111111111111111112"); // Placeholder
    
    // Create a sell offer
    const createOfferTx = await offerProgram.methods
      .createOffer(
        { sell: {} }, // Offer direction - selling crypto
        "USD", // Fiat currency
        [{ bankTransfer: {} }], // Payment methods
        10, // Min amount in USD
        1000, // Max amount in USD
        5, // Price premium (5%)
        "Selling crypto for USD via bank transfer"
      )
      .accounts({
        owner: wallet.publicKey,
        hub: hubPda,
        tokenMint: localTokenMint,
        offerCounter: adminOfferCounterPda,
        offer: offerPda,
        profile: adminProfilePda,
        hubProgram: programIds.hub,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Sell offer created. Transaction:", createOfferTx);
  } catch (err) {
    console.error("Error creating sell offer:", err);
  }

  // ------------------ STEP 5: CREATE TRADES ------------------
  console.log("\n--- STEP 5: Create Trades ---");
  
  // Load trade program
  const tradeProgram = new Program(
    JSON.parse(fs.readFileSync(path.join(__dirname, '../target/idl/trade.json'), 'utf8')),
    programIds.trade,
    provider
  );
  
  // Initialize trade program
  try {
    // Calculate Trade Config PDA
    const [tradeConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      programIds.trade
    );
    
    // Check if trade config exists
    const tradeConfigAccount = await connection.getAccountInfo(tradeConfigPda);
    if (!tradeConfigAccount) {
      // Initialize trade program
      const initTradeTx = await tradeProgram.methods
        .initialize()
        .accounts({
          admin: wallet.publicKey,
          tradeConfig: tradeConfigPda,
          hub: hubPda,
          profileProgram: programIds.profile,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("Trade program initialized. Transaction:", initTradeTx);
    } else {
      console.log("Trade program already initialized.");
    }
  } catch (err) {
    console.error("Error initializing trade program:", err);
  }
  
  console.log("\nLocalMoney platform initialized successfully!");
  console.log("You can now interact with the platform using the following accounts:");
  console.log("- Admin:", wallet.publicKey.toString());
  console.log("- Second User:", secondUser.publicKey.toString());
  console.log("- Hub PDA:", hubPda.toString());
}

main().catch(err => {
  console.error("Error in main:", err);
}); 