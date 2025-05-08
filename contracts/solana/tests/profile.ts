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

    let profileGlobalStatePda: anchor.web3.PublicKey;
    let profileGlobalStateBump: number;
    let userProfilePda: anchor.web3.PublicKey;
    let userProfileBump: number;

    // Placeholder for HubConfigStub PDA if it's managed by a mock Hub program
    // let hubConfigStubPda: anchor.web3.PublicKey;
    // let hubConfigStubBump: number;

    before(async () => {
        // Airdrop SOL
        await provider.connection.requestAirdrop(authority.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(userProfileOwner.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        // await provider.connection.requestAirdrop(hubAdmin.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
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
        // [hubConfigStubPda, hubConfigStubBump] = anchor.web3.PublicKey.findProgramAddressSync(
        //     [Buffer.from("hub")], // Assuming seed "hub" as in profile/src/lib.rs
        //     MOCK_HUB_PROGRAM_ID
        // );
        // We would also need to initialize this HubConfigStub account with some values.
        // This might involve deploying a minimal mock Hub program or using a script.
        // For now, tests requiring HubConfig (like update_active_offers) will be harder to set up
        // without this infrastructure.
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

    // TODO: Tests for update_active_offers and update_trades_count.
    // These will require a mock/stub HubConfig account to be initialized and passed.
    // This involves setting up the HubConfigStub PDA with appropriate limits.

    // Example structure for update_active_offers test (needs HubConfig setup):
    /*
    it("Updates Active Offers Count", async () => {
        // 1. Initialize HubConfigStub with active_offers_limit (e.g., 5)
        // This might need a separate script or a mock hub program method if complex.
        // Or, if HubConfigStub is simple enough, directly create & write to its account.

        // Assume hubConfigStubPda is initialized and MOCK_HUB_PROGRAM_ID is its program ID

        await program.methods
            .updateActiveOffers({ increment: {} }) // or CounterAction.Increment depending on IDL
            .accounts({
                profile: userProfilePda,
                profileAuthority: userProfileOwner.publicKey,
                hubConfig: hubConfigStubPda, 
                hubProgramId: MOCK_HUB_PROGRAM_ID, // The program ID for HubConfigStub's PDA
                profileGlobalState: profileGlobalStatePda,
            })
            // .signers([userProfileOwner]) // Signer depends on how authorization is set up (e.g. CPI from Offer program)
            .rpc();
        
        const profileAccount = await program.account.profile.fetch(userProfilePda);
        assert.equal(profileAccount.activeOffersCount, 1);
    });
    */

    // TODO: Add tests for failure cases
}); 