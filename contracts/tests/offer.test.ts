import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Offer } from "../target/types/offer";
import { Profile } from "../target/types/profile";
import { Price } from "../target/types/price";
import { Hub } from "../target/types/hub";
import { expect } from "chai";
import {
  getHubConfigPda,
  getHubTreasuryPda,
  getProfilePda,
  getPriceRoutePda,
  getDenomPricePda,
  getOfferPda,
  getProgramAuthorityPda
} from "./utils";

// Enum definition mirroring the Rust OfferState (adjust values if needed)
const OfferState = {
  Created: { created: {} },
  Paused: { paused: {} },
  Archived: { archived: {} },
};

describe("offer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const offerProgram = anchor.workspace.Offer as Program<Offer>;
  const profileProgram = anchor.workspace.Profile as Program<Profile>;
  const priceProgram = anchor.workspace.Price as Program<Price>;
  const hubProgram = anchor.workspace.Hub as Program<Hub>;

  const admin = provider.wallet as anchor.Wallet; // Hub admin
  const maker = anchor.web3.Keypair.generate(); // Offer creator
  const nonMaker = anchor.web3.Keypair.generate(); // Someone else
  const oracle = anchor.web3.Keypair.generate(); // Price oracle

  // Offer details
  const offerId = "offer001";
  const denom = "USDC";
  const fiatCurrency = "USD";
  const amount = new anchor.BN(100 * 10 ** 6); // 100 USDC (assuming 6 decimals)
  const pricePremiumBps = 50; // 0.5% above market
  const paymentMethod = "Zelle";
  const paymentDetails = "user@zelle.com";
  let makerContact = "telegram:@initialMaker"; // Initial contact
  const makerBio = "Experienced Trader";

  let hubConfigPda: anchor.web3.PublicKey;
  let priceRoutePda: anchor.web3.PublicKey;
  let denomPricePda: anchor.web3.PublicKey;
  let makerProfilePda: anchor.web3.PublicKey;
  let offerPda: anchor.web3.PublicKey;
  let offerBump: number;
  let offerProgramAuthorityPda: anchor.web3.PublicKey; // Added for CPI

  before(async () => {
    // Fund accounts
    await provider.connection.requestAirdrop(maker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(nonMaker.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(oracle.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Derive PDAs
    [hubConfigPda] = getHubConfigPda(hubProgram.programId);
    [priceRoutePda] = getPriceRoutePda(denom, fiatCurrency, priceProgram.programId);
    [denomPricePda] = getDenomPricePda(denom, fiatCurrency, priceProgram.programId);
    [makerProfilePda] = getProfilePda(maker.publicKey, profileProgram.programId);
    [offerPda, offerBump] = getOfferPda(maker.publicKey, offerId, offerProgram.programId);
    [offerProgramAuthorityPda] = getProgramAuthorityPda(offerProgram.programId); // Get Offer program's authority PDA

    // --- Prerequisites Setup ---
    // 1. Initialize Hub (if not done globally)
    try {
        await hubProgram.account.hubConfig.fetch(hubConfigPda);
    } catch (e) {
        console.log("Initializing Hub...");
        const [hubTreasuryPda] = getHubTreasuryPda(hubProgram.programId);
        // Using BN for fees
        await hubProgram.methods.initialize(new BN(100), new BN(50)).accounts({ hubConfig: hubConfigPda, hubTreasury: hubTreasuryPda, admin: admin.publicKey, systemProgram: anchor.web3.SystemProgram.programId }).rpc();
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 2. Initialize Price Route & Price (if not done globally)
    try {
        await priceProgram.account.denomPrice.fetch(denomPricePda);
    } catch (e) {
        console.log("Initializing Price Route & Price...");
        // Register Route - Added decimals explicitely
        await priceProgram.methods.registerPriceRoute(denom, fiatCurrency, 6, oracle.publicKey).accounts({ priceRoute: priceRoutePda, hubConfig: hubConfigPda, admin: admin.publicKey, systemProgram: anchor.web3.SystemProgram.programId }).rpc();
        await new Promise(resolve => setTimeout(resolve, 500));
        // Update Price
        const price = new anchor.BN(1 * 10 ** 6); // 1 USD = 1.000000 USDC (adjusted price to 1)
        const expo = -6;
        const timestamp = new anchor.BN(Math.floor(Date.now() / 1000)); // Use Math.floor
        await priceProgram.methods.updatePrices(denom, fiatCurrency, price, expo, timestamp).accounts({ priceRoute: priceRoutePda, denomPrice: denomPricePda, authority: oracle.publicKey, systemProgram: anchor.web3.SystemProgram.programId }).signers([oracle]).rpc();
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 3. Initialize Maker Profile (if not done globally)
    try {
        await profileProgram.account.profile.fetch(makerProfilePda);
    } catch(e) {
        console.log("Initializing Maker Profile...");
        await profileProgram.methods.updateProfile(makerContact, makerBio).accounts({ profile: makerProfilePda, owner: maker.publicKey, hubConfig: hubConfigPda, systemProgram: anchor.web3.SystemProgram.programId }).signers([maker]).rpc();
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    // --- End Prerequisites ---

  });

  it("Creates an offer and updates profile via CPI", async () => {
     const initialProfile = await profileProgram.account.profile.fetch(makerProfilePda);
     const initialActiveOffers = initialProfile.activeOffers;

    await offerProgram.methods
      .createOffer(
        offerId,
        denom,
        fiatCurrency,
        amount,
        pricePremiumBps,
        paymentMethod,
        paymentDetails
      )
      .accounts({
        offer: offerPda,
        maker: maker.publicKey,
        makerProfile: makerProfilePda,
        denomPrice: denomPricePda,
        hubConfig: hubConfigPda,
        systemProgram: anchor.web3.SystemProgram.programId,
        // --- CPI Accounts for Profile ---
        profileProgram: profileProgram.programId,
        // profileForCpi is named makerProfile above already
        profileAuthority: offerProgramAuthorityPda, // Offer program's PDA signer
        // Assuming profile program needs owner to validate profile PDA
        profileOwnerForCpi: maker.publicKey,
      })
      .signers([maker]) // Maker must sign
      .rpc();

    const offerAccount = await offerProgram.account.offer.fetch(offerPda);
    expect(offerAccount.maker.equals(maker.publicKey)).to.be.true;
    expect(offerAccount.offerId).to.equal(offerId);
    expect(offerAccount.denom).to.equal(denom);
    expect(offerAccount.fiatCurrency).to.equal(fiatCurrency);
    expect(offerAccount.amount.eq(amount)).to.be.true;
    expect(offerAccount.pricePremiumBps).to.equal(pricePremiumBps);
    expect(offerAccount.paymentMethod).to.equal(paymentMethod);
    expect(offerAccount.paymentDetails).to.equal(paymentDetails);
    expect(JSON.stringify(offerAccount.state)).to.equal(JSON.stringify(OfferState.Created));
    expect(offerAccount.bump).to.equal(offerBump);

    // Assert CPI call to Profile program (check makerProfile account state)
    const updatedProfile = await profileProgram.account.profile.fetch(makerProfilePda);
    expect(updatedProfile.activeOffers).to.equal(initialActiveOffers + 1, "Active offers should increment");
    // Assuming create_offer doesn't update contact, contact should remain initial one
    expect(updatedProfile.contact).to.equal(makerContact, "Contact should not change on create");
  });

  it("Updates an offer and updates profile contact via CPI", async () => {
    const newAmount = new anchor.BN(150 * 10 ** 6); // 150 USDC
    const newPricePremium = 75; // 0.75%
    const newPaymentMethod = "CashApp";
    const newPaymentDetails = "$makerCashTag";
    const newContact = "discord:@newMakerContact"; // New contact info

    // Need to update the maker's profile directly first to set the new contact
    // because Offer program READS contact from Profile, it doesn't push it TO profile.
    // Let's adjust the flow: update profile, then update offer.

    // 1. Update Profile contact first
    await profileProgram.methods.updateProfile(newContact, makerBio) // Update contact
       .accounts({
            profile: makerProfilePda,
            owner: maker.publicKey,
            hubConfig: hubConfigPda,
            systemProgram: anchor.web3.SystemProgram.programId
        })
        .signers([maker])
        .rpc();
     makerContact = newContact; // Update local variable for subsequent checks
     await new Promise(resolve => setTimeout(resolve, 500)); // Allow state change propagation

     const profileBeforeOfferUpdate = await profileProgram.account.profile.fetch(makerProfilePda);
     expect(profileBeforeOfferUpdate.contact).to.equal(newContact); // Verify profile updated


    // 2. Update Offer - This reads the new contact via the makerProfile account
    await offerProgram.methods
      .updateOffer(
        newAmount,
        newPricePremium,
        newPaymentMethod,
        newPaymentDetails
      )
      .accounts({
        offer: offerPda,
        maker: maker.publicKey,
        makerProfile: makerProfilePda, // Pass the updated profile
        // No CPI accounts needed here as Offer reads profile, doesn't call it.
      })
      .signers([maker])
      .rpc();

    const offerAccount = await offerProgram.account.offer.fetch(offerPda);
    expect(offerAccount.amount.eq(newAmount)).to.be.true;
    expect(offerAccount.pricePremiumBps).to.equal(newPricePremium);
    expect(offerAccount.paymentMethod).to.equal(newPaymentMethod);
    expect(offerAccount.paymentDetails).to.equal(newPaymentDetails);

    // Verify Offer has implicitly updated its cached contact by reading the profile
    // (Assuming the Offer program copies the contact from the profile account passed in)
    // This requires checking the internal state or events if Offer caches it,
    // or simply verifying the makerProfile passed in had the correct contact.
    // Since Offer doesn't make a CPI call *to* Profile on update, we just check the offer fields.
  });

  it("Fails to update offer (Non-Maker)", async () => {
    try {
      await offerProgram.methods
        .updateOffer(amount, pricePremiumBps, paymentMethod, paymentDetails)
        .accounts({
          offer: offerPda,
          maker: nonMaker.publicKey, // Wrong maker
          makerProfile: makerProfilePda, // Profile still needs to be passed
        })
        .signers([nonMaker]) // Signed by wrong maker
        .rpc();
      expect.fail("Should have failed with non-maker signature");
    } catch (err) {
      expect(err).to.be.instanceOf(anchor.AnchorError);
      const errorCode = (err as anchor.AnchorError).error.errorCode.code;
      // Check for ConstraintSigner, ConstraintHasOne, MakerMismatch or similar
      expect(["ConstraintSigner", "ConstraintHasOne", "MakerMismatch"]).to.include(errorCode);
      console.log(`Caught expected error updating offer as non-maker: ${errorCode}`);
    }
  });

  it("Updates offer state (Pause) and updates profile via CPI", async () => {
      const initialProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      const initialActiveOffers = initialProfile.activeOffers;
      expect(initialActiveOffers).to.be.greaterThan(0); // Should have 1 from create test

      await offerProgram.methods
        .updateOfferState(OfferState.Paused) // Change state to Paused
        .accounts({
            offer: offerPda,
            maker: maker.publicKey,
            makerProfile: makerProfilePda,
             // --- CPI Accounts for Profile ---
            profileProgram: profileProgram.programId,
            profileAuthority: offerProgramAuthorityPda, // Offer program's PDA signer
            profileOwnerForCpi: maker.publicKey, // Needed by profile program
            hubConfig: hubConfigPda, // Pass hub config if needed by profile program
        })
        .signers([maker])
        .rpc();

      const offerAccount = await offerProgram.account.offer.fetch(offerPda);
      expect(JSON.stringify(offerAccount.state)).to.equal(JSON.stringify(OfferState.Paused));

      // Assert CPI call to Profile program (decrement active offers)
      const updatedProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      expect(updatedProfile.activeOffers).to.equal(initialActiveOffers - 1, "Active offers should decrement on pause");
  });

   it("Updates offer state (Archive) and profile is unchanged (already inactive)", async () => {
      // State is currently Paused from previous test, so active offers count is already decremented.
      const initialProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      const initialActiveOffers = initialProfile.activeOffers;

      await offerProgram.methods
        .updateOfferState(OfferState.Archived) // Change state to Archived
        .accounts({
            offer: offerPda,
            maker: maker.publicKey,
            makerProfile: makerProfilePda,
             // --- CPI Accounts for Profile ---
            // Even though state changes, CPI might be conditional
            profileProgram: profileProgram.programId,
            profileAuthority: offerProgramAuthorityPda,
            profileOwnerForCpi: maker.publicKey,
            hubConfig: hubConfigPda,
        })
        .signers([maker])
        .rpc();

      const offerAccount = await offerProgram.account.offer.fetch(offerPda);
      expect(JSON.stringify(offerAccount.state)).to.equal(JSON.stringify(OfferState.Archived));

      // Assert Profile active offers count hasn't changed again (as it was already inactive)
      const updatedProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      expect(updatedProfile.activeOffers).to.equal(initialActiveOffers, "Active offers should not change from Paused to Archived");
  });

   it("Updates offer state (Re-Create) and updates profile via CPI", async () => {
      // State is currently Archived from previous test.
      const initialProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      const initialActiveOffers = initialProfile.activeOffers;

      await offerProgram.methods
        .updateOfferState(OfferState.Created) // Change state back to Created
        .accounts({
            offer: offerPda,
            maker: maker.publicKey,
            makerProfile: makerProfilePda,
             // --- CPI Accounts for Profile ---
            profileProgram: profileProgram.programId,
            profileAuthority: offerProgramAuthorityPda,
            profileOwnerForCpi: maker.publicKey,
            hubConfig: hubConfigPda,
        })
        .signers([maker])
        .rpc();

      const offerAccount = await offerProgram.account.offer.fetch(offerPda);
      expect(JSON.stringify(offerAccount.state)).to.equal(JSON.stringify(OfferState.Created));

      // Assert Profile active offers count has incremented again
      const updatedProfile = await profileProgram.account.profile.fetch(makerProfilePda);
      expect(updatedProfile.activeOffers).to.equal(initialActiveOffers + 1, "Active offers should increment on re-creation");
  });

  it("Fails to update offer state (Non-Maker)", async () => {
    try {
      await offerProgram.methods
        .updateOfferState(OfferState.Paused)
        .accounts({
            offer: offerPda,
            maker: nonMaker.publicKey, // Wrong maker
            makerProfile: makerProfilePda,
            // CPI accounts might still be required by instruction structure
            profileProgram: profileProgram.programId,
            profileAuthority: offerProgramAuthorityPda,
            profileOwnerForCpi: maker.publicKey,
            hubConfig: hubConfigPda,
        })
        .signers([nonMaker])
        .rpc();
       expect.fail("Should have failed with non-maker signature for state update");
    } catch (err) {
       expect(err).to.be.instanceOf(anchor.AnchorError);
       const errorCode = (err as anchor.AnchorError).error.errorCode.code;
       expect(["ConstraintSigner", "ConstraintHasOne", "MakerMismatch"]).to.include(errorCode);
       console.log(`Caught expected error updating offer state as non-maker: ${errorCode}`);
    }
  });

}); 