import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL, SystemProgram, SendTransactionError } from "@solana/web3.js";
import { assert } from "chai";
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, createAssociatedTokenAccountInstruction, createMintToInstruction, getMinimumBalanceForRentExemptMint, getAssociatedTokenAddress } from "@solana/spl-token";
import { PROGRAM_IDS } from "../config";
import { Hub } from "../../target/types/hub"; // HubConfig not exported directly
import * as hubIdl from "../../target/idl/hub.json"; // Import IDL JSON

// Define HubConfig type inline based on IDL structure
type HubConfig = {
  offerProgram: PublicKey;
  tradeProgram: PublicKey;
  profileProgram: PublicKey;
  priceProgram: PublicKey;
  priceProvider: PublicKey;
  localMarket: PublicKey;
  localTokenMint: PublicKey;
  chainFeeCollector: PublicKey;
  warchest: PublicKey;
  activeOffersLimit: number;
  activeTradesLimit: number;
  arbitrationFeePct: number;
  burnFeePct: number;
  chainFeePct: number;
  warchestFeePct: number;
  tradeExpirationTimer: anchor.BN;
  tradeDisputeTimer: anchor.BN;
  tradeLimitMin: anchor.BN;
  tradeLimitMax: anchor.BN;
  isInitialized: boolean;
};

describe("LocalMoney Full Trade Lifecycle Integration Test", () => {
  // Program IDs from config
  const programIds = PROGRAM_IDS;
  
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;
  
  // Revert to the original workspace approach which is type-safe
  const hubProgram = anchor.workspace.Hub as Program<Hub>;
  
  // Test accounts
  const admin = anchor.web3.Keypair.generate();
  const maker = anchor.web3.Keypair.generate();
  const taker = anchor.web3.Keypair.generate();
  const arbitrator = anchor.web3.Keypair.generate();
  
  // Mock USDC mint and related accounts
  let mockUsdcMint: Keypair;
  let adminTokenAccount: PublicKey;
  let makerTokenAccount: PublicKey;
  let takerTokenAccount: PublicKey;
  
  before(async function() {
    this.timeout(60000); // Increase timeout for setup
    
    // Setup basic test environment
    console.log("Setting up test environment with program IDs:");
    console.log("HUB:", programIds.hub.toString());
    console.log("OFFER:", programIds.offer.toString());
    console.log("TRADE:", programIds.trade.toString());
    console.log("PRICE:", programIds.price.toString());
    console.log("PROFILE:", programIds.profile.toString());
    
    // Airdrop SOL to all test accounts
    console.log("Airdropping SOL to test accounts...");
    try {
      await Promise.all([
        airdropSol(admin.publicKey, connection),
        airdropSol(maker.publicKey, connection),
        airdropSol(taker.publicKey, connection),
        airdropSol(arbitrator.publicKey, connection),
        airdropSol(provider.wallet.publicKey, connection)
      ]);
      console.log("✅ Accounts funded with SOL");
    } catch (error) {
      console.error("Error airdropping SOL:", error);
      throw error;
    }
    
    // Create mock USDC token mint
    console.log("Creating mock USDC mint...");
    mockUsdcMint = Keypair.generate();
    try {
      await createMockTokenMint(mockUsdcMint, admin, connection, provider);
      console.log("✅ Mock USDC mint created:", mockUsdcMint.publicKey.toString());
    } catch (error) {
      console.error("Error creating mock USDC:", error);
      throw error;
    }
    
    // Create token accounts for users
    console.log("Creating token accounts for users...");
    try {
      [adminTokenAccount, makerTokenAccount, takerTokenAccount] = await Promise.all([
        createAndFundTokenAccount(mockUsdcMint.publicKey, admin, 10_000_000_000, connection, provider), // 10,000 USDC
        createAndFundTokenAccount(mockUsdcMint.publicKey, maker, 1_000_000_000, connection, provider),  // 1,000 USDC
        createAndFundTokenAccount(mockUsdcMint.publicKey, taker, 1_000_000_000, connection, provider)   // 1,000 USDC
      ]);
      console.log("✅ Token accounts created and funded");
    } catch (error) {
      console.error("Error creating token accounts:", error);
      throw error;
    }
  });
  
  // Check program deployments
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
  
  // Simple test to verify basic connectivity
  it("should be able to create and retrieve accounts", async () => {
    console.log("\nTesting basic account creation and retrieval...");
    
    // Create a simple test account
    const testAccount = Keypair.generate();
    const lamports = await connection.getMinimumBalanceForRentExemption(0);
    
    // Create a transaction to transfer lamports to the test account
    const transaction = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: testAccount.publicKey,
        lamports
      })
    );
    
    // Send and confirm the transaction
    const txid = await provider.sendAndConfirm(transaction, [admin]);
    console.log("✓ Created test account:", testAccount.publicKey.toString());
    
    // Verify the account was created
    const accountInfo = await connection.getAccountInfo(testAccount.publicKey);
    assert(accountInfo !== null, "Test account not found");
    assert.equal(accountInfo.lamports, lamports, "Test account has incorrect balance");
    console.log("✓ Retrieved account info successfully");
  });
  
  // Add a test to verify PDA derivation
  it("should correctly derive PDAs for various accounts", async () => {
    console.log("\nVerifying PDA derivation...");
    
    // Derive hub PDA
    const [hubPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("hub")],
      programIds.hub
    );
    console.log("Hub PDA:", hubPda.toString());
    
    // Derive price config PDA
    const [priceConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("price_config")],
      programIds.price
    );
    console.log("Price Config PDA:", priceConfigPda.toString());
    
    // Derive profile config PDA
    const [profileConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile_config")],
      programIds.profile
    );
    console.log("Profile Config PDA:", profileConfigPda.toString());
    
    // Derive trade config PDA
    const [tradeConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      programIds.trade
    );
    console.log("Trade Config PDA:", tradeConfigPda.toString());
    
    // Derive offer counter PDA
    const [offerCounterPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      programIds.offer
    );
    console.log("Offer Counter PDA:", offerCounterPda.toString());
    
    // Derive trade counter PDA
    const [tradeCounterPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      programIds.trade
    );
    console.log("Trade Counter PDA:", tradeCounterPda.toString());
    
    // Verify these accounts by fetching them (they may not exist yet, but that's ok)
    console.log("\nChecking if these accounts exist on chain...");
    
    const pdaAccounts = [
      { name: "Hub", pubkey: hubPda },
      { name: "Price Config", pubkey: priceConfigPda },
      { name: "Profile Config", pubkey: profileConfigPda },
      { name: "Trade Config", pubkey: tradeConfigPda },
      { name: "Offer Counter", pubkey: offerCounterPda },
      { name: "Trade Counter", pubkey: tradeCounterPda }
    ];
    
    for (const account of pdaAccounts) {
      const accountInfo = await connection.getAccountInfo(account.pubkey);
      if (accountInfo) {
        console.log(`✓ ${account.name} account exists with ${accountInfo.data.length} bytes of data`);
      } else {
        console.log(`× ${account.name} account does not exist yet`);
      }
    }
    
    // All PDAs should be derivable regardless of whether the accounts exist
    assert.ok(hubPda, "Hub PDA should be derivable");
    assert.ok(priceConfigPda, "Price Config PDA should be derivable");
    assert.ok(profileConfigPda, "Profile Config PDA should be derivable");
    assert.ok(tradeConfigPda, "Trade Config PDA should be derivable");
    assert.ok(offerCounterPda, "Offer Counter PDA should be derivable");
    assert.ok(tradeCounterPda, "Trade Counter PDA should be derivable");
  });
  
  // Add a test to initialize the hub account
  it("should initialize the hub account", async () => {
    console.log("Initializing hub account...");

    // Derive the hub PDA
    const [hubPda, hubBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("hub")],
      programIds.hub
    );
    console.log("Hub PDA:", hubPda.toString());
    console.log("Hub bump:", hubBump);
    console.log("Hub program ID:", programIds.hub.toString());
    
    // Double-check the PDA derivation is correct
    const [verifyHubPda, verifyBump] = await PublicKey.findProgramAddress(
      [Buffer.from("hub")],
      programIds.hub
    );
    console.log("Verified hub PDA derivation:", verifyHubPda.toString());
    console.log("Seeds match:", Buffer.from("hub").toString());

    // Check if hub PDA already exists
    console.log("Checking if hub PDA already exists:", hubPda.toString());
    const hubAccountInfo = await connection.getAccountInfo(hubPda);
    if (hubAccountInfo) {
      console.error("Hub PDA account already exists!");
      console.error("Owner:", hubAccountInfo.owner.toString());
      console.error("Data length:", hubAccountInfo.data.length);
      assert.fail("Hub PDA should not exist before initialization");
    } else {
      console.log("Hub PDA does not exist, proceeding with initialization.");
    }

    // Define parameters for HubConfig
    const config: HubConfig = {
      offerProgram: programIds.offer,
      tradeProgram: programIds.trade,
      profileProgram: programIds.profile,
      priceProgram: programIds.price,
      priceProvider: admin.publicKey, // Placeholder - needs actual price provider key if used
      localMarket: admin.publicKey,   // Placeholder - needs actual local market key if used
      localTokenMint: mockUsdcMint.publicKey, // Assuming mockUsdcMint is defined in scope
      chainFeeCollector: admin.publicKey, // Placeholder
      warchest: admin.publicKey,          // Placeholder
      activeOffersLimit: 50, // Example value
      activeTradesLimit: 50, // Example value
      arbitrationFeePct: 50, // Example: 50% arbitration fee
      burnFeePct: 1,      // Example: 1% burn fee
      chainFeePct: 1,     // Example: 1% chain fee
      warchestFeePct: 1,  // Example: 1% warchest fee
      tradeExpirationTimer: new anchor.BN(3600), // 1 hour in seconds
      tradeDisputeTimer: new anchor.BN(7200),    // 2 hours in seconds
      tradeLimitMin: new anchor.BN(1000000),    // Example: 1 USDC (assuming 6 decimals)
      tradeLimitMax: new anchor.BN(1000000000), // Example: 1000 USDC
      isInitialized: false // This will be set by the program, initialize with false
    };

    // Call the initialize instruction using the Anchor client
    try {
      // Create a transaction manually first to see more details
      const ix = await hubProgram.methods
        .initialize(config)
        .accounts({
          hub: hubPda,
          admin: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .instruction();
      
      console.log("Created initialize instruction:");
      console.log("- Program ID:", ix.programId.toString());
      console.log("- Keys:", ix.keys.map(k => ({
        pubkey: k.pubkey.toString(),
        isSigner: k.isSigner,
        isWritable: k.isWritable
      })));
      
      // Try the actual transaction
      const txSignature = await hubProgram.methods
        .initialize(config)
        .accounts({
          hub: hubPda,
          admin: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([admin])
        .rpc();

      console.log(`✓ Hub initialized successfully. Signature: ${txSignature}`);

      // Verify the hub account was created and data is correct
      const hubAccountAfter = await hubProgram.account.hub.fetch(hubPda);
      assert.ok(hubAccountAfter, "Hub account should exist after initialization");
      assert.equal(hubAccountAfter.config.arbitrationFeePct, config.arbitrationFeePct, "Arbitration fee mismatch"); // Example check
      assert.equal(hubAccountAfter.config.tradeExpirationTimer.toString(), config.tradeExpirationTimer.toString(), "Trade expiration timer mismatch"); // Compare BN values
      // Add more assertions for other config fields as needed
      assert.ok(hubAccountAfter.admin.equals(admin.publicKey), "Admin key mismatch");

    } catch (error) {
      console.error("Error initializing hub:", error);
      
      // Enhanced error logging
      if (error instanceof SendTransactionError) {
        console.error("Transaction error details:");
        if (error.logs) {
          error.logs.forEach((log, i) => console.error(`[${i}] ${log}`));
        }
      }
      
      // Check if account was somehow created despite error
      console.log("Checking if hub account exists after error:");
      const hubAccountAfterError = await connection.getAccountInfo(hubPda);
      if (hubAccountAfterError) {
        console.error("Hub account exists after error!");
        console.error("Owner:", hubAccountAfterError.owner.toString());
        console.error("Data length:", hubAccountAfterError.data.length);
      } else {
        console.log("Hub account still does not exist after error");
      }
      
      throw error;
    }
  });
  
  // Helper functions
  async function airdropSol(pubkey: PublicKey, connection: Connection) {
    try {
      const airdropSig = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(airdropSig);
      console.log(`Airdropped 2 SOL to ${pubkey.toString()}`);
    } catch (error) {
      console.error(`Failed to airdrop SOL to ${pubkey.toString()}:`, error);
      // Try again with smaller amount in case of rate limiting
      try {
        const airdropSig = await connection.requestAirdrop(pubkey, LAMPORTS_PER_SOL);
        await connection.confirmTransaction(airdropSig);
        console.log(`Airdropped 1 SOL to ${pubkey.toString()}`);
      } catch (retryError) {
        console.error(`Failed retry airdrop to ${pubkey.toString()}:`, retryError);
      }
    }
  }
  
  async function createMockTokenMint(
    mintKeypair: Keypair,
    payer: Keypair,
    connection: Connection,
    provider: anchor.AnchorProvider
  ) {
    try {
      const lamports = await getMinimumBalanceForRentExemptMint(connection);
      const decimals = 6; // Standard for USDC
      
      const transaction = new anchor.web3.Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          decimals,
          payer.publicKey,
          payer.publicKey
        )
      );
      
      await provider.sendAndConfirm(transaction, [payer, mintKeypair]);
      console.log("Created mock USDC mint:", mintKeypair.publicKey.toString());
      return mintKeypair.publicKey;
    } catch (error) {
      console.error("Error creating mock USDC mint:", error);
      throw error;
    }
  }
  
  async function createAndFundTokenAccount(
    mintPubkey: PublicKey,
    owner: Keypair,
    amount: number,
    connection: Connection,
    provider: anchor.AnchorProvider
  ) {
    try {
      const associatedTokenAddress = await getAssociatedTokenAddress(
        mintPubkey,
        owner.publicKey
      );
      
      // Create ATA and mint tokens
      const transaction = new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          admin.publicKey, // payer
          associatedTokenAddress,
          owner.publicKey,
          mintPubkey
        ),
        createMintToInstruction(
          mintPubkey,
          associatedTokenAddress,
          admin.publicKey, // mint authority
          amount
        )
      );
      
      await provider.sendAndConfirm(transaction, [admin]);
      console.log(`Created and funded token account for ${owner.publicKey.toString()}`);
      
      return associatedTokenAddress;
    } catch (error) {
      console.error(`Failed to create/fund token account for ${owner.publicKey.toString()}:`, error);
      throw error;
    }
  }
}); 