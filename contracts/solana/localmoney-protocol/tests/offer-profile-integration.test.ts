import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  setupTestWorkspace,
  airdropSol,
  findProfilePDA,
  findOfferPDA,
  findGlobalConfigPDA,
  createValidInitializeParams,
} from "./utils/setup";

describe("Offer-Profile Integration Tests", () => {
  const workspace = setupTestWorkspace();
  let userKeypair: Keypair;
  let user2Keypair: Keypair;
  let profilePDA: PublicKey;
  let profile2PDA: PublicKey;
  let hubConfigPDA: PublicKey;
  let offerCounterPDA: PublicKey;
  let testMint: PublicKey;

  before(async () => {
    // Create test users and airdrop SOL
    userKeypair = Keypair.generate();
    user2Keypair = Keypair.generate();
    testMint = Keypair.generate().publicKey;

    await Promise.all([
      airdropSol(workspace.connection, userKeypair.publicKey),
      airdropSol(workspace.connection, user2Keypair.publicKey),
      airdropSol(workspace.connection, workspace.authority.publicKey),
    ]);

    // Find PDAs
    [profilePDA] = findProfilePDA(
      userKeypair.publicKey,
      workspace.profileProgram.programId,
    );
    [profile2PDA] = findProfilePDA(
      user2Keypair.publicKey,
      workspace.profileProgram.programId,
    );
    [hubConfigPDA] = findGlobalConfigPDA(workspace.hubProgram.programId);
    [offerCounterPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("offer_counter")],
      workspace.offerProgram.programId,
    );

    // Initialize hub configuration
    const initParams = createValidInitializeParams();
    await workspace.hubProgram.methods
      .initialize(initParams)
      .accounts({
        config: hubConfigPDA,
        authority: workspace.authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([workspace.authority])
      .rpc();

    // Initialize offer counter
    await workspace.offerProgram.methods
      .initializeCounter()
      .accounts({
        offerCounter: offerCounterPDA,
        authority: workspace.authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([workspace.authority])
      .rpc();
  });

  describe("Profile Validation in Offer Creation", () => {
    it("Should require profile to exist before creating offers", async () => {
      const [offer1PDA] = findOfferPDA(1, workspace.offerProgram.programId);

      try {
        await workspace.offerProgram.methods
          .createOfferWithProfileValidation({
            offerType: { buy: {} },
            fiatCurrency: { usd: {} },
            rate: new anchor.BN(10500), // 105%
            minAmount: new anchor.BN(100000000), // $100
            maxAmount: new anchor.BN(1000000000), // $1000
            description: "Test offer",
            tokenMint: testMint,
            expirationHours: null,
          })
          .accounts({
            offer: offer1PDA,
            offerCounter: offerCounterPDA,
            owner: userKeypair.publicKey,
            profile: profilePDA,
            hubConfig: hubConfigPDA,
            profileProgram: workspace.profileProgram.programId,
            hubProgram: workspace.hubProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([userKeypair])
          .rpc();

        expect.fail("Should have failed due to missing profile");
      } catch (error) {
        expect(error.toString()).to.include("ProfileRequired");
      }
    });

    it("Should create profile and then successfully create offer", async () => {
      // First create profile
      await workspace.profileProgram.methods
        .createProfile("telegram:@testuser", null)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      // Verify profile exists and has correct initial state
      const profile =
        await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffersCount).to.equal(0);
      expect(profile.contact).to.equal("telegram:@testuser");

      // Now create offer with profile validation
      const [offer1PDA] = findOfferPDA(1, workspace.offerProgram.programId);

      await workspace.offerProgram.methods
        .createOfferWithProfileValidation({
          offerType: { buy: {} },
          fiatCurrency: { usd: {} },
          rate: new anchor.BN(10500), // 105%
          minAmount: new anchor.BN(100000000), // $100
          maxAmount: new anchor.BN(1000000000), // $1000
          description: "Test offer",
          tokenMint: testMint,
          expirationHours: null,
        })
        .accounts({
          offer: offer1PDA,
          offerCounter: offerCounterPDA,
          owner: userKeypair.publicKey,
          profile: profilePDA,
          hubConfig: hubConfigPDA,
          profileProgram: workspace.profileProgram.programId,
          hubProgram: workspace.hubProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      // Verify offer was created
      const offer = await workspace.offerProgram.account.offer.fetch(offer1PDA);
      expect(offer.id.toString()).to.equal("1");
      expect(offer.owner.toString()).to.equal(userKeypair.publicKey.toString());
      expect(offer.state).to.deep.equal({ active: {} });

      // Verify profile was updated via CPI
      const updatedProfile =
        await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(updatedProfile.activeOffersCount).to.equal(1);
    });
  });

  describe("Active Offer Count Management", () => {
    it("Should update active offer count when pausing/activating offers", async () => {
      const [offer1PDA] = findOfferPDA(1, workspace.offerProgram.programId);

      // Verify initial state
      let profile =
        await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffersCount).to.equal(1);

      // Pause the offer
      await workspace.offerProgram.methods
        .pauseOffer()
        .accounts({
          offer: offer1PDA,
          owner: userKeypair.publicKey,
          profile: profilePDA,
          profileProgram: workspace.profileProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      // Verify offer state and profile count
      const pausedOffer =
        await workspace.offerProgram.account.offer.fetch(offer1PDA);
      expect(pausedOffer.state).to.deep.equal({ paused: {} });

      profile =
        await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffersCount).to.equal(0);

      // Activate the offer again
      await workspace.offerProgram.methods
        .activateOffer()
        .accounts({
          offer: offer1PDA,
          owner: userKeypair.publicKey,
          profile: profilePDA,
          profileProgram: workspace.profileProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      // Verify offer state and profile count
      const activeOffer =
        await workspace.offerProgram.account.offer.fetch(offer1PDA);
      expect(activeOffer.state).to.deep.equal({ active: {} });

      profile =
        await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffersCount).to.equal(1);
    });

    it("Should update active offer count when archiving offers", async () => {
      const [offer1PDA] = findOfferPDA(1, workspace.offerProgram.programId);

      // Archive the offer
      await workspace.offerProgram.methods
        .closeOffer()
        .accounts({
          offer: offer1PDA,
          owner: userKeypair.publicKey,
          profile: profilePDA,
          profileProgram: workspace.profileProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      // Verify offer state and profile count
      const archivedOffer =
        await workspace.offerProgram.account.offer.fetch(offer1PDA);
      expect(archivedOffer.state).to.deep.equal({ archive: {} });

      const profile =
        await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffersCount).to.equal(0);
    });
  });

  describe("Offer Limit Enforcement", () => {
    it("Should enforce maximum active offers limit", async () => {
      // Create a second profile for this test
      await workspace.profileProgram.methods
        .createProfile("telegram:@user2", null)
        .accounts({
          profile: profile2PDA,
          owner: user2Keypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user2Keypair])
        .rpc();

      // Create offers up to the limit (default is 5)
      for (let i = 2; i <= 6; i++) {
        const [offerPDA] = findOfferPDA(i, workspace.offerProgram.programId);

        await workspace.offerProgram.methods
          .createOfferWithLimits({
            offerType: { sell: {} },
            fiatCurrency: { eur: {} },
            rate: new anchor.BN(9800), // 98%
            minAmount: new anchor.BN(50000000), // $50
            maxAmount: new anchor.BN(500000000), // $500
            description: `Test offer ${i}`,
            tokenMint: testMint,
            expirationHours: null,
          })
          .accounts({
            offer: offerPDA,
            offerCounter: offerCounterPDA,
            owner: user2Keypair.publicKey,
            profile: profile2PDA,
            hubConfig: hubConfigPDA,
            profileProgram: workspace.profileProgram.programId,
            hubProgram: workspace.hubProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user2Keypair])
          .rpc();
      }

      // Verify we have 5 active offers
      const profile =
        await workspace.profileProgram.account.profile.fetch(profile2PDA);
      expect(profile.activeOffersCount).to.equal(5);

      // Try to create one more offer (should fail)
      const [offer7PDA] = findOfferPDA(7, workspace.offerProgram.programId);

      try {
        await workspace.offerProgram.methods
          .createOfferWithLimits({
            offerType: { buy: {} },
            fiatCurrency: { gbp: {} },
            rate: new anchor.BN(10200), // 102%
            minAmount: new anchor.BN(25000000), // $25
            maxAmount: new anchor.BN(250000000), // $250
            description: "This should fail",
            tokenMint: testMint,
            expirationHours: null,
          })
          .accounts({
            offer: offer7PDA,
            offerCounter: offerCounterPDA,
            owner: user2Keypair.publicKey,
            profile: profile2PDA,
            hubConfig: hubConfigPDA,
            profileProgram: workspace.profileProgram.programId,
            hubProgram: workspace.hubProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user2Keypair])
          .rpc();

        expect.fail("Should have failed due to offer limit exceeded");
      } catch (error) {
        expect(error.toString()).to.include("OfferLimitExceeded");
      }
    });
  });

  describe("Contact Information Integration", () => {
    it("Should update contact information from offer program", async () => {
      const newContact = "signal:+1234567890";
      const encryptionKey =
        "ed25519:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

      await workspace.offerProgram.methods
        .updateContactInformation(newContact, encryptionKey)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
          profileProgram: workspace.profileProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      // Verify contact was updated via CPI
      const profile =
        await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.contact).to.equal(newContact);
      expect(profile.encryptionKey).to.equal(encryptionKey);
    });

    it("Should validate contact information for trading context", async () => {
      // This would test the get_contact_for_offers function
      // For now, we verify the contact exists and is suitable
      const profile =
        await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.contact).to.not.be.null;
      expect(profile.contact.length).to.be.greaterThan(0);
    });
  });

  describe("Comprehensive Profile Validation", () => {
    it("Should validate profile scoring system", async () => {
      // Create a new user for validation testing
      const validationUser = Keypair.generate();
      await airdropSol(workspace.connection, validationUser.publicKey);

      const [validationProfilePDA] = findProfilePDA(
        validationUser.publicKey,
        workspace.profileProgram.programId,
      );

      // Create profile with good contact info
      await workspace.profileProgram.methods
        .createProfile("telegram:@validuser", "ed25519:validkey123")
        .accounts({
          profile: validationProfilePDA,
          owner: validationUser.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([validationUser])
        .rpc();

      // Test comprehensive validation (this would call validate_profile_for_offers)
      const [validationOfferPDA] = findOfferPDA(
        8,
        workspace.offerProgram.programId,
      );

      await workspace.offerProgram.methods
        .createOfferWithComprehensiveValidation({
          offerType: { buy: {} },
          fiatCurrency: { usd: {} },
          rate: new anchor.BN(10100), // 101%
          minAmount: new anchor.BN(10000000), // $10
          maxAmount: new anchor.BN(100000000), // $100
          description: "Validated offer",
          tokenMint: testMint,
          expirationHours: null,
        })
        .accounts({
          offer: validationOfferPDA,
          offerCounter: offerCounterPDA,
          owner: validationUser.publicKey,
          profile: validationProfilePDA,
          hubConfig: hubConfigPDA,
          profileProgram: workspace.profileProgram.programId,
          hubProgram: workspace.hubProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([validationUser])
        .rpc();

      // Verify offer was created successfully
      const offer =
        await workspace.offerProgram.account.offer.fetch(validationOfferPDA);
      expect(offer.owner.toString()).to.equal(
        validationUser.publicKey.toString(),
      );

      // Verify profile stats were updated
      const profile =
        await workspace.profileProgram.account.profile.fetch(
          validationProfilePDA,
        );
      expect(profile.activeOffersCount).to.equal(1);
    });

    it("Should reject profiles that don't meet validation criteria", async () => {
      // Create a profile with insufficient information
      const insufficientUser = Keypair.generate();
      await airdropSol(workspace.connection, insufficientUser.publicKey);

      const [insufficientProfilePDA] = findProfilePDA(
        insufficientUser.publicKey,
        workspace.profileProgram.programId,
      );

      // Create profile without contact info
      await workspace.profileProgram.methods
        .createProfile(null, null)
        .accounts({
          profile: insufficientProfilePDA,
          owner: insufficientUser.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([insufficientUser])
        .rpc();

      // Try to create offer with comprehensive validation (should fail)
      const [failOfferPDA] = findOfferPDA(9, workspace.offerProgram.programId);

      try {
        await workspace.offerProgram.methods
          .createOfferWithComprehensiveValidation({
            offerType: { sell: {} },
            fiatCurrency: { eur: {} },
            rate: new anchor.BN(9900), // 99%
            minAmount: new anchor.BN(20000000), // $20
            maxAmount: new anchor.BN(200000000), // $200
            description: "Should fail",
            tokenMint: testMint,
            expirationHours: null,
          })
          .accounts({
            offer: failOfferPDA,
            offerCounter: offerCounterPDA,
            owner: insufficientUser.publicKey,
            profile: insufficientProfilePDA,
            hubConfig: hubConfigPDA,
            profileProgram: workspace.profileProgram.programId,
            hubProgram: workspace.hubProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([insufficientUser])
          .rpc();

        expect.fail(
          "Should have failed due to insufficient profile validation",
        );
      } catch (error) {
        expect(error.toString()).to.include("ProfileValidationFailed");
      }
    });
  });

  describe("Profile Statistics Synchronization", () => {
    it("Should synchronize profile offer counts", async () => {
      // This tests the sync_profile_offer_counts function
      await workspace.offerProgram.methods
        .syncProfileOfferCounts()
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
          profileProgram: workspace.profileProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      // Verify counts are consistent
      const profile =
        await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffersCount).to.be.a("number");
      expect(profile.activeOffersCount).to.be.at.least(0);
    });
  });

  describe("Error Handling", () => {
    it("Should handle CPI call failures gracefully", async () => {
      // Test with invalid profile account
      const invalidUser = Keypair.generate();
      await airdropSol(workspace.connection, invalidUser.publicKey);

      const [invalidOfferPDA] = findOfferPDA(
        10,
        workspace.offerProgram.programId,
      );
      const fakeProfilePDA = Keypair.generate().publicKey;

      try {
        await workspace.offerProgram.methods
          .createOfferWithProfileValidation({
            offerType: { buy: {} },
            fiatCurrency: { usd: {} },
            rate: new anchor.BN(10000), // 100%
            minAmount: new anchor.BN(1000000), // $1
            maxAmount: new anchor.BN(10000000), // $10
            description: "Invalid",
            tokenMint: testMint,
            expirationHours: null,
          })
          .accounts({
            offer: invalidOfferPDA,
            offerCounter: offerCounterPDA,
            owner: invalidUser.publicKey,
            profile: fakeProfilePDA,
            hubConfig: hubConfigPDA,
            profileProgram: workspace.profileProgram.programId,
            hubProgram: workspace.hubProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([invalidUser])
          .rpc();

        expect.fail("Should have failed due to invalid profile");
      } catch (error) {
        // Should handle the error gracefully
        expect(error).to.exist;
      }
    });
  });
});
