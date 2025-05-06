import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert, expect } from "chai";
import { LocalmoneyHub } from "../target/types/localmoney_hub";
import { LocalmoneyOffer } from "../target/types/localmoney_offer";
import { LocalmoneyProfile } from "../target/types/localmoney_profile";
// Assuming Price program might be needed for some setups, though not directly tested here.
// import { Price } from "../target/types/price";

// Helper to convert string to Buffer for PDA seeds
const toBuffer = (arr: Uint8Array) => Buffer.from(arr);

describe("Offer and Profile Integration Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const hubProgram = anchor.workspace.LocalmoneyHub as Program<LocalmoneyHub>;
  const offerProgram = anchor.workspace.LocalmoneyOffer as Program<LocalmoneyOffer>;
  const profileProgram = anchor.workspace.LocalmoneyProfile as Program<LocalmoneyProfile>;
  // const priceProgram = anchor.workspace.Price as Program<Price>; // If needed

  // Use provider.wallet as the consistent admin
  const adminPublicKey = provider.wallet.publicKey;
  // User keypairs remain specific to this test suite
  const userA = anchor.web3.Keypair.generate();
  const userB = anchor.web3.Keypair.generate();
  // Mocks can still be generated
  const mockPriceProvider = anchor.web3.Keypair.generate();
  const mockChainFeeCollector = anchor.web3.Keypair.generate();
  const mockWarchest = anchor.web3.Keypair.generate();
  const mockTradeProgram = anchor.web3.Keypair.generate(); // For simulating calls to Profile

  // PDAs
  let hubConfigPda: anchor.web3.PublicKey;
  let offerConfigPda: anchor.web3.PublicKey;
  let profileConfigPda: anchor.web3.PublicKey; // Added declaration
  let userAProfilePda: anchor.web3.PublicKey; // Declare here
  let userACreatedOfferId: anchor.BN; // To store the ID of the offer created by User A
  let userACreatedOfferPda: anchor.web3.PublicKey; // To store the PDA of the offer created by User A

  // Offer State Enum (mirror from Rust)
  enum OfferState {
    Active = 0,
    Paused = 1,
    Archive = 2,
  }

  // Trade State Enum (mirror from Rust - simplified for Profile interaction)
  enum TradeStateForProfile {
    RequestCreated = 0,
    RequestAccepted = 1,
    EscrowFunded = 2,
    FiatDeposited = 3,
    EscrowReleased = 4,
    SettledForMaker = 5,
    SettledForTaker = 6,
    EscrowRefunded = 7,
    RequestCanceled = 8,
    EscrowDisputed = 9,
  }


  before(async () => {
    console.log("Starting before all hook...");
    // Airdrop SOL to accounts - No need to airdrop adminPublicKey (provider.wallet)
    try {
      // Fund user accounts and mocks
      const userAAirdropSignature = await provider.connection.requestAirdrop(userA.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(userAAirdropSignature, "confirmed");
      const userBAirdropSignature = await provider.connection.requestAirdrop(userB.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(userBAirdropSignature, "confirmed");
      const mockTradeProgramAirdropSignature = await provider.connection.requestAirdrop(mockTradeProgram.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(mockTradeProgramAirdropSignature, "confirmed");
      console.log("Airdrops confirmed.");
    } catch (e) { console.error("Airdrop failed:", e); throw e; }

    // Derive userAProfilePda
    try {
      console.log(`User A PublicKey for PDA derivation in test: ${userA.publicKey.toBase58()}`);
      [userAProfilePda] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("profile"), userA.publicKey.toBuffer()],
        profileProgram.programId
      );
      console.log("User A Profile PDA derived:", userAProfilePda.toBase58());
    } catch (e) { console.error("User A Profile PDA derivation failed:", e); throw e; }

    // Derive HubConfig PDA
    try {
      [hubConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("hub")],
        hubProgram.programId
      );
      console.log("HubConfig PDA derived:", hubConfigPda.toBase58());
    } catch (e) { console.error("HubConfig PDA derivation failed:", e); throw e; }
    
    // Initialize Hub (conditionally)
    try {
      console.log("Checking Hub initialization status for HubConfig PDA:", hubConfigPda.toBase58());
      try {
        const existingHubConfig = await hubProgram.account.hubConfig.fetch(hubConfigPda);
        if (existingHubConfig && existingHubConfig.admin) { 
          console.log("Hub already initialized. Current admin:", existingHubConfig.admin.toBase58());
          // Ensure the current admin is provider.wallet (important if hub.ts didn't reset it)
          if (existingHubConfig.admin.toBase58() !== adminPublicKey.toBase58()) {
             console.warn("Hub admin does not match provider wallet! Hub tests might not have reset admin.");
             // Depending on requirements, might need to handle this (e.g., skip tests, try to update admin)
             // For now, we assume hub.ts left provider.wallet as admin.
          }
        } else {
          throw new Error("Hub account found but seems uninitialized, attempting re-initialization.");
        }
      } catch (e) { 
        console.log("Hub not initialized or fetch failed (", e.message, "), proceeding with initialization...");
        await hubProgram.methods
          .initialize(adminPublicKey) // Pass admin pubkey as argument
          .accounts({
            hubConfig: hubConfigPda,
            payer: adminPublicKey, // Use provider.wallet as payer
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          // No signers needed, provider.wallet signs implicitly
          .rpc();
        console.log("Hub initialized successfully by offer_profile.test.ts.");
      }
    } catch (e) { 
      console.error("Hub initialization process failed overall:", e); 
      throw e; 
    }

    const hubConfigData = { // These are just data arguments now
      offerAddr: offerProgram.programId,
      tradeAddr: mockTradeProgram.publicKey,
      profileAddr: profileProgram.programId,
      priceAddr: anchor.web3.Keypair.generate().publicKey,
      localMarketAddr: anchor.web3.Keypair.generate().publicKey,
      localDenom: "SOL",
      chainFeeCollectorAddr: mockChainFeeCollector.publicKey,
      warchestAddr: mockWarchest.publicKey,
      activeOffersLimit: 5,
      activeTradesLimit: 5,
      arbitrationFeePct: { val: 100, precision: 4 }, // Match struct if Hub uses it
      burnFeePct: { val: 50, precision: 4 },
      chainFeePct: { val: 50, precision: 4 },
      warchestFeePct: { val: 50, precision: 4 },
      tradeExpirationTimer: new anchor.BN(3600 * 24),
      tradeDisputeTimer: new anchor.BN(3600 * 12),
      tradeLimitMin: new anchor.BN(10),
      tradeLimitMax: new anchor.BN(1000),
    };
    const priceProviderDummy = anchor.web3.Keypair.generate().publicKey; // Generate dummy Price Provider PK

    try {
      console.log("Updating Hub config...");
      await hubProgram.methods
        .updateConfig( // Pass individual args
          hubConfigData.offerAddr,
          hubConfigData.tradeAddr,
          hubConfigData.profileAddr,
          hubConfigData.priceAddr,
          priceProviderDummy,
          hubConfigData.localMarketAddr,
          hubConfigData.localDenom,
          hubConfigData.chainFeeCollectorAddr,
          hubConfigData.warchestAddr,
          hubConfigData.activeOffersLimit,
          hubConfigData.activeTradesLimit,
          hubConfigData.arbitrationFeePct.val,
          hubConfigData.burnFeePct.val,
          hubConfigData.chainFeePct.val,
          hubConfigData.warchestFeePct.val,
          hubConfigData.tradeExpirationTimer,
          hubConfigData.tradeDisputeTimer,
          hubConfigData.tradeLimitMin,
          hubConfigData.tradeLimitMax
        )
        .accounts({
          hubConfig: hubConfigPda,
          admin: adminPublicKey, // Use provider.wallet as admin account
        })
        // No signers needed, provider.wallet signs implicitly
        .rpc();
      console.log("Hub config updated.");
    } catch (e) { console.error("Hub config update failed:", e); throw e; }
    
    // Derive OfferConfig PDA
    try {
      [offerConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("offer-config")],
          offerProgram.programId
      );
      console.log("OfferConfig PDA derived:", offerConfigPda.toBase58());
    } catch (e) { console.error("OfferConfig PDA derivation failed:", e); throw e; }

    // Initialize Offer Config (conditionally)
    try {
      console.log("Checking Offer Config initialization status...");
      try {
          const existingOfferConfig = await offerProgram.account.offerConfig.fetch(offerConfigPda);
          // Simpler check: If fetch succeeds, assume it's initialized.
          console.log("Offer Config already initialized.");
      } catch (e) { // Catches fetch errors (e.g., account not found)
          console.log("Offer Config not initialized or fetch failed (", e.message, "), proceeding with initialization...");
          await offerProgram.methods
              .initialize()
              .accounts({
                  offerConfig: offerConfigPda,
                  payer: adminPublicKey, // Use provider.wallet as payer
                  systemProgram: anchor.web3.SystemProgram.programId,
              })
              // No signers needed
              .rpc();
          console.log("Offer program config initialized by before hook.");
      }
    } catch (e) { console.error("Failed overall to initialize Offer program config:", e); throw e;}

    try {
      const offerConfigAccount = await offerProgram.account.offerConfig.fetch(offerConfigPda);
      if (!offerConfigAccount.isInitialized) {
        console.log("Registering Hub with Offer program...");
        await offerProgram.methods
          .registerHub(hubConfigPda) 
          .accounts({
            offerConfig: offerConfigPda, 
            authority: adminPublicKey, 
          })
          .rpc();
        console.log("Hub registered with Offer program.");
      } else {
        console.log("Offer program already registered with Hub.");
      }
    } catch (e) { console.error("Failed to register Hub with Offer program or fetch OfferConfig:", e); throw e; }

    // Derive ProfileConfig PDA
    try {
      [profileConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("profile-config")],
        profileProgram.programId
      );
      console.log("ProfileConfig PDA derived:", profileConfigPda.toBase58());
    } catch (e) { console.error("ProfileConfig PDA derivation failed:", e); throw e; }
    
    // Initialize Profile Config (conditionally)
    try {
      console.log("Checking Profile Config initialization status...");
      try {
          const existingProfileConfig = await profileProgram.account.profileConfig.fetch(profileConfigPda);
          // If fetch succeeded, assume it's initialized (or will be by registerHub)
          console.log("Profile Config account exists.");
      } catch (e) { // Catches fetch errors (e.g., account not found)
          console.log("Profile Config not found or fetch failed (", e.message, "), proceeding with initialization...");
          await profileProgram.methods
              .initialize()
              .accounts({
                  profileConfig: profileConfigPda,
                  payer: adminPublicKey, // Use provider.wallet as payer
                  systemProgram: anchor.web3.SystemProgram.programId,
              })
              // No signers needed
              .rpc();
          console.log("Profile program config initialized by before hook.");
      }
    } catch (e) { console.error("Failed overall to initialize Profile program config:", e); throw e; }

    try {
      const profileConfigAccount = await profileProgram.account.profileConfig.fetch(profileConfigPda);
      if (!profileConfigAccount.isInitialized) {
        console.log("Registering Hub with Profile program...");
        await profileProgram.methods
          .registerHub(hubConfigPda) 
          .accounts({
            profileConfig: profileConfigPda, 
            authority: adminPublicKey,  
          })
          .rpc();
        console.log("Hub registered with Profile program.");
      } else {
        console.log("Profile program already registered with Hub.");
      }
    } catch (e) { console.error("Failed to register Hub with Profile program or fetch ProfileConfig:", e); throw e; }
    console.log("Before all hook completed.");
  });

  it("User A creates an offer, profile is updated via CPI", async () => {
    console.log(`Test: userA.publicKey for PDA derivation = ${userA.publicKey.toBase58()}`);
    const userAProfilePda = (await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("profile"), userA.publicKey.toBuffer()],
      profileProgram.programId
    ))[0];

    // Fetch current offers_count to correctly derive the PDA for the new offer
    const currentOfferConfig = await offerProgram.account.offerConfig.fetch(offerConfigPda);
    const offerIdForUserA = currentOfferConfig.offersCount; // This is a BN, will be ID 0 initially
    userACreatedOfferId = offerIdForUserA; // Store for later tests

    const [offerPdaForCreate] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("offer"), offerIdForUserA.toBuffer("le", 8)], // Use BN.toBuffer()
      offerProgram.programId
    );
    userACreatedOfferPda = offerPdaForCreate; // Store for later tests
    console.log("Derived Offer PDA for create (User A):" + offerPdaForCreate.toBase58() + ", ID:", offerIdForUserA.toNumber());
    
    const offerData = {
      ownerContact: "userA_contact@example.com",
      ownerEncryptionKey: "userA_encryption_key",
      offerType: 0, // Buy = 0, Sell = 1 (example)
      fiatCurrency: "USD",
      rate: new anchor.BN(50000), 
      denom: "SOL",
      minAmount: new anchor.BN(100),
      maxAmount: new anchor.BN(1000),
      description: "Buying SOL with USD",
    };

    console.log("Calling create offer for user:", userA.publicKey.toBase58());
    await offerProgram.methods
      .create( // Corrected method name and pass individual arguments
        offerData.offerType,
        offerData.fiatCurrency,
        offerData.rate,
        offerData.denom,
        offerData.minAmount,
        offerData.maxAmount,
        offerData.description,
        offerData.ownerContact,
        offerData.ownerEncryptionKey
      )
      .accounts({
        owner: userA.publicKey,
        offerConfig: offerConfigPda,
        offer: offerPdaForCreate, // Use correctly derived PDA
        profileProgram: profileProgram.programId,
        userProfile: userAProfilePda,
        profileConfigAccount: profileConfigPda, 
        hubConfigAccount: hubConfigPda,         
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([userA])
      .rpc();

    // Call the new instruction to update profile via CPI
    console.log("Calling updateProfileAfterOfferCreation...");
    await offerProgram.methods
      .updateProfileAfterOfferCreation() // No args for the instruction itself
      .accounts({
        owner: userA.publicKey, // Signer
        offer: userACreatedOfferPda, // The offer PDA created above
        profileProgram: profileProgram.programId,
        userProfile: userAProfilePda,
        profileConfigAccount: profileConfigPda,
        hubConfigAccount: hubConfigPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([userA]) // User A must sign
      .rpc();
    console.log("updateProfileAfterOfferCreation successful.");

    // Verify Offer
    const createdOffer = await offerProgram.account.offer.fetch(userACreatedOfferPda); // Use stored PDA
    expect(createdOffer.owner.toString()).to.equal(userA.publicKey.toString());
    expect(createdOffer.ownerContact).to.equal(offerData.ownerContact);
    expect(createdOffer.fiatCurrency).to.equal(offerData.fiatCurrency);
    expect(createdOffer.state).to.deep.equal({ active: {} }); // Anchor enum style
    expect(createdOffer.id.eq(userACreatedOfferId)).to.be.true; // Verify stored ID

    // Verify Profile (CPI)
    const userAProfile = await profileProgram.account.profile.fetch(userAProfilePda);
    expect(userAProfile.contact).to.equal(offerData.ownerContact);
    expect(userAProfile.encryptionKey).to.equal(offerData.ownerEncryptionKey);
    expect(userAProfile.activeOffersCount).to.equal(1);
  });

  it("User A updates offer state to Paused, profile active_offers_count updated via CPI", async () => {
    console.log("SUPER_DEBUG_MARKER_PAUSE_TEST_ENTRY"); // Unique marker
    const userAProfilePda = (await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("profile"), userA.publicKey.toBuffer()],
        profileProgram.programId
      ))[0];

    // Use the stored offer ID and PDA from the creation test
    expect(userACreatedOfferId, "userACreatedOfferId should be defined").to.exist;
    expect(userACreatedOfferPda, "userACreatedOfferPda should be defined").to.exist;
    
    console.log("Updating offer with ID: ".concat(userACreatedOfferId.toString()).concat(" and PDA: ").concat(userACreatedOfferPda.toBase58()));

    const offerUpdateData = {
      ownerContact: null, // No change
      ownerEncryptionKey: null, // No change
      offerType: null,
      fiatCurrency: null,
      rate: null,
      denom: null,
      minAmount: null,
      maxAmount: null,
      description: "Updated: Pausing this offer.",
      state: OfferState.Paused,
    };

    const accountsForUpdatePaused = {
      offer: userACreatedOfferPda, 
      owner: userA.publicKey, 
      profileProgram: profileProgram.programId,
      userProfile: userAProfilePda,
      profileConfigAccount: profileConfigPda, 
      hubConfigAccount: hubConfigPda, 
      systemProgram: anchor.web3.SystemProgram.programId,
    };
    console.log("SUPER_DEBUG_ACCOUNTS_FOR_PAUSE_UPDATE:", JSON.stringify(accountsForUpdatePaused, null, 2));

    await offerProgram.methods
      .updateOffer({ 
        rate: offerUpdateData.rate,
        minAmount: offerUpdateData.minAmount,
        maxAmount: offerUpdateData.maxAmount,
        description: offerUpdateData.description,
        state: offerUpdateData.state,
        ownerContact: offerUpdateData.ownerContact,
        ownerEncryptionKey: offerUpdateData.ownerEncryptionKey,
      })
      .accounts(accountsForUpdatePaused) // Pass the logged accounts object
      .signers([userA])
      .rpc();

    // Verify Offer
    const updatedOffer = await offerProgram.account.offer.fetch(userACreatedOfferPda); // Use stored PDA
    expect(updatedOffer.description).to.equal(offerUpdateData.description);
    expect(updatedOffer.state).to.deep.equal({ paused: {} });

    // Verify Profile (CPI)
    const userAProfile = await profileProgram.account.profile.fetch(userAProfilePda);
    expect(userAProfile.activeOffersCount).to.equal(0); // Paused offer decrement active count
  });
  
  it("User A updates offer contact, profile contact updated via CPI", async () => {
    console.log("SUPER_DEBUG_MARKER_CONTACT_TEST_ENTRY"); // Unique marker
    const userAProfilePda = (await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("profile"), userA.publicKey.toBuffer()],
        profileProgram.programId
    ))[0];

    // Use the stored offer ID and PDA
    expect(userACreatedOfferId, "userACreatedOfferId should be defined for contact update").to.exist;
    expect(userACreatedOfferPda, "userACreatedOfferPda should be defined for contact update").to.exist;

    console.log("Updating contact for offer with ID: ".concat(userACreatedOfferId.toString()).concat(" and PDA: ").concat(userACreatedOfferPda.toBase58()));
    
    const newContact = "new_contact@example.com";
    const newEncKey = "new_enc_key";

    const offerUpdateData = {
        ownerContact: newContact,
        ownerEncryptionKey: newEncKey,
        offerType: null, fiatCurrency: null, rate: null, denom: null,
        minAmount: null, maxAmount: null, description: null, state: null,
    };

    const accountsForUpdateContact = {
        offer: userACreatedOfferPda, 
        owner: userA.publicKey, 
        profileProgram: profileProgram.programId,
        userProfile: userAProfilePda,
        profileConfigAccount: profileConfigPda,
        hubConfigAccount: hubConfigPda,
        systemProgram: anchor.web3.SystemProgram.programId,
    };
    console.log("SUPER_DEBUG_ACCOUNTS_FOR_CONTACT_UPDATE:", JSON.stringify(accountsForUpdateContact, null, 2));

    await offerProgram.methods
        .updateOffer({ 
            rate: offerUpdateData.rate, 
            minAmount: offerUpdateData.minAmount,
            maxAmount: offerUpdateData.maxAmount,
            description: offerUpdateData.description,
            state: null, 
            ownerContact: offerUpdateData.ownerContact,
            ownerEncryptionKey: offerUpdateData.ownerEncryptionKey,
        })
        .accounts(accountsForUpdateContact) // Pass the logged accounts object
        .signers([userA])
        .rpc();

    // Verify Offer
    const updatedOffer = await offerProgram.account.offer.fetch(userACreatedOfferPda); // Use stored PDA
    expect(updatedOffer.ownerContact).to.equal(newContact);

    // Verify Profile (CPI)
    const userAProfile = await profileProgram.account.profile.fetch(userAProfilePda);
    expect(userAProfile.contact).to.equal(newContact);
    expect(userAProfile.encryptionKey).to.equal(newEncKey);
  });


  it("User B directly updates their profile contact", async () => {
    const userBProfilePda = (await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("profile"), userB.publicKey.toBuffer()],
      profileProgram.programId
    ))[0];
    console.log("User B Profile PDA for direct update:", userBProfilePda.toBase58());


    const newContact = "userB_direct_contact@example.com";
    const newEncKey = "userB_direct_enc_key";

    // No need to create a temporary offer, updateContact uses init_if_needed
    console.log("Directly calling updateContact for User B");

    await profileProgram.methods
      .updateContact(newContact, newEncKey)
      .accounts({
        // Based on Profile program's UpdateContact struct:
        // caller: AccountInfo<'info>, (userB)
        // profile_owner: AccountInfo<'info>, (userB.publicKey)
        // profile_config: Account<'info, state::ProfileConfig>, (profileConfigPda)
        // profile: Account<'info, ProfileData>, (userBProfilePda)
        // system_program: Program<'info, System>,
        caller: userB.publicKey, 
        profileOwner: userB.publicKey, 
        profileConfig: profileConfigPda,
        profile: userBProfilePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([userB]) // userB is the 'caller' and signs
      .rpc();
    console.log("User B updateContact call successful.");

    const userBProfile = await profileProgram.account.profile.fetch(userBProfilePda);
    expect(userBProfile.contact).to.equal(newContact);
    expect(userBProfile.encryptionKey).to.equal(newEncKey);
    expect(userBProfile.address.equals(userB.publicKey)).to.be.true;
    expect(userBProfile.createdAt.toNumber()).to.be.greaterThan(0);
  });

  it("Queries offers: by ID and by Owner", async () => {
    // Offer 1 (User A) already created and modified.
    // Use stored ID and PDA
    expect(userACreatedOfferId, "userACreatedOfferId should be defined for query").to.exist;
    expect(userACreatedOfferPda, "userACreatedOfferPda should be defined for query").to.exist;
    
    console.log("Querying offer with ID: ".concat(userACreatedOfferId.toString()).concat(" and PDA: ").concat(userACreatedOfferPda.toBase58()));

    const fetchedOffer1 = await offerProgram.account.offer.fetch(userACreatedOfferPda);
    expect(fetchedOffer1.owner.toString()).to.equal(userA.publicKey.toString());
    expect(fetchedOffer1.id.eq(userACreatedOfferId)).to.be.true;

    // Query offers by User A (owner)
    // Anchor's default client doesn't directly support complex "OffersByOwner" from spec without custom setup.
    // This usually means the program itself has an instruction for such queries that returns a list,
    // or one uses getProgramAccounts with filters.
    console.log("Querying offers by owner (User A):", userA.publicKey.toBase58());
    const offersOwnedByUserA = await offerProgram.account.offer.all([
      {
        memcmp: {
          offset: 8 + 8, // Discriminator (8) + id (8) = 16 for owner field
          bytes: userA.publicKey.toBase58(),
        },
      },
    ]);

    expect(offersOwnedByUserA.length).to.be.greaterThan(0);
    const foundUserAOffer = offersOwnedByUserA.find(offer => offer.account.id.eq(userACreatedOfferId));
    expect(foundUserAOffer).to.exist;
    if (foundUserAOffer) {
      expect(foundUserAOffer.account.owner.equals(userA.publicKey)).to.be.true;
      console.log(`Found ${offersOwnedByUserA.length} offer(s) for User A, including ID ${userACreatedOfferId.toString()}`);
    }

    // Create a second offer by User B to test filtering more robustly
    const currentOfferConfigAfterUserA = await offerProgram.account.offerConfig.fetch(offerConfigPda);
    const offerIdForUserB = currentOfferConfigAfterUserA.offersCount;

    const [offerPdaForUserB] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("offer"), offerIdForUserB.toBuffer("le", 8)],
      offerProgram.programId
    );
    const userBProfilePdaQuery = (await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("profile"), userB.publicKey.toBuffer()],
      profileProgram.programId
    ))[0];

    console.log("Creating a second offer for User B, ID: ".concat(offerIdForUserB.toString()));
    await offerProgram.methods
      .create(
        0, "EUR", new anchor.BN(60000), "USDC", new anchor.BN(50), new anchor.BN(500),
        "User B Test Offer", "userB_contact@test.com", "userB_enc_key"
      )
      .accounts({
        owner: userB.publicKey,
        offerConfig: offerConfigPda,
        offer: offerPdaForUserB,
        profileProgram: profileProgram.programId,
        userProfile: userBProfilePdaQuery, 
        profileConfigAccount: profileConfigPda,
        hubConfigAccount: hubConfigPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([userB])
      .rpc();
    console.log("Second offer (User B) created successfully.");

    const createdOfferUserB = await offerProgram.account.offer.fetch(offerPdaForUserB);
    expect(createdOfferUserB.owner.equals(userB.publicKey)).to.be.true;

    // Re-query for User A, count should be the same as before User B's offer
    const offersOwnedByUserA_afterUserBCreation = await offerProgram.account.offer.all([
      {
        memcmp: {
          offset: 8 + 8, 
          bytes: userA.publicKey.toBase58(),
        },
      },
    ]);
    expect(offersOwnedByUserA_afterUserBCreation.length).to.equal(offersOwnedByUserA.length);
    console.log(`User A still has ${offersOwnedByUserA_afterUserBCreation.length} offer(s).`);

    // Query offers by User B
    console.log("Querying offers by owner (User B):", userB.publicKey.toBase58());
    const offersOwnedByUserB = await offerProgram.account.offer.all([
      {
        memcmp: {
          offset: 8 + 8, 
          bytes: userB.publicKey.toBase58(),
        },
      },
    ]);
    expect(offersOwnedByUserB.length).to.equal(1);
    expect(offersOwnedByUserB[0].account.id.eq(offerIdForUserB)).to.be.true;
    expect(offersOwnedByUserB[0].account.owner.equals(userB.publicKey)).to.be.true;
    console.log(`Found ${offersOwnedByUserB.length} offer(s) for User B, including ID ${offerIdForUserB.toString()}`);
  });

  // Test for querying profiles (simple version: fetch all and check for known profiles)
  it("Queries profiles: checks for User A and User B profiles", async () => {
    const allProfiles = await profileProgram.account.profile.all();
    console.log(`Found ${allProfiles.length} profiles in total.`);

    const userAProfileFetched = allProfiles.find(p => p.account.address.equals(userA.publicKey));
    const userBProfileFetched = allProfiles.find(p => p.account.address.equals(userB.publicKey));

    expect(userAProfileFetched, "User A's profile should be found").to.exist;
    if (userAProfileFetched) {
      console.log("User A profile found via query all:", userAProfileFetched.account);
      // Optionally, more specific checks on User A's profile data
      expect(userAProfileFetched.account.activeOffersCount).to.equal(0); // Offer was paused
    }

    expect(userBProfileFetched, "User B's profile should be found").to.exist;
    if (userBProfileFetched) {
      console.log("User B profile found via query all:", userBProfileFetched.account);
      // Optionally, more specific checks on User B's profile data
      expect(userBProfileFetched.account.contact).to.equal("userB_direct_contact@example.com");
    }
  });

  it("Simulates Trade program CPI to Profile: update_trades_count (RequestCreated)", async () => {
    // User A's profile should exist from offer creation
    const userAProfileBefore = await profileProgram.account.profile.fetch(userAProfilePda);
    const initialRequestedCount = userAProfileBefore.requestedTradesCount;

    console.log("Calling updateTradesCount (RequestCreated) for User A by mockTradeProgram");
    await profileProgram.methods
      .updateTradesCount(TradeStateForProfile.RequestCreated)
      .accounts({
        // Based on Profile program's UpdateTradesCount struct:
        // caller: AccountInfo<'info>, (mockTradeProgram.publicKey, as signer)
        // profile_owner: AccountInfo<'info>, (userA.publicKey)
        // profile_config: Account<'info, state::ProfileConfig>, (profileConfigPda)
        // hub_config: AccountInfo<'info>, (hubConfigPda)
        // profile: Account<'info, ProfileData>, (userAProfilePda)
        // system_program: Program<'info, System>
        caller: mockTradeProgram.publicKey, 
        profileOwner: userA.publicKey,
        profileConfig: profileConfigPda,
        hubConfig: hubConfigPda, 
        profile: userAProfilePda,
        systemProgram: anchor.web3.SystemProgram.programId, 
      })
      .signers([mockTradeProgram]) // mockTradeProgram is the authority (simulated Trade Program)
      .rpc();

    const userAProfileAfter = await profileProgram.account.profile.fetch(userAProfilePda);
    expect(userAProfileAfter.requestedTradesCount.toNumber()).to.equal(initialRequestedCount.toNumber() + 1);
    console.log("User A requestedTradesCount incremented.");
  });

  it("Simulates Trade program CPI to Profile: update_trades_count (EscrowFunded & EscrowReleased)", async () => {
    // User A's profile
    const userAProfileBeforeCounts = await profileProgram.account.profile.fetch(userAProfilePda);
    const initialActiveTrades = userAProfileBeforeCounts.activeTradesCount;
    const initialReleasedTrades = userAProfileBeforeCounts.releasedTradesCount;

    // 1. Simulate EscrowFunded (increments active_trades_count)
    console.log("Calling updateTradesCount (EscrowFunded) for User A by mockTradeProgram");
    await profileProgram.methods
      .updateTradesCount(TradeStateForProfile.EscrowFunded)
      .accounts({
        caller: mockTradeProgram.publicKey,
        profileOwner: userA.publicKey,
        profileConfig: profileConfigPda,
        hubConfig: hubConfigPda,
        profile: userAProfilePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([mockTradeProgram])
      .rpc();
    
    const userAProfileAfterFunded = await profileProgram.account.profile.fetch(userAProfilePda);
    expect(userAProfileAfterFunded.activeTradesCount).to.equal(initialActiveTrades + 1);
    console.log("User A activeTradesCount incremented after EscrowFunded.");

    // 2. Simulate EscrowReleased (increments released_trades_count, decrements active_trades_count)
    console.log("Calling updateTradesCount (EscrowReleased) for User A by mockTradeProgram");
    await profileProgram.methods
      .updateTradesCount(TradeStateForProfile.EscrowReleased)
      .accounts({
        caller: mockTradeProgram.publicKey,
        profileOwner: userA.publicKey,
        profileConfig: profileConfigPda,
        hubConfig: hubConfigPda,
        profile: userAProfilePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([mockTradeProgram])
      .rpc();

    const userAProfileAfterReleased = await profileProgram.account.profile.fetch(userAProfilePda);
    expect(userAProfileAfterReleased.releasedTradesCount.toNumber()).to.equal(initialReleasedTrades.toNumber() + 1);
    expect(userAProfileAfterReleased.activeTradesCount).to.equal(initialActiveTrades); // Back to original, as +1 then -1
    console.log("User A releasedTradesCount incremented, activeTradesCount decremented after EscrowReleased.");
  });

  // Placeholder for more complex offer queries (e.g., by type, fiat, denom)
  it.skip("Queries offers: by type, fiat currency, and denom (Placeholder)", async () => {
    // This would require more complex filtering, potentially multiple memcmp or a dedicated program instruction.
    // Example: Find all 'Buy' (type 0) offers for 'USD' in 'SOL'
    const filters = [
      {
        memcmp: {
          offset: 8 + 8 + 32, // Discriminator + id + owner -> offer_type (u8)
          bytes: anchor.utils.bytes.bs58.encode(Buffer.from([OfferState.Active])),
          // Note: Direct u8 to base58 might not be what memcmp expects for single bytes.
          // Often, it's easier to filter client-side after fetching broadly, or have program support this.
        },
      },
      // Additional filters for fiat_currency and denom would be complex due to String types
      // and their variable length encoding within the account structure.
    ];
    // const filteredOffers = await offerProgram.account.offer.all(filters);
    // expect(filteredOffers.length).to.be.greaterThan(0);
    console.warn("Skipping complex offer query test - requires more advanced filtering or program changes.")
  });

}); 