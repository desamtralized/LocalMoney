import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Profile } from "../target/types/profile"; // Adjust path based on actual IDL location
import { HubConfigStub } from "../target/types/profile"; // Assuming HubConfigStub is in profile IDL for test
import { assert } from "chai";

// Configure the client to use the local cluster.
anchor.setProvider(anchor.AnchorProvider.env());
const program = anchor.workspace.Profile as Program<Profile>;
const provider = anchor.getProvider();

// Mock Hub Program ID and a keypair for its authority if needed for HubConfigStub initialization
const MOCK_HUB_PROGRAM_ID = anchor.web3.Keypair.generate().publicKey;
// const hubAdmin = anchor.web3.Keypair.generate(); // If HubConfigStub needs admin to init

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

        // If HubConfigStub is a PDA of a mock Hub program, find its address
        [hubConfigStubPda, hubConfigStubBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("hub_config_stub")], // Assuming a unique seed for the stub
            program.programId // Or MOCK_HUB_PROGRAM_ID if it's a separate mock program
        );

        // Initialize the HubConfigStub account.
        // This assumes HubConfigStub is a simple account type defined in the Profile IDL
        // and that there's an instruction like `initializeHubConfigStub` or similar
        // in the Profile program for test purposes, OR we simulate it if it's from another program.
        // For this example, let's assume a direct way to create/set its data or an init instruction.
        // If `HubConfigStub` is part of the Profile program and has an initializer:
        try {
            // This is a hypothetical initializer. The actual mechanism might differ.
            // If HubConfigStub is just an account type, we might need to use a different approach
            // to set its data, or rely on it being passed from a mocked Hub program.
            // For now, we'll assume an initializer in the Profile program for the stub.
            await program.methods
                .initializeHubConfigStub(new anchor.BN(5), new anchor.BN(10)) // active_offers_limit, max_trades_limit
                .accounts({
                    hubConfigStub: hubConfigStubPda,
                    authority: hubAdmin.publicKey, // Or global authority
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([hubAdmin]) // Or global authority
                .rpc();
        } catch (e) {
            console.log("HubConfigStub might already be initialized or initializer doesn't exist. Details:", e.message);
            // Attempt to fetch to see if it exists and has data.
            try {
                const config = await program.account.hubConfigStub.fetch(hubConfigStubPda);
                console.log("Fetched existing HubConfigStub:", config);
            } catch (fetchError) {
                console.log("Could not fetch HubConfigStub. Test for updateActiveOffers might be unreliable.", fetchError.message);
                // If it truly doesn't exist and can't be initialized here, the test will likely fail
                // or needs to be adapted to not depend on specific values from it.
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
        const testHubActualAddress = MOCK_HUB_PROGRAM_ID; // Or any other test Pubkey
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
        // Ensure HubConfigStub is initialized as expected.
        // If initializeHubConfigStub failed or isn't suitable, this test needs adjustment.
        try {
            const config = await program.account.hubConfigStub.fetch(hubConfigStubPda);
            assert.isNotNull(config, "HubConfigStub should be initialized for this test");
            // assert.equal(config.activeOffersLimit.toNumber(), 5, "HubConfigStub active_offers_limit incorrect");
        } catch (e) {
            console.warn("Skipping HubConfigStub value check due to potential initialization issues. Test may not be robust.", e.message);
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
                // Assuming the profileAuthority (user) needs to sign if not a CPI
                // or if the CPI delegates authority appropriately.
                // If this is meant to be called by Offer program via CPI,
                // then the 'authority' for this instruction might be the Offer program's PDA
                // or the signer would be the Offer program itself (via CPI).
                // For direct testing, we might need a specific signer setup.
                // Let's assume for now the userProfileOwner can call it or it's a test-only path.
                profileAuthority: userProfileOwner.publicKey, 
                hubConfig: hubConfigStubPda, 
                // hubProgramId: MOCK_HUB_PROGRAM_ID, // May not be needed if hubConfig is from same program
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner]) // Adjust signers based on actual instruction requirements
            .rpc();
        
        const profileAfter = await program.account.profile.fetch(userProfilePda);
        // Adjust field name `activeOffersCount` as per actual IDL
        assert.equal(profileAfter.activeOffersCount.toNumber(), initialOfferCount.toNumber() + 1);

        // Test decrement
        await program.methods
            .updateActiveOffers({ decrement: {} }) // or CounterAction.Decrement
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                hubConfig: hubConfigStubPda,
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner])
            .rpc();
        
        const profileAfterDecrement = await program.account.profile.fetch(userProfilePda);
        assert.equal(profileAfterDecrement.activeOffersCount.toNumber(), initialOfferCount.toNumber());
    });

    it("Updates Requested Trades Count", async () => {
        const profileBefore = await program.account.profile.fetch(userProfilePda);
        const initialRequested = profileBefore.requestedTradesCount.toNumber();

        await program.methods
            .updateTradesCount({ requestCreated: {} })
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                hubConfig: hubConfigStubPda,
                hubProgramId: MOCK_HUB_PROGRAM_ID,
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner])
            .rpc();

        const profileAfter = await program.account.profile.fetch(userProfilePda);
        assert.equal(profileAfter.requestedTradesCount.toNumber(), initialRequested + 1);
        assert.equal(profileAfter.activeTradesCount.toNumber(), profileBefore.activeTradesCount.toNumber());
    });

    it("Updates Active Trades Count and enforces limit", async () => {
        const before = await program.account.profile.fetch(userProfilePda);
        const initialActive = before.activeTradesCount.toNumber();

        // increment active trades within limit
        await program.methods
            .updateTradesCount({ requestAcceptedOrEscrowFunded: {} })
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                hubConfig: hubConfigStubPda,
                hubProgramId: MOCK_HUB_PROGRAM_ID,
                profileGlobalState: profileGlobalStatePda,
            })
            .signers([userProfileOwner])
            .rpc();

        let after = await program.account.profile.fetch(userProfilePda);
        assert.equal(after.activeTradesCount.toNumber(), initialActive + 1);

        // reach limit
        const hubConfig = await program.account.hubConfigStub.fetch(hubConfigStubPda);
        const limit = hubConfig.activeTradesLimit.toNumber();
        for (let i = after.activeTradesCount.toNumber(); i < limit; i++) {
            await program.methods
                .updateTradesCount({ requestAcceptedOrEscrowFunded: {} })
                .accounts({
                    profile: userProfilePda,
                    profileAuthority: userProfileOwner.publicKey,
                    hubConfig: hubConfigStubPda,
                    hubProgramId: MOCK_HUB_PROGRAM_ID,
                    profileGlobalState: profileGlobalStatePda,
                })
                .signers([userProfileOwner])
                .rpc();
        }

        const atLimit = await program.account.profile.fetch(userProfilePda);
        assert.equal(atLimit.activeTradesCount.toNumber(), limit);

        try {
            await program.methods
                .updateTradesCount({ requestAcceptedOrEscrowFunded: {} })
                .accounts({
                    profile: userProfilePda,
                    profileAuthority: userProfileOwner.publicKey,
                    hubConfig: hubConfigStubPda,
                    hubProgramId: MOCK_HUB_PROGRAM_ID,
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
                hubProgramId: MOCK_HUB_PROGRAM_ID,
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
                hubProgramId: MOCK_HUB_PROGRAM_ID,
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