import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from 'fs';
import * as path from 'path';
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction } from "@solana/spl-token";
import * as borsh from 'borsh';

describe("LocalMoney Workflow Test", () => {
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    offer: new PublicKey("GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn"),
    price: new PublicKey("51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
    trade: new PublicKey("kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB")
  };
  
  // Test accounts
  const admin = Keypair.generate();
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  const arbitrator = Keypair.generate();
  
  // Program-related accounts
  let hubPda: PublicKey;
  let hubBump: number;
  let priceConfigPda: PublicKey;
  let profileConfigPda: PublicKey;
  let tradeConfigPda: PublicKey;
  
  // User profiles
  let makerProfilePda: PublicKey;
  let takerProfilePda: PublicKey;
  let arbitratorProfilePda: PublicKey;
  
  // Offer and trade accounts
  let offerCounterPda: PublicKey;
  let offerPda: PublicKey;
  let tradePda: PublicKey;
  let tradeCounterPda: PublicKey;
  
  // Mock USDC mint and related accounts
  let mockUsdcMint: Keypair;
  let adminTokenAccount: PublicKey;
  let makerTokenAccount: PublicKey;
  let takerTokenAccount: PublicKey;
  
  // Connection and provider
  let connection: Connection;
  let provider: anchor.AnchorProvider;
  
  // Program clients
  let hubProgram: anchor.Program<any>;
  let offerProgram: anchor.Program<any>;
  let priceProgram: anchor.Program<any>;
  let profileProgram: anchor.Program<any>;
  let tradeProgram: anchor.Program<any>;
  
  before(async () => {
    // Setup connection to local validator
    connection = new Connection("http://localhost:8899", "confirmed");
    const wallet = new anchor.Wallet(admin);
    provider = new anchor.AnchorProvider(
      connection,
      wallet,
      { commitment: "confirmed" }
    );
    anchor.setProvider(provider);
    
    // Calculate various PDAs
    [hubPda, hubBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("hub")],
      programIds.hub
    );
    
    [priceConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("price_config")],
      programIds.price
    );
    
    [profileConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile_config")],
      programIds.profile
    );
    
    [tradeConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      programIds.trade
    );
    
    [tradeCounterPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      programIds.trade
    );
    
    // Generate a new keypair for mock USDC
    mockUsdcMint = Keypair.generate();
    
    // Load program IDLs directly from files
    console.log("Loading program IDLs...");
    
    const loadIDL = (name: string) => {
      try {
        // Try regular name first
        const filePath = path.join(__dirname, '../../target/idl/', `${name}.json`);
        if (fs.existsSync(filePath)) {
          return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        
        // Try with localmoney_ prefix
        const prefixedPath = path.join(__dirname, '../../target/idl/', `localmoney_${name}.json`);
        if (fs.existsSync(prefixedPath)) {
          return JSON.parse(fs.readFileSync(prefixedPath, 'utf8'));
        }
        
        throw new Error(`IDL file for ${name} not found`);
      } catch (error) {
        console.error(`Error loading IDL for ${name}:`, error);
        throw error;
      }
    };
    
    const hubIdl = loadIDL('hub');
    const offerIdl = loadIDL('offer');
    const priceIdl = loadIDL('price');
    const profileIdl = loadIDL('profile');
    const tradeIdl = loadIDL('trade');
    
    // Create program interfaces
    hubProgram = new anchor.Program(hubIdl, programIds.hub, provider);
    offerProgram = new anchor.Program(offerIdl, programIds.offer, provider);
    priceProgram = new anchor.Program(priceIdl, programIds.price, provider);
    profileProgram = new anchor.Program(profileIdl, programIds.profile, provider);
    tradeProgram = new anchor.Program(tradeIdl, programIds.trade, provider);
    
    console.log("Programs loaded successfully");
    
    // Airdrop SOL to all test accounts
    await Promise.all([
      airdropSol(connection, admin.publicKey),
      airdropSol(connection, maker.publicKey),
      airdropSol(connection, taker.publicKey),
      airdropSol(connection, arbitrator.publicKey)
    ]);
    
    // Create mock USDC token mint
    await createMockTokenMint();
    
    // Create token accounts for users
    await Promise.all([
      createAndFundTokenAccount(mockUsdcMint.publicKey, admin, 10_000_000_000), // 10,000 USDC
      createAndFundTokenAccount(mockUsdcMint.publicKey, maker, 1_000_000_000),  // 1,000 USDC
      createAndFundTokenAccount(mockUsdcMint.publicKey, taker, 1_000_000_000)   // 1,000 USDC
    ]);
  });
  
  // 1. Check program deployments
  it("should verify programs are deployed with correct IDs", async () => {
    console.log("\nVerifying program deployments...");
    
    // For each program ID, check that an account exists on chain
    for (const [name, pubkey] of Object.entries(programIds)) {
      const programInfo = await connection.getAccountInfo(pubkey);
      assert(programInfo !== null, `Program ${name} not found at ${pubkey.toString()}`);
      assert(programInfo.executable, `Program ${name} is not executable`);
      console.log(`✓ ${name} program found at ${pubkey.toString()}`);
    }
  });
  
  // 2. Initialize Hub
  it("should initialize the Hub program", async () => {
    console.log("\nInitializing Hub program...");
    
    const chainFeeCollector = Keypair.generate().publicKey;
    const warchest = Keypair.generate().publicKey;
    
    // Define initial hub configuration
    const initialHubConfig = {
      offerProgram: programIds.offer,
      tradeProgram: programIds.trade,
      profileProgram: programIds.profile,
      priceProgram: programIds.price,
      priceProvider: admin.publicKey,
      localMarket: PublicKey.default,
      localTokenMint: mockUsdcMint.publicKey,
      chainFeeCollector: chainFeeCollector,
      warchest: warchest,
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
      await hubProgram.methods
        .initialize(initialHubConfig)
        .accounts({
          hub: hubPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      
      console.log("Hub initialized successfully at:", hubPda.toString());
      
      // Verify hub account data
      const hubAccount = await hubProgram.account.hub.fetch(hubPda);
      assert.equal(
        hubAccount.admin.toString(),
        admin.publicKey.toString(),
        "Admin pubkey mismatch"
      );
    } catch (err) {
      // Check if the hub is already initialized - this would be normal if running tests multiple times
      if (err.toString().includes("already in use")) {
        console.log("Hub account already initialized. Proceeding with the existing hub.");
      } else {
        console.error("Error initializing hub:", err);
        throw err;
      }
    }
  });
  
  // 3. Initialize Profile Program
  it("should initialize the Profile program", async () => {
    console.log("\nInitializing Profile program...");
    
    try {
      // Check for an existing profile config account
      const profileConfigInfo = await connection.getAccountInfo(profileConfigPda);
      
      if (!profileConfigInfo) {
        // Initialize profile program if it doesn't exist
        await profileProgram.methods
          .initialize()
          .accounts({
            authority: admin.publicKey,
            hubAuthority: hubPda,
            profileConfig: profileConfigPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        
        console.log("Profile program initialized successfully");
        
        // Register with hub
        await profileProgram.methods
          .registerHub()
          .accounts({
            authority: admin.publicKey,
            hubAuthority: hubPda,
            profileConfig: profileConfigPda,
          })
          .signers([admin])
          .rpc();
        
        console.log("Profile program registered with hub");
      } else {
        console.log("Profile program already initialized");
      }
    } catch (err) {
      console.error("Error initializing Profile program:", err);
      throw err;
    }
  });
  
  // 4. Create User Profiles
  it("should create profiles for maker, taker, and arbitrator", async () => {
    console.log("\nCreating user profiles...");
    
    // Calculate profile PDAs
    [makerProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), maker.publicKey.toBuffer()],
      programIds.profile
    );
    
    [takerProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), taker.publicKey.toBuffer()],
      programIds.profile
    );
    
    [arbitratorProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), arbitrator.publicKey.toBuffer()],
      programIds.profile
    );
    
    console.log("Maker profile PDA:", makerProfilePda.toString());
    console.log("Taker profile PDA:", takerProfilePda.toString());
    console.log("Arbitrator profile PDA:", arbitratorProfilePda.toString());
    
    try {
      // Create maker profile
      await createProfile(
        maker, 
        makerProfilePda, 
        "maker@example.com", 
        "maker-encryption-key"
      );
      
      // Create taker profile
      await createProfile(
        taker,
        takerProfilePda,
        "taker@example.com",
        "taker-encryption-key"
      );
      
      // Create arbitrator profile
      await createProfile(
        arbitrator,
        arbitratorProfilePda,
        "arbitrator@example.com",
        "arbitrator-encryption-key"
      );
      
    } catch (err) {
      console.error("Error creating profiles:", err);
      throw err;
    }
  });
  
  // 5. Initialize offer counter
  it("should initialize the offer counter for maker", async () => {
    console.log("\nInitializing offer counter...");
    
    // Calculate offer counter PDA
    [offerCounterPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("offer_counter"), maker.publicKey.toBuffer()],
      programIds.offer
    );
    
    console.log("Offer counter PDA:", offerCounterPda.toString());
    
    try {
      // Check if counter already exists
      try {
        const counterInfo = await connection.getAccountInfo(offerCounterPda);
        if (counterInfo) {
          console.log("Offer counter already initialized");
          return;
        }
      } catch (error) {
        // Counter doesn't exist, continue with initialization
      }
      
      // Initialize offer counter for maker
      await offerProgram.methods
        .initialize()
        .accounts({
          owner: maker.publicKey,
          offerCounter: offerCounterPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();
      
      console.log("Offer counter initialized successfully");
      
    } catch (err) {
      console.error("Error initializing offer counter:", err);
      throw err;
    }
  });
  
  // 6. Create Offer
  it("should create a sell offer from maker", async () => {
    console.log("\nCreating sell offer...");
    
    try {
      // Get the current counter value to calculate the offer PDA
      const counterAccount = await offerProgram.account.offerCounter.fetch(offerCounterPda);
      const nextOfferId = counterAccount.count;
      
      // Calculate the offer PDA
      [offerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("offer"), maker.publicKey.toBuffer(), new anchor.BN(nextOfferId).toArrayLike(Buffer, 'le', 8)],
        programIds.offer
      );
      
      console.log("Offer PDA will be:", offerPda.toString());
      
      // Define payment methods 
      const paymentMethods = [
        { name: "Bank Transfer", description: "Transfer to my bank account" },
      ];
      
      // Create the offer
      await offerProgram.methods
        .createOffer(
          { sell: {} }, // Direction enum
          "USD", // Fiat currency
          paymentMethods,
          new anchor.BN(10 * 100), // Min amount $10 (in cents)
          new anchor.BN(100 * 100), // Max amount $100 (in cents)
          5, // Price premium (5%)
          "Selling USDC for USD bank transfer" // Description
        )
        .accounts({
          owner: maker.publicKey,
          hub: hubPda,
          tokenMint: mockUsdcMint.publicKey,
          offerCounter: offerCounterPda,
          offer: offerPda,
          profile: makerProfilePda,
          hubProgram: programIds.hub,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();
      
      console.log("Created sell offer at:", offerPda.toString());
      
      // Verify offer was created
      const offerInfo = await connection.getAccountInfo(offerPda);
      assert(offerInfo !== null, "Offer account not found on chain");
      console.log("Offer verified on chain");
      
    } catch (err) {
      console.error("Error creating offer:", err);
      throw err;
    }
  });
  
  // Helper functions
  async function airdropSol(connection: Connection, pubkey: PublicKey) {
    try {
      const signature = await connection.requestAirdrop(pubkey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(signature);
      console.log(`Airdropped 10 SOL to ${pubkey.toString()}`);
    } catch (error) {
      console.error(`Error airdropping to ${pubkey.toString()}:`, error);
    }
  }
  
  async function createMockTokenMint() {
    console.log("\nCreating mock USDC token mint...");
    
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
    
    await provider.sendAndConfirm(transaction, [admin, mockUsdcMint]);
    console.log("Mock USDC mint created:", mockUsdcMint.publicKey.toString());
  }
  
  async function createAndFundTokenAccount(
    mintPubkey: PublicKey,
    owner: Keypair,
    amount: number
  ) {
    // Get or create associated token account
    const tokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      owner.publicKey
    );
    
    try {
      // Check if the token account already exists
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      
      if (!tokenAccountInfo) {
        // Create the token account if it doesn't exist
        const tx = new anchor.web3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            admin.publicKey,
            tokenAccount,
            owner.publicKey,
            mintPubkey
          )
        );
        
        await provider.sendAndConfirm(tx, [admin]);
      }
      
      // Mint tokens to the account
      const mintTx = new anchor.web3.Transaction().add(
        createMintToInstruction(
          mintPubkey,
          tokenAccount,
          admin.publicKey,
          amount
        )
      );
      
      await provider.sendAndConfirm(mintTx, [admin]);
      console.log(`Funded ${amount / 1_000_000} USDC to ${owner.publicKey.toString()}`);
      
      // Save reference to the token account
      if (owner.publicKey.equals(admin.publicKey)) {
        adminTokenAccount = tokenAccount;
      } else if (owner.publicKey.equals(maker.publicKey)) {
        makerTokenAccount = tokenAccount;
      } else if (owner.publicKey.equals(taker.publicKey)) {
        takerTokenAccount = tokenAccount;
      }
      
      return tokenAccount;
    } catch (error) {
      console.error("Error creating token account:", error);
      throw error;
    }
  }
  
  async function createProfile(
    user: Keypair,
    profilePda: PublicKey,
    contactInfo: string,
    encryptionKey: string
  ) {
    try {
      // Check if profile already exists
      const profileInfo = await connection.getAccountInfo(profilePda);
      if (profileInfo) {
        console.log(`Profile for ${user.publicKey.toString()} already exists`);
        return;
      }
      
      // Create the profile using updateContact method
      await profileProgram.methods
        .updateContact({
          contact: contactInfo,
          encryptionKey: encryptionKey
        })
        .accounts({
          authority: user.publicKey,
          hubConfig: hubPda,
          profile: profilePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      
      console.log(`Created profile for ${user.publicKey.toString()}`);
    } catch (error) {
      console.error(`Error creating profile for ${user.publicKey.toString()}:`, error);
      throw error;
    }
  }
}); 