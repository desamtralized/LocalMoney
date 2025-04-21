import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Profile } from "../target/types/profile";
import { Hub } from "../target/types/hub"; // Assuming Hub types might be needed for HubConfig reference
import { Offer } from "../target/types/offer"; // Import Offer program types
import { Trade } from "../target/types/trade"; // Import Trade program types
import { expect } from "chai";
import { getProfilePda, getHubConfigPda, getProgramAuthorityPda } from "./utils"; // Assuming utils exist and include getProgramAuthorityPda

// Mock TradeState enum (adjust values based on actual program definition)
enum TradeState {
  RequestCreated = 0,
  RequestAccepted = 1,
  EscrowFunded = 2,
  FiatDeposited = 3,
  EscrowReleased = 4, // Completed
  EscrowCancelled = 5,
  EscrowRefunded = 6,
  EscrowDisputed = 7,
  EscrowSettled = 8,
}

describe("profile", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const profileProgram = anchor.workspace.Profile as Program<Profile>;
  const hubProgram = anchor.workspace.Hub as Program<Hub>; // Needed if HubConfig is passed
  const offerProgram = anchor.workspace.Offer as Program<Offer>; // Load Offer program
  const tradeProgram = anchor.workspace.Trade as Program<Trade>; // Load Trade program

  const user = anchor.web3.Keypair.generate();
  const admin = provider.wallet as anchor.Wallet; // Assuming admin initializes Hub
  const unauthorizedSigner = anchor.web3.Keypair.generate(); // For security tests

  let profilePda: anchor.web3.PublicKey;
  let profileBump: number;
  let hubConfigPda: anchor.web3.PublicKey; // Needed for profile constraints/initialization
  let offerProgramAuthorityPda: anchor.web3.PublicKey; // PDA Offer uses to sign CPI
  let offerProgramAuthorityBump: number;
  let tradeProgramAuthorityPda: anchor.web3.PublicKey; // PDA Trade uses to sign CPI
  let tradeProgramAuthorityBump: number;

  before(async () => {
    // Fund user and unauthorized signer accounts
    await provider.connection.requestAirdrop(
      user.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
     await provider.connection.requestAirdrop(
      unauthorizedSigner.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );
    await new Promise(resolve => setTimeout(resolve, 1000)); // Airdrop confirmation delay

    // Derive PDAs
    [profilePda, profileBump] = getProfilePda(user.publicKey, profileProgram.programId);
    [hubConfigPda] = getHubConfigPda(hubProgram.programId);
    [offerProgramAuthorityPda, offerProgramAuthorityBump] = getProgramAuthorityPda(offerProgram.programId); // Get Offer's authority PDA
    [tradeProgramAuthorityPda, tradeProgramAuthorityBump] = getProgramAuthorityPda(tradeProgram.programId); // Get Trade's authority PDA


    // Pre-requisite: Ensure Hub is initialized
    try {
      await hubProgram.account.hubConfig.fetch(hubConfigPda);
      console.log("Hub already initialized.");
    } catch (e) {
      console.log("Initializing Hub for Profile tests...");
      // Need hub treasury PDA if initializing here
      const [hubTreasuryPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("hub_treasury")],
            hubProgram.programId
        );
      await hubProgram.methods
        .initialize(new BN(100), new BN(50)) // Example fees
        .accounts({
          hubConfig: hubConfigPda,
          hubTreasury: hubTreasuryPda,
          admin: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("Hub initialized.");
      await new Promise(resolve => setTimeout(resolve, 500)); // Delay after init
    }

     // Initialize Profile for CPI tests
    try {
      await profileProgram.account.profile.fetch(profilePda);
    } catch (e) {
         console.log("Initializing Profile for CPI tests...")
         await profileProgram.methods
            .updateProfile("initial@contact", "initial bio")
            .accounts({
                profile: profilePda,
                owner: user.publicKey,
                hubConfig: hubConfigPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([user])
            .rpc();
        console.log("Profile initialized.")
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay after init
    }
  });

  it("Initializes a user profile", async () => {
    const initialContact = "telegram:@initialUser";
    const initialBio = "My initial bio";

    // The `initialize` instruction in Profile program might be named differently,
    // e.g., `create_profile` or handled within `update_profile`. Adjust as needed.
    // This assumes an instruction like `initialize_profile` or similar.
    // If creation happens in `update_profile`, this test might merge with the next one.

    // Assuming an `initialize_profile` instruction exists:
    /*
    await profileProgram.methods
        .initializeProfile(initialContact) // Or maybe no args if update_profile handles it
        .accounts({
            profile: profilePda,
            owner: user.publicKey,
            hubConfig: hubConfigPda, // If needed by program constraints
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc();

    const profileAccount = await profileProgram.account.profile.fetch(profilePda);
    expect(profileAccount.owner.equals(user.publicKey)).to.be.true;
    expect(profileAccount.contact).to.equal(initialContact); // Or default if initialize doesn't set it
    expect(profileAccount.tradesCompleted).to.equal(0);
    expect(profileAccount.tradesStarted).to.equal(0);
    expect(profileAccount.tradesCancelled).to.equal(0);
    expect(profileAccount.tradesDisputed).to.equal(0);
    expect(profileAccount.activeOffers).to.equal(0);
    expect(profileAccount.bump).to.equal(profileBump);
    expect(profileAccount.hubConfig.equals(hubConfigPda)).to.be.true; // Verify hub config link
    */

    // If profile creation happens on first `update_profile` call:
    await profileProgram.methods
      .updateProfile(initialContact, initialBio)
      .accounts({
        profile: profilePda,
        owner: user.publicKey,
        hubConfig: hubConfigPda, // Pass hub config if required by the program
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const profileAccount = await profileProgram.account.profile.fetch(profilePda);
    expect(profileAccount.owner.equals(user.publicKey)).to.be.true;
    expect(profileAccount.contact).to.equal(initialContact);
    expect(profileAccount.bio).to.equal(initialBio);
    expect(profileAccount.tradesCompleted).to.equal(0);
    // ... check other default fields ...
    expect(profileAccount.bump).to.equal(profileBump);
     expect(profileAccount.hubConfigKey.equals(hubConfigPda)).to.be.true; // Verify hub config link
  });

  it("Updates profile contact and bio", async () => {
    const updatedContact = "discord:updatedUser#1234";
    const updatedBio = "An updated bio description.";

    // Ensure profile exists from the previous test
    await profileProgram.methods
      .updateProfile(updatedContact, updatedBio)
      .accounts({
        profile: profilePda,
        owner: user.publicKey, // The owner must sign to update
        hubConfig: hubConfigPda, // Pass hub config if required by the program
        systemProgram: anchor.web3.SystemProgram.programId, // Might not be needed if just updating data
      })
      .signers([user])
      .rpc();

    const profileAccount = await profileProgram.account.profile.fetch(profilePda);
    expect(profileAccount.contact).to.equal(updatedContact);
    expect(profileAccount.bio).to.equal(updatedBio);
    expect(profileAccount.owner.equals(user.publicKey)).to.be.true; // Check owner again
  });

   it("Fails to update profile with wrong owner", async () => {
    const attacker = anchor.web3.Keypair.generate();
    const attackerContact = "hacker@contact.bad";
    const attackerBio = "Trying to change bio";

     // Fund attacker
     await provider.connection.requestAirdrop(attacker.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
     await new Promise(resolve => setTimeout(resolve, 500));

    try {
      await profileProgram.methods
        .updateProfile(attackerContact, attackerBio)
        .accounts({
          profile: profilePda, // Targeting the original user's profile
          owner: attacker.publicKey, // Attacker tries to sign
          hubConfig: hubConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([attacker]) // Signed by attacker
        .rpc();
      expect.fail("Should have failed to update profile with wrong owner");
    } catch (err) {
       expect(err).to.be.instanceOf(anchor.AnchorError);
       const errorCode = (err as anchor.AnchorError).error.errorCode.code;
       // Check specific owner constraint error from your program if defined
       // Otherwise check general constraints
        expect(["ConstraintSigner", "ConstraintHasOne", "ConstraintAddress", "OwnerMismatch"]).to.include(errorCode);
       console.log(`Caught expected error updating profile with wrong owner: ${errorCode}`);
    }

    // Verify profile was not changed
    const profileAccount = await profileProgram.account.profile.fetch(profilePda);
    const updatedContact = "discord:updatedUser#1234"; // Value from previous successful update
    expect(profileAccount.contact).to.equal(updatedContact);
  });


  // --- CPI Tests ---

  it("Updates trade counts via CPI from simulated Trade program", async () => {
    const initialState = await profileProgram.account.profile.fetch(profilePda);
    const tradesStartedBefore = initialState.tradesStarted;
    const tradesCompletedBefore = initialState.tradesCompleted;

    // Simulate Trade program calling update_trades_count for TradeState::RequestCreated
    await profileProgram.methods
      .updateTradesCount({ tradeStarted: {} }) // Match enum structure in Rust program
      .accounts({
        profile: profilePda,
        authority: tradeProgramAuthorityPda, // Trade program's PDA signer
        hubConfig: hubConfigPda,
        profileOwner: user.publicKey, // Pass the profile owner
      })
      // No signers needed here as it's called via CPI usually,
      // but for testing directly we don't need the Trade program to sign.
      // The constraint check is on the 'authority' account's key.
      .rpc();

    let profileAccount = await profileProgram.account.profile.fetch(profilePda);
    expect(profileAccount.tradesStarted).to.equal(tradesStartedBefore + 1);

    // Simulate Trade program calling update_trades_count for TradeState::EscrowReleased (Completed)
    await profileProgram.methods
      .updateTradesCount({ tradeCompleted: {} }) // Match enum structure
      .accounts({
        profile: profilePda,
        authority: tradeProgramAuthorityPda, // Trade program's PDA signer
        hubConfig: hubConfigPda,
        profileOwner: user.publicKey,
      })
      .rpc();

    profileAccount = await profileProgram.account.profile.fetch(profilePda);
    // Assuming completed also increments started if not already counted (depends on program logic)
    // Let's assume completed ONLY increments completed count for simplicity here. Adjust if needed.
    expect(profileAccount.tradesCompleted).to.equal(tradesCompletedBefore + 1);
    // tradesStarted might remain incremented from the first call, depends on exact logic.
    expect(profileAccount.tradesStarted).to.equal(tradesStartedBefore + 1);
  });

  it("Updates active offers count via CPI from simulated Offer program (+1)", async () => {
     const initialState = await profileProgram.account.profile.fetch(profilePda);
     const activeOffersBefore = initialState.activeOffers;

     // Simulate Offer program calling update_active_offers(true) for offer creation
     await profileProgram.methods
        .updateActiveOffers(true) // Increment
        .accounts({
            profile: profilePda,
            authority: offerProgramAuthorityPda, // Offer program's PDA signer
            hubConfig: hubConfigPda,
            profileOwner: user.publicKey,
        })
        .rpc();

     const profileAccount = await profileProgram.account.profile.fetch(profilePda);
     expect(profileAccount.activeOffers).to.equal(activeOffersBefore + 1);
  });

   it("Updates active offers count via CPI from simulated Offer program (-1)", async () => {
     const initialState = await profileProgram.account.profile.fetch(profilePda);
     const activeOffersBefore = initialState.activeOffers;

     // Ensure there's at least one active offer from the previous test
     expect(activeOffersBefore).to.be.greaterThan(0);

     // Simulate Offer program calling update_active_offers(false) for offer closure/pause
     await profileProgram.methods
        .updateActiveOffers(false) // Decrement
        .accounts({
            profile: profilePda,
            authority: offerProgramAuthorityPda, // Offer program's PDA signer
            hubConfig: hubConfigPda,
            profileOwner: user.publicKey,
        })
        .rpc();

     const profileAccount = await profileProgram.account.profile.fetch(profilePda);
     expect(profileAccount.activeOffers).to.equal(activeOffersBefore - 1);
  });

  it("Fails update_trades_count CPI call with unauthorized program signer", async () => {
     try {
        await profileProgram.methods
            .updateTradesCount({ tradeStarted: {} })
            .accounts({
                profile: profilePda,
                authority: unauthorizedSigner.publicKey, // WRONG signer
                hubConfig: hubConfigPda,
                profileOwner: user.publicKey,
            })
            .signers([unauthorizedSigner]) // Sign with the wrong key
            .rpc();
        expect.fail("Should have failed CPI call with unauthorized signer");
     } catch (err) {
         expect(err).to.be.instanceOf(anchor.AnchorError);
         const errorCode = (err as anchor.AnchorError).error.errorCode.code;
         // Expecting a constraint violation on the 'authority' account
         // This could be ConstraintRaw, ConstraintSigner, or a specific custom error like 'UnauthorizedProgram'
         expect(["ConstraintRaw", "ConstraintSigner", "ConstraintSeeds", "UnauthorizedCaller"]).to.include(errorCode);
         console.log(`Caught expected error for unauthorized CPI signer (trades): ${errorCode}`);
     }
  });

   it("Fails update_active_offers CPI call with unauthorized program signer", async () => {
     try {
        await profileProgram.methods
            .updateActiveOffers(true) // Increment
            .accounts({
                profile: profilePda,
                authority: unauthorizedSigner.publicKey, // WRONG signer
                hubConfig: hubConfigPda,
                profileOwner: user.publicKey,
            })
            .signers([unauthorizedSigner]) // Sign with the wrong key
            .rpc();
        expect.fail("Should have failed CPI call with unauthorized signer");
     } catch (err) {
         expect(err).to.be.instanceOf(anchor.AnchorError);
         const errorCode = (err as anchor.AnchorError).error.errorCode.code;
         // Expecting a constraint violation on the 'authority' account
         expect(["ConstraintRaw", "ConstraintSigner", "ConstraintSeeds", "UnauthorizedCaller"]).to.include(errorCode);
         console.log(`Caught expected error for unauthorized CPI signer (offers): ${errorCode}`);
     }
  });

   // Test for updating contact via CPI (assuming Offer program calls this)
   it("Updates contact via CPI from simulated Offer program", async () => {
     const newContact = "cpi_contact@test.xyz";
     const initialContact = (await profileProgram.account.profile.fetch(profilePda)).contact;
     expect(initialContact).to.not.equal(newContact);

     await profileProgram.methods
        .updateContact(newContact)
        .accounts({
            profile: profilePda,
            authority: offerProgramAuthorityPda, // Offer program's PDA signer
            hubConfig: hubConfigPda,
            profileOwner: user.publicKey,
        })
        .rpc();

     const profileAccount = await profileProgram.account.profile.fetch(profilePda);
     expect(profileAccount.contact).to.equal(newContact);
   });

    it("Fails update_contact CPI call with unauthorized program signer", async () => {
        const newContact = "fail_cpi_contact@test.xyz";
         try {
            await profileProgram.methods
                .updateContact(newContact)
                .accounts({
                    profile: profilePda,
                    authority: unauthorizedSigner.publicKey, // WRONG signer
                    hubConfig: hubConfigPda,
                    profileOwner: user.publicKey,
                })
                .signers([unauthorizedSigner]) // Sign with the wrong key
                .rpc();
            expect.fail("Should have failed CPI call with unauthorized signer");
         } catch (err) {
             expect(err).to.be.instanceOf(anchor.AnchorError);
             const errorCode = (err as anchor.AnchorError).error.errorCode.code;
             // Expecting a constraint violation on the 'authority' account
             expect(["ConstraintRaw", "ConstraintSigner", "ConstraintSeeds", "UnauthorizedCaller"]).to.include(errorCode);
             console.log(`Caught expected error for unauthorized CPI signer (contact): ${errorCode}`);
         }
    });


});

// Helper function placeholder - ensure it exists in ./utils.ts
// function getProgramAuthorityPda(programId: anchor.web3.PublicKey): [anchor.web3.PublicKey, number] {
//   // The seeds must match EXACTLY how they are defined in the respective programs (Offer/Trade)
//   // Common patterns are just [b"authority"] or [programId.toBuffer()]
//   // CHECK YOUR PROGRAM'S PDA DEFINITION
//   const seeds = [Buffer.from("authority")]; // Example, adjust if necessary!
//   return anchor.web3.PublicKey.findProgramAddressSync(seeds, programId);
// } 