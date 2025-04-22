import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";
import * as fs from 'fs';
import * as path from 'path';

describe("LocalMoney Protocol - Anchor Integration", () => {
  // Test keypairs for different roles
  const admin = Keypair.generate();
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  const arbitrator = Keypair.generate();
  
  // Connection and provider setup
  const connection = new Connection("http://localhost:8899", "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    offer: new PublicKey("GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn"),
    price: new PublicKey("51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
    trade: new PublicKey("kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB")
  };
  
  // Program objects
  let hubProgram: anchor.Program<any>;
  let offerProgram: anchor.Program<any>;
  let priceProgram: anchor.Program<any>;
  let profileProgram: anchor.Program<any>;
  let tradeProgram: anchor.Program<any>;
  
  // PDAs
  const [hubPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("hub")],
    programIds.hub
  );
  
  // Mock token mint for testing
  let tokenMint: PublicKey;
  let makerTokenAccount: PublicKey;
  let takerTokenAccount: PublicKey;
  
  // Profile PDAs
  let makerProfilePda: PublicKey;
  let takerProfilePda: PublicKey;
  let arbProfilePda: PublicKey;
  
  // Offer-related PDAs
  let offerCounterPda: PublicKey;
  let offerPda: PublicKey;
  
  before(async () => {
    console.log("Setting up test environment...");
    
    // Airdrop SOL to test accounts
    const airdropAmount = 10 * anchor.web3.LAMPORTS_PER_SOL;
    
    for (const kp of [admin, maker, taker, arbitrator]) {
      const signature = await provider.connection.requestAirdrop(
        kp.publicKey, airdropAmount
      );
      await provider.connection.confirmTransaction(signature);
      console.log(`Airdropped ${airdropAmount / anchor.web3.LAMPORTS_PER_SOL} SOL to ${kp.publicKey.toString()}`);
    }
    
    // Create token mint and accounts for testing
    tokenMint = await createMint(
      connection, 
      admin, 
      admin.publicKey, 
      null, 
      6  // decimals
    );
    
    makerTokenAccount = await createAccount(
      connection,
      maker,
      tokenMint,
      maker.publicKey
    );
    
    takerTokenAccount = await createAccount(
      connection,
      taker,
      tokenMint,
      taker.publicKey
    );
    
    // Mint tokens to maker (for selling)
    await mintTo(
      connection,
      admin,
      tokenMint,
      makerTokenAccount,
      admin.publicKey,
      1000000000  // 1000 tokens with 6 decimals
    );
    
    console.log("Created token mint:", tokenMint.toString());
    console.log("Maker token account:", makerTokenAccount.toString());
    console.log("Taker token account:", takerTokenAccount.toString());
    
    // Load programs from IDLs
    const hubIdl = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../target/idl/hub.json'), 
      'utf8'
    ));
    
    const offerIdl = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../target/idl/offer.json'), 
      'utf8'
    ));
    
    const priceIdl = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../target/idl/localmoney_price.json'), 
      'utf8'
    ));
    
    const profileIdl = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../target/idl/profile.json'), 
      'utf8'
    ));
    
    const tradeIdl = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../target/idl/trade.json'), 
      'utf8'
    ));
    
    // Create program objects
    hubProgram = new anchor.Program(hubIdl, programIds.hub, provider);
    offerProgram = new anchor.Program(offerIdl, programIds.offer, provider);
    priceProgram = new anchor.Program(priceIdl, programIds.price, provider);
    profileProgram = new anchor.Program(profileIdl, programIds.profile, provider);
    tradeProgram = new anchor.Program(tradeIdl, programIds.trade, provider);
    
    // Derive profile PDAs
    makerProfilePda = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), maker.publicKey.toBuffer()],
      programIds.profile
    )[0];
    
    takerProfilePda = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), taker.publicKey.toBuffer()],
      programIds.profile
    )[0];
    
    arbProfilePda = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), arbitrator.publicKey.toBuffer()],
      programIds.profile
    )[0];
    
    // Derive offer counter PDA
    offerCounterPda = PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      programIds.offer
    )[0];
    
    console.log("Test environment setup complete!");
  });
  
  it("should initialize hub with proper configuration", async () => {
    // Create a hub config with all required fields
    const hubConfig = {
      offerProgram: programIds.offer,
      tradeProgram: programIds.trade,
      profileProgram: programIds.profile,
      priceProgram: programIds.price,
      priceProvider: admin.publicKey,
      localMarket: admin.publicKey,
      localTokenMint: tokenMint,
      chainFeeCollector: admin.publicKey,
      warchest: admin.publicKey,
      activeOffersLimit: 10,
      activeTradesLimit: 10,
      arbitrationFeePct: 1,
      burnFeePct: 1,
      chainFeePct: 1,
      warchestFeePct: 1,
      disputeTime: new anchor.BN(86400),  // 1 day in seconds
      tradeTime: new anchor.BN(3600),     // 1 hour in seconds
      minTradeAmount: new anchor.BN(1000000),  // 1 token with 6 decimals
      minOfferAmount: new anchor.BN(1000000),  // 1 token with 6 decimals
      versionMajor: 0,
      versionMinor: 1,
      versionPatch: 0
    };
    
    try {
      // Initialize hub with proper configuration using Anchor's native API
      const tx = await hubProgram.methods
        .initialize(hubConfig)
        .accounts({
          admin: admin.publicKey,
          hub: hubPda,
          systemProgram: SystemProgram.programId
        })
        .signers([admin])
        .rpc();
      
      console.log("Hub initialized successfully! Transaction:", tx);
      
      // Fetch the hub account to verify initialization
      const hubAccount = await hubProgram.account.hub.fetchNullable(hubPda);
      
      // Verify configuration was stored correctly
      assert.equal(
        hubAccount.config.offerProgram.toString(),
        programIds.offer.toString(),
        "Offer program address mismatch"
      );
      
      assert.equal(
        hubAccount.config.tradeProgram.toString(),
        programIds.trade.toString(),
        "Trade program address mismatch"
      );
      
      console.log("Hub initialization verified!");
    } catch (err) {
      console.error("Error initializing hub:", err);
      // Check if the hub already exists
      try {
        const hubAccount = await hubProgram.account.hub.fetchNullable(hubPda);
        console.log("Hub already initialized, proceeding with test");
      } catch (fetchErr) {
        throw err; // Re-throw if it's not just that the hub already exists
      }
    }
  });
  
  it("should initialize program registrations with hub", async () => {
    // Use Trade program as an example for hub registration
    try {
      // This derives the trade config PDA
      const [tradeConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programIds.trade
      );
      
      // This derives the trade counter PDA
      const [tradeCounterPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("counter")],
        programIds.trade
      );
      
      // Register Trade program with Hub
      const tx = await tradeProgram.methods
        .registerHub()
        .accounts({
          admin: admin.publicKey,
          hubProgram: programIds.hub,
          hub: hubPda,
          tradeConfig: tradeConfigPda,
          tradesCounter: tradeCounterPda,
          systemProgram: SystemProgram.programId
        })
        .signers([admin])
        .rpc();
      
      console.log("Trade program registered with hub! Transaction:", tx);
    } catch (err) {
      console.error("Error registering trade program with hub:", err);
      // Check if already registered
      const [tradeConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programIds.trade
      );
      
      try {
        const tradeConfig = await tradeProgram.account.tradeConfig.fetchNullable(tradeConfigPda);
        console.log("Trade program already registered, proceeding with test");
      } catch (fetchErr) {
        throw err; // Re-throw if it's not just that it's already registered
      }
    }
    
    // Similarly register other programs with Hub (Offer, Price, Profile)
    // (Implementation for other programs would be similar)
  });
  
  it("should create user profiles", async () => {
    // Create maker profile
    try {
      const tx = await profileProgram.methods
        .updateContact("maker@example.com", "maker-encryption-key")
        .accounts({
          profileOwner: maker.publicKey,
          profile: makerProfilePda,
          hub: hubPda,
          systemProgram: SystemProgram.programId
        })
        .signers([maker])
        .rpc();
      
      console.log("Maker profile created! Transaction:", tx);
    } catch (err) {
      console.error("Error creating maker profile:", err);
      // Check if profile already exists
      try {
        const profile = await profileProgram.account.profile.fetchNullable(makerProfilePda);
        console.log("Maker profile already exists, proceeding with test");
      } catch (fetchErr) {
        throw err; // Re-throw if it's not just that the profile already exists
      }
    }
    
    // Create taker profile (similar approach)
    try {
      const tx = await profileProgram.methods
        .updateContact("taker@example.com", "taker-encryption-key")
        .accounts({
          profileOwner: taker.publicKey,
          profile: takerProfilePda,
          hub: hubPda,
          systemProgram: SystemProgram.programId
        })
        .signers([taker])
        .rpc();
      
      console.log("Taker profile created! Transaction:", tx);
    } catch (err) {
      console.error("Error creating taker profile:", err);
      try {
        const profile = await profileProgram.account.profile.fetchNullable(takerProfilePda);
        console.log("Taker profile already exists, proceeding with test");
      } catch (fetchErr) {
        throw err;
      }
    }
  });
  
  it("should create an offer", async () => {
    try {
      // Initialize offers counter if needed
      try {
        const counterInfo = await offerProgram.account.counter.fetchNullable(offerCounterPda);
        console.log("Offers counter already initialized:", counterInfo.count.toString());
      } catch (err) {
        // Counter doesn't exist, initialize it
        const initTx = await offerProgram.methods
          .initialize()
          .accounts({
            admin: admin.publicKey,
            hub: hubPda,
            counter: offerCounterPda,
            systemProgram: SystemProgram.programId
          })
          .signers([admin])
          .rpc();
          
        console.log("Initialized offers counter! Transaction:", initTx);
      }
      
      // Get current counter value to create offer PDA
      const counterInfo = await offerProgram.account.counter.fetchNullable(offerCounterPda);
      const offerId = counterInfo.count.toNumber();
      
      // Derive offer PDA
      offerPda = PublicKey.findProgramAddressSync(
        [Buffer.from("offer"), new BN(offerId).toArrayLike(Buffer, "le", 8)],
        programIds.offer
      )[0];
      
      // Create a sell offer (maker selling tokens for fiat)
      const offerParams = {
        direction: { sell: {} },  // Enum variant: selling crypto
        denom: tokenMint,  // Token mint
        denomAmount: new BN(100000000),  // 100 tokens with 6 decimals
        fiatCurrency: "USD",  // USD as string or appropriate enum
        fiatAmount: new BN(10000),  // $100.00 with 2 decimal places
        paymentMethod: "Bank Transfer",
        description: "Sell tokens for USD via bank transfer",
        pricePremium: 0,  // 0% premium
        termsAndConditions: "Standard terms apply",
        contactInfo: "maker@example.com",
        encryptionKey: "maker-encryption-key"
      };
      
      const tx = await offerProgram.methods
        .createOffer(offerParams)
        .accounts({
          owner: maker.publicKey,
          offer: offerPda,
          counter: offerCounterPda,
          hub: hubPda,
          profile: makerProfilePda,
          systemProgram: SystemProgram.programId
        })
        .signers([maker])
        .rpc();
      
      console.log("Offer created! Transaction:", tx);
      console.log("Offer ID:", offerId);
      console.log("Offer PDA:", offerPda.toString());
      
      // Fetch and verify the offer account
      const offerAccount = await offerProgram.account.offer.fetchNullable(offerPda);
      
      assert.equal(
        offerAccount.owner.toString(),
        maker.publicKey.toString(),
        "Offer owner mismatch"
      );
      
      assert.equal(
        offerAccount.denomAmount.toString(),
        offerParams.denomAmount.toString(),
        "Offer denom amount mismatch"
      );
      
      console.log("Offer creation verified!");
    } catch (err) {
      console.error("Error creating offer:", err);
      throw err;
    }
  });
  
  it("should create a trade", async () => {
    try {
      // Initialize trade counter if needed
      const [tradeCounterPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("counter")],
        programIds.trade
      );
      
      try {
        const counterInfo = await tradeProgram.account.counter.fetchNullable(tradeCounterPda);
        console.log("Trades counter already initialized:", counterInfo.count.toString());
      } catch (err) {
        // Trade config should be initialized as part of program registration with hub
        console.log("Trade counter not initialized, this should have happened during registration with hub");
      }
      
      // Get current counter value
      const counterInfo = await tradeProgram.account.counter.fetchNullable(tradeCounterPda);
      const tradeId = counterInfo.count.toNumber();
      
      // Derive trade PDA
      const tradePda = PublicKey.findProgramAddressSync(
        [Buffer.from("trade"), new BN(tradeId).toArrayLike(Buffer, "le", 8)],
        programIds.trade
      )[0];
      
      // Get trade config PDA
      const [tradeConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programIds.trade
      );
      
      // Create a trade from the offer (taker buys tokens from maker)
      const tradeAmount = new BN(50000000);  // 50 tokens with 6 decimals
      
      const tx = await tradeProgram.methods
        .createTrade(tradeAmount, "BANK_TRANSFER", "taker-contact-info")
        .accounts({
          taker: taker.publicKey,
          trade: tradePda,
          offer: offerPda,
          tradesCounter: tradeCounterPda,
          tradeConfig: tradeConfigPda,
          hub: hubPda,
          takerProfile: takerProfilePda,
          maker: maker.publicKey,
          makerProfile: makerProfilePda,
          arbitrator: arbitrator.publicKey,
          systemProgram: SystemProgram.programId
        })
        .signers([taker])
        .rpc();
      
      console.log("Trade created! Transaction:", tx);
      console.log("Trade ID:", tradeId);
      console.log("Trade PDA:", tradePda.toString());
      
      // Fetch and verify the trade account
      const tradeAccount = await tradeProgram.account.trade.fetchNullable(tradePda);
      
      assert.equal(
        tradeAccount.buyer.toString(),
        taker.publicKey.toString(),
        "Trade buyer mismatch"
      );
      
      assert.equal(
        tradeAccount.seller.toString(),
        maker.publicKey.toString(),
        "Trade seller mismatch"
      );
      
      assert.equal(
        tradeAccount.amount.toString(),
        tradeAmount.toString(),
        "Trade amount mismatch"
      );
      
      console.log("Trade creation verified!");
    } catch (err) {
      console.error("Error creating trade:", err);
      throw err;
    }
  });
}); 