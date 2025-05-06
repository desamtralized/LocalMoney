import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
// Import types for the actual programs
import { LocalmoneyOffer } from "../target/types/localmoney_offer";
import { LocalmoneyProfile } from "../target/types/localmoney_profile";

describe("LocalMoney Offer and Profile Tests (M3)", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Correctly reference the programs from the workspace
  const programOffer = anchor.workspace.LocalmoneyOffer as Program<LocalmoneyOffer>;
  const programProfile = anchor.workspace.LocalmoneyProfile as Program<LocalmoneyProfile>;

  // Placeholder for PDA addresses and other test constants
  let hubAdmin: anchor.web3.Keypair;
  let user1: anchor.web3.Keypair;
  let hubConfigPda: anchor.web3.PublicKey;
  let offerConfigPda: anchor.web3.PublicKey;
  let profileConfigPda: anchor.web3.PublicKey;
  // Add other PDAs as needed, e.g., user1ProfilePda

  before(async () => {
    // Initialize keypairs or load them
    hubAdmin = anchor.web3.Keypair.generate(); // Or load from a file if persistent
    user1 = anchor.web3.Keypair.generate();

    // Airdrop SOL to payers if needed (e.g., for account initialization)
    // await provider.connection.requestAirdrop(hubAdmin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    // await provider.connection.requestAirdrop(user1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    
    // Derive PDA addresses (example for hub, adapt for offer/profile)
    // [hubConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
    //   [Buffer.from("hub")], // Use the correct seeds for hub program
    //   programHub.programId // Assuming a programHub exists and is imported
    // );

    [offerConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("offer-config")],
      programOffer.programId
    );

    [profileConfigPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("profile-config")],
      programProfile.programId
    );

    // Add console logs for pubkeys to help with debugging
    console.log(`Hub Admin: ${hubAdmin.publicKey.toBase58()}`);
    console.log(`User 1: ${user1.publicKey.toBase58()}`);
    console.log(`Offer Program ID: ${programOffer.programId.toBase58()}`);
    console.log(`Profile Program ID: ${programProfile.programId.toBase58()}`);
    console.log(`Offer Config PDA: ${offerConfigPda.toBase58()}`);
    console.log(`Profile Config PDA: ${profileConfigPda.toBase58()}`);
  });

  it("Initializes the Profile program config", async () => {
    try {
      const tx = await programProfile.methods
        .initialize()
        .accounts({
          payer: provider.wallet.publicKey, // Assuming provider.wallet is the payer
          profileConfig: profileConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("Profile program initialized, transaction signature:", tx);
    } catch (error) {
      console.error("Failed to initialize Profile program:", error);
      throw error;
    }
  });

  it("Initializes the Offer program config", async () => {
    try {
      const tx = await programOffer.methods
        .initialize()
        .accounts({
          payer: provider.wallet.publicKey, // Assuming provider.wallet is the payer
          offerConfig: offerConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("Offer program initialized, transaction signature:", tx);
    } catch (error) {
      console.error("Failed to initialize Offer program:", error);
      throw error;
    }
  });

  // TODO: Add more tests for M3:
  // - Profile: register_hub, update_contact
  // - Offer: register_hub, create_offer, update_offer
  // - CPI tests between Offer and Profile

  // Example structure for a create_offer test (needs more details)
  /*
  it("User creates an offer", async () => {
    // Ensure Profile program is registered with a Hub first, and Offer program too.
    // Derive user_profile PDA for user1
    const [user1ProfilePda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("profile"), user1.publicKey.toBuffer()],
      programProfile.programId
    );

    // This is a simplified call, ensure all required accounts are present
    // and that dependent initializations (like Hub registration) have occurred.
    const offerId = new anchor.BN(0); // Assuming first offer

    try {
      const tx = await programOffer.methods
        .create(
          0, // offer_type (e.g., buy)
          "USD", // fiat_currency
          new anchor.BN(1000), // rate
          "SOL", // denom
          new anchor.BN(10), // min_amount
          new anchor.BN(100), // max_amount
          "Test offer description", // description
          "user1_contact_info", // owner_contact
          "user1_encryption_key" // owner_encryption_key
        )
        .accounts({
          owner: user1.publicKey,
          offerConfig: offerConfigPda,
          // The 'offer' account PDA needs to be derived correctly based on offer_id from offer_config
          // offer: derivedOfferPda, 
          profileProgram: programProfile.programId,
          userProfile: user1ProfilePda,
          // profileConfigAccount and hubConfigAccount also need to be valid PDAs/accounts
          // profileConfigAccount: profileConfigPda, 
          // hubConfigAccount: someHubConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user1]) // user1 needs to sign as the owner
        .rpc();
      console.log("Create offer transaction signature:", tx);
    } catch (error) {
      console.error("Failed to create offer:", error);
      // Log account details if helpful
      // console.log("User1 Profile PDA:", user1ProfilePda.toBase58());
      throw error;
    }
  });
  */
});
