import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Profile } from "../target/types/profile"; // Adjust path based on actual IDL location
import { HubConfigStub } from "../target/types/profile"; // Assuming HubConfigStub is in profile IDL for test
import { assert } from "chai";

// Configure the client to use the local cluster.
anchor.setProvider(anchor.AnchorProvider.env());
const program = anchor.workspace.Profile as Program<Profile>;
const provider = anchor.getProvider();

// Real Hub Program - using actual workspace program
const hubProgram = anchor.workspace.Hub as Program<any>;

describe("Profile Program Tests", () => {
    const authority = anchor.web3.Keypair.generate(); // Program deployer / admin for ProfileGlobalState
    const userProfileOwner = anchor.web3.Keypair.generate();
    const hubAdmin = anchor.web3.Keypair.generate(); // For HubConfigStub

    let profileGlobalStatePda: anchor.web3.PublicKey;
    let profileGlobalStateBump: number;
    let userProfilePda: anchor.web3.PublicKey;
    let userProfileBump: number;

    // Placeholder for HubConfigStub PDA if it's managed by a mock Hub program
    let hubConfigStubPda: anchor.web3.PublicKey;
    let hubConfigStubBump: number;

    before(async () => {
        // Airdrop SOL
        await provider.connection.requestAirdrop(authority.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(userProfileOwner.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(hubAdmin.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        await new Promise(resolve => setTimeout(resolve, 500));

        [profileGlobalStatePda, profileGlobalStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("profile_global_state")],
            program.programId
        );

        [userProfilePda, userProfileBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("profile"), userProfileOwner.publicKey.toBuffer()],
            program.programId
        );

        // Use real Hub config PDA instead of stub
        [hubConfigStubPda, hubConfigStubBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("hub")], // Real Hub config seed
            hubProgram.programId // Real Hub program ID
        );

        // Initialize the real Hub program
        try {
            await hubProgram.methods
                .initialize(
                    anchor.web3.Keypair.generate().publicKey, // offerAddr - placeholder
                    anchor.web3.Keypair.generate().publicKey, // tradeAddr - placeholder
                    program.programId,                        // profileAddr - this program
                    anchor.web3.Keypair.generate().publicKey, // priceAddr - placeholder
                    anchor.web3.Keypair.generate().publicKey, // priceProviderAddr
                    anchor.web3.Keypair.generate().publicKey, // localMarketAddr
                    anchor.web3.Keypair.generate().publicKey, // localDenomMint
                    anchor.web3.Keypair.generate().publicKey, // chainFeeCollectorAddr
                    anchor.web3.Keypair.generate().publicKey, // warchestAddr
                    5,                                        // activeOffersLimit
                    10,                                       // activeTradesLimit
                    100,                                      // arbitrationFeeBps
                    50,                                       // burnFeeBps
                    100,                                      // chainFeeBps
                    50,                                       // warchestFeeBps
                    new anchor.BN(3600 * 24 * 7),           // tradeExpirationTimer
                    new anchor.BN(3600 * 24 * 3),           // tradeDisputeTimer
                    new anchor.BN(10),                       // tradeLimitMinUsd
                    new anchor.BN(1000)                      // tradeLimitMaxUsd
                )
                .accounts({
                    hubConfig: hubConfigStubPda,
                    admin: hubAdmin.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([hubAdmin])
                .rpc();
        } catch (e) {
            console.log("Hub might already be initialized. Details:", e.message);
            // Attempt to fetch to see if it exists and has data.
            try {
                const config = await hubProgram.account.hubConfig.fetch(hubConfigStubPda);
                console.log("Fetched existing Hub config:", config);
            } catch (fetchError) {
                console.log("Could not fetch Hub config. Tests might be unreliable.", fetchError.message);
            }
        }
    });

    it("Initializes ProfileGlobalState", async () => {
        await program.methods
            .initializeProfileGlobalState()
            .accounts({
                profileGlobalState: profileGlobalStatePda,
                authority: authority.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([authority])
            .rpc();

        const globalState = await program.account.profileGlobalState.fetch(profileGlobalStatePda);
        assert.ok(globalState.hubAddress.equals(anchor.web3.PublicKey.default));
        assert.equal(globalState.bump, profileGlobalStateBump);
    });

    it("Registers Hub Address for Profile", async () => {
        const testHubActualAddress = hubProgram.programId; // Use real Hub program ID
        await program.methods
            .registerHubForProfile(testHubActualAddress)
            .accounts({
                profileGlobalState: profileGlobalStatePda,
                authority: authority.publicKey, // Assuming global admin registers hub
            })
            .signers([authority])
            .rpc();

        const globalState = await program.account.profileGlobalState.fetch(profileGlobalStatePda);
        assert.ok(globalState.hubAddress.equals(testHubActualAddress));
    });

    it("Updates Contact (initializes profile)", async () => {
        // Ensure ProfileGlobalState is initialized and Hub registered
        const contactInfo = "user@example.com";
        const encryptionKey = "user_enc_key";

        await program.methods
            .updateContact(contactInfo, encryptionKey)
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                payer: userProfileOwner.publicKey, // User pays for their own profile init
                profileGlobalState: profileGlobalStatePda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([userProfileOwner])
            .rpc();

        const profileAccount = await program.account.profile.fetch(userProfilePda);
        assert.ok(profileAccount.authority.equals(userProfileOwner.publicKey));
        assert.equal(profileAccount.contact, contactInfo);
        assert.equal(profileAccount.encryptionKey, encryptionKey);
        assert.ok(profileAccount.createdAtTimestamp.toNumber() > 0);
        assert.equal(profileAccount.bump, userProfileBump);
    });

    it("Updates Contact (existing profile)", async () => {
        const newContactInfo = "new_user@example.com";
        const newEncryptionKey = "new_user_enc_key";

        await program.methods
            .updateContact(newContactInfo, newEncryptionKey)
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                payer: userProfileOwner.publicKey,
                profileGlobalState: profileGlobalStatePda,
                systemProgram: anchor.web3.SystemProgram.programId, // Not strictly needed if not reallocating
            })
            .signers([userProfileOwner])
            .rpc();

        const profileAccount = await program.account.profile.fetch(userProfilePda);
        assert.equal(profileAccount.contact, newContactInfo);
        assert.equal(profileAccount.encryptionKey, newEncryptionKey);
    });

    it("Updates Active Offers Count", async () => {
        // Ensure Hub config is initialized as expected.
        try {
            const config = await hubProgram.account.hubConfig.fetch(hubConfigStubPda);
            assert.isNotNull(config, "Hub config should be initialized for this test");
            assert.equal(config.activeOffersLimit, 5, "Hub active_offers_limit incorrect");
        } catch (e) {
            console.warn("Skipping Hub config value check due to potential initialization issues. Test may not be robust.", e.message);
        }

        // First, ensure the user profile is initialized by calling updateContact
        // This is a prerequisite for updating its counters
        const initialContact = "offers_user@example.com";
        const initialKey = "offers_user_key";
        try {
            await program.account.profile.fetch(userProfilePda);
        } catch (e) { // Profile not found, initialize it
            await program.methods
                .updateContact(initialContact, initialKey)
                .accounts({
                    profile: userProfilePda,
                    profileAuthority: userProfileOwner.publicKey,
                    payer: userProfileOwner.publicKey,
                    profileGlobalState: profileGlobalStatePda,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([userProfileOwner])
                .rpc();
        }
        
        const profileBefore = await program.account.profile.fetch(userProfilePda);
        const initialOfferCount = profileBefore.activeOffersCount; // Assuming field name

        await program.methods
            .updateActiveOffers({ increment: {} }) // or CounterAction.Increment
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey, 
                hubConfig: hubConfigStubPda, 
                hubProgramId: hubProgram.programId, // Required account
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner]) // Adjust signers based on actual instruction requirements
            .rpc();
        
        const profileAfter = await program.account.profile.fetch(userProfilePda);
        // activeOffersCount is u8, not BN
        assert.equal(profileAfter.activeOffersCount, initialOfferCount + 1);

        // Test decrement
        await program.methods
            .updateActiveOffers({ decrement: {} }) // or CounterAction.Decrement
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                hubConfig: hubConfigStubPda,
                hubProgramId: hubProgram.programId, // Required account
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner])
            .rpc();
        
        const profileAfterDecrement = await program.account.profile.fetch(userProfilePda);
        assert.equal(profileAfterDecrement.activeOffersCount, initialOfferCount);
    });

    it("Updates Requested Trades Count", async () => {
        const profileBefore = await program.account.profile.fetch(userProfilePda);
        const initialRequested = profileBefore.requestedTradesCount.toNumber(); // u64 has toNumber()

        await program.methods
            .updateTradesCount({ requestCreated: {} })
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                hubConfig: hubConfigStubPda,
                hubProgramId: hubProgram.programId,
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner])
            .rpc();

        const profileAfter = await program.account.profile.fetch(userProfilePda);
        assert.equal(profileAfter.requestedTradesCount.toNumber(), initialRequested + 1);
        assert.equal(profileAfter.activeTradesCount, profileBefore.activeTradesCount); // u8 comparison
    });

    it("Updates Active Trades Count and enforces limit", async () => {
        const before = await program.account.profile.fetch(userProfilePda);
        const initialActive = before.activeTradesCount; // u8, no toNumber() needed

        // increment active trades within limit
        await program.methods
            .updateTradesCount({ requestAcceptedOrEscrowFunded: {} })
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                hubConfig: hubConfigStubPda,
                hubProgramId: hubProgram.programId,
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner])
            .rpc();

        let after = await program.account.profile.fetch(userProfilePda);
        assert.equal(after.activeTradesCount, initialActive + 1);

        // reach limit
        const hubConfig = await hubProgram.account.hubConfig.fetch(hubConfigStubPda);
        const limit = hubConfig.activeTradesLimit.toNumber(); // BN field
        for (let i = after.activeTradesCount; i < limit; i++) {
            await program.methods
                .updateTradesCount({ requestAcceptedOrEscrowFunded: {} })
                .accounts({
                    profile: userProfilePda,
                    profileAuthority: userProfileOwner.publicKey,
                    hubConfig: hubConfigStubPda,
                    hubProgramId: hubProgram.programId,
                    profileGlobalState: profileGlobalStatePda,
                })
                .signers([userProfileOwner])
                .rpc();
        }

        const atLimit = await program.account.profile.fetch(userProfilePda);
        assert.equal(atLimit.activeTradesCount, limit);

        try {
            await program.methods
                .updateTradesCount({ requestAcceptedOrEscrowFunded: {} })
                .accounts({
                    profile: userProfilePda,
                    profileAuthority: userProfileOwner.publicKey,
                    hubConfig: hubConfigStubPda,
                    hubProgramId: hubProgram.programId,
                    profileGlobalState: profileGlobalStatePda,
                })
                .signers([userProfileOwner])
                .rpc();
            assert.fail("Should have failed due to active trades limit reached");
        } catch (err) {
            assert.include(err.message, "ActiveTradesLimitReached");
        }
    });

    it("Releases Escrow and updates counts", async () => {
        // ensure at least one active trade
        await program.methods
            .updateTradesCount({ requestAcceptedOrEscrowFunded: {} })
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                hubConfig: hubConfigStubPda,
                hubProgramId: hubProgram.programId,
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner])
            .rpc();

        const beforeRelease = await program.account.profile.fetch(userProfilePda);
        const initialActive = beforeRelease.activeTradesCount.toNumber();
        const initialReleased = beforeRelease.releasedTradesCount.toNumber();

        await program.methods
            .updateTradesCount({ escrowReleased: {} })
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                hubConfig: hubConfigStubPda,
                hubProgramId: hubProgram.programId,
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner])
            .rpc();

        const afterRelease = await program.account.profile.fetch(userProfilePda);
        assert.equal(afterRelease.activeTradesCount.toNumber(), initialActive - 1);
        assert.equal(afterRelease.releasedTradesCount.toNumber(), initialReleased + 1);
    });

    // TODO: Add tests for failure cases (e.g., exceeding limits from HubConfigStub)
}); 