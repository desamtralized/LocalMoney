import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { setupTestWorkspace, airdropSol, findProfilePDA, findGlobalConfigPDA, createValidInitializeParams } from "./utils/setup";

describe("Profile Program - Comprehensive Tests", () => {
  const workspace = setupTestWorkspace();
  let userKeypair: Keypair;
  let user2Keypair: Keypair;
  let profilePDA: anchor.web3.PublicKey;
  let profile2PDA: anchor.web3.PublicKey;
  let profileBump: number;
  let hubConfigPDA: anchor.web3.PublicKey;
  let hubConfigBump: number;

  before(async () => {
    // Create test users and airdrop SOL
    userKeypair = Keypair.generate();
    user2Keypair = Keypair.generate();
    await Promise.all([
      airdropSol(workspace.connection, userKeypair.publicKey),
      airdropSol(workspace.connection, user2Keypair.publicKey),
      airdropSol(workspace.connection, workspace.authority.publicKey)
    ]);

    // Find profile PDAs
    [profilePDA, profileBump] = findProfilePDA(userKeypair.publicKey, workspace.profileProgram.programId);
    [profile2PDA] = findProfilePDA(user2Keypair.publicKey, workspace.profileProgram.programId);

    // Find hub config PDA and initialize hub
    [hubConfigPDA, hubConfigBump] = findGlobalConfigPDA(workspace.hubProgram.programId);

    // Initialize hub configuration for testing
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
  });

  describe("Profile Creation Tests", () => {
    it("Should create a profile with minimal information", async () => {
      await workspace.profileProgram.methods
        .createProfile(null, null)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);

      expect(profile.owner.toString()).to.equal(userKeypair.publicKey.toString());
      expect(profile.contact).to.be.null;
      expect(profile.encryptionKey).to.be.null;
      expect(profile.activeOffersCount).to.equal(0);
      expect(profile.activeTradesCount).to.equal(0);
      expect(profile.requestedTradesCount.toString()).to.equal("0");
      expect(profile.releasedTradesCount.toString()).to.equal("0");
      expect(profile.reputationScore).to.equal(0);
      expect(profile.createdAt.toString()).to.not.equal("0");
      expect(profile.lastTrade.toString()).to.equal("0");
      expect(profile.bump).to.equal(profileBump);
    });

    it("Should create a profile with full contact information", async () => {
      const contact = "telegram:@user123";
      const encryptionKey = "ed25519:abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab";

      await workspace.profileProgram.methods
        .createProfile(contact, encryptionKey)
        .accounts({
          profile: profile2PDA,
          owner: user2Keypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user2Keypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profile2PDA);

      expect(profile.owner.toString()).to.equal(user2Keypair.publicKey.toString());
      expect(profile.contact).to.equal(contact);
      expect(profile.encryptionKey).to.equal(encryptionKey);
    });

    it("Should reject invalid contact information", async () => {
      const invalidUser = Keypair.generate();
      const [invalidProfilePDA] = findProfilePDA(invalidUser.publicKey, workspace.profileProgram.programId);
      await airdropSol(workspace.connection, invalidUser.publicKey);

      // Test with contact too long (over 140 characters)
      const longContact = "a".repeat(141);

      try {
        await workspace.profileProgram.methods
          .createProfile(longContact, null)
          .accounts({
            profile: invalidProfilePDA,
            owner: invalidUser.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([invalidUser])
          .rpc();
        expect.fail("Should have rejected long contact");
      } catch (error) {
        expect(error.toString()).to.include("ContactTooLong");
      }
    });

    it("Should reject invalid encryption key format", async () => {
      const invalidUser = Keypair.generate();
      const [invalidProfilePDA] = findProfilePDA(invalidUser.publicKey, workspace.profileProgram.programId);
      await airdropSol(workspace.connection, invalidUser.publicKey);

      // Test with invalid encryption key format
      const invalidEncryptionKey = "not-a-valid-key";

      try {
        await workspace.profileProgram.methods
          .createProfile("contact", invalidEncryptionKey)
          .accounts({
            profile: invalidProfilePDA,
            owner: invalidUser.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([invalidUser])
          .rpc();
        expect.fail("Should have rejected invalid encryption key");
      } catch (error) {
        expect(error.toString()).to.include("InvalidEncryptionKey");
      }
    });

    it("Should reject duplicate profile creation", async () => {
      try {
        await workspace.profileProgram.methods
          .createProfile("New contact", null)
          .accounts({
            profile: profilePDA,
            owner: userKeypair.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([userKeypair])
          .rpc();
        expect.fail("Should have failed with duplicate profile");
      } catch (error) {
        expect(error.toString()).to.include("already in use");
      }
    });
  });

  describe("Contact Update Tests", () => {
    it("Should update contact information successfully", async () => {
      const newContact = "telegram:@updated_user";
      const newEncryptionKey = "ed25519:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

      await workspace.profileProgram.methods
        .updateContact(newContact, newEncryptionKey)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.contact).to.equal(newContact);
      expect(profile.encryptionKey).to.equal(newEncryptionKey);
    });

    it("Should clear contact information", async () => {
      await workspace.profileProgram.methods
        .updateContact(null, null)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.contact).to.be.null;
      expect(profile.encryptionKey).to.be.null;
    });

    it("Should reject contact update from unauthorized user", async () => {
      const unauthorizedUser = Keypair.generate();
      await airdropSol(workspace.connection, unauthorizedUser.publicKey);

      try {
        await workspace.profileProgram.methods
          .updateContact("Unauthorized update", null)
          .accounts({
            profile: profilePDA,
            owner: unauthorizedUser.publicKey,
          })
          .signers([unauthorizedUser])
          .rpc();
        expect.fail("Should have failed with unauthorized access");
      } catch (error) {
        expect(error.toString()).to.include("ConstraintHasOne");
      }
    });
  });

  describe("Trade Statistics Tests", () => {
    it("Should increment requested trades count", async () => {
      await workspace.profileProgram.methods
        .updateTradeStats({ requestedTrades: {} }, true)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.requestedTradesCount.toString()).to.equal("1");
    });

    it("Should increment active trades count", async () => {
      await workspace.profileProgram.methods
        .updateTradeStats({ activeTrades: {} }, true)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeTradesCount).to.equal(1);
    });

    it("Should decrement active trades count", async () => {
      await workspace.profileProgram.methods
        .updateTradeStats({ activeTrades: {} }, false)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeTradesCount).to.equal(0);
    });

    it("Should increment released trades and update last trade timestamp", async () => {
      const beforeTime = Math.floor(Date.now() / 1000);

      await workspace.profileProgram.methods
        .updateTradeStats({ releasedTrades: {} }, true)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.releasedTradesCount.toString()).to.equal("1");
      expect(parseInt(profile.lastTrade.toString())).to.be.at.least(beforeTime);
    });

    it("Should prevent negative active trades count", async () => {
      // Try to decrement when already at 0
      await workspace.profileProgram.methods
        .updateTradeStats({ activeTrades: {} }, false)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeTradesCount).to.equal(0); // Should remain 0
    });
  });

  describe("Offer Statistics Tests", () => {
    it("Should increment active offers count", async () => {
      await workspace.profileProgram.methods
        .updateOfferStats(true)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffersCount).to.equal(1);
    });

    it("Should decrement active offers count", async () => {
      await workspace.profileProgram.methods
        .updateOfferStats(false)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffersCount).to.equal(0);
    });

    it("Should prevent negative active offers count", async () => {
      // Try to decrement when already at 0
      await workspace.profileProgram.methods
        .updateOfferStats(false)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffersCount).to.equal(0); // Should remain 0
    });
  });

  describe("Reputation Management Tests", () => {
    it("Should update reputation for completed trade", async () => {
      const initialProfile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      const initialReputation = initialProfile.reputationScore;

      await workspace.profileProgram.methods
        .updateReputation({ tradeCompleted: {} })
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.reputationScore).to.be.greaterThan(initialReputation);
    });

    it("Should handle reputation for disputed trade", async () => {
      const initialProfile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      const initialReputation = initialProfile.reputationScore;

      await workspace.profileProgram.methods
        .updateReputation({ tradeDisputed: {} })
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      // Reputation should either stay same or decrease for disputed trades
      expect(profile.reputationScore).to.be.at.most(initialReputation);
    });

    it("Should update reputation for fast response", async () => {
      const initialProfile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      const initialReputation = initialProfile.reputationScore;

      await workspace.profileProgram.methods
        .updateReputation({ fastResponse: {} })
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.reputationScore).to.be.greaterThan(initialReputation);
    });
  });

  describe("Activity Validation Tests", () => {
    it("Should validate activity limits successfully", async () => {
      // This should pass since we're within limits
      await workspace.profileProgram.methods
        .validateActivityLimits(1, 1)
        .accounts({
          profile: profilePDA,
          hubProgram: workspace.hubProgram.programId,
          hubConfig: hubConfigPDA,
          profileProgram: workspace.profileProgram.programId,
        })
        .rpc();
    });

    it("Should check if user can create offer", async () => {
      const result = await workspace.profileProgram.methods
        .canCreateOffer()
        .accounts({
          profile: profilePDA,
          hubProgram: workspace.hubProgram.programId,
          hubConfig: hubConfigPDA,
          profileProgram: workspace.profileProgram.programId,
        })
        .rpc();

      // Should return true since user is within limits
      expect(result).to.be.true;
    });

    it("Should check if user can create trade", async () => {
      const result = await workspace.profileProgram.methods
        .canCreateTrade()
        .accounts({
          profile: profilePDA,
          hubProgram: workspace.hubProgram.programId,
          hubConfig: hubConfigPDA,
          profileProgram: workspace.profileProgram.programId,
        })
        .rpc();

      // Should return true since user is within limits
      expect(result).to.be.true;
    });
  });

  describe("Profile Query Tests", () => {
    it("Should get reputation tier correctly", async () => {
      const reputationTier = await workspace.profileProgram.methods
        .getReputationTier()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      // With low reputation score, should be Newcomer
      expect(reputationTier.toString()).to.include("newcomer");
    });

    it("Should get reputation metrics", async () => {
      const metrics = await workspace.profileProgram.methods
        .getReputationMetrics()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(metrics).to.have.property('score');
      expect(metrics).to.have.property('tier');
      expect(metrics).to.have.property('completionRate');
      expect(metrics).to.have.property('totalTrades');
    });

    it("Should get profile info", async () => {
      const profileInfo = await workspace.profileProgram.methods
        .getProfileInfo()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(profileInfo.owner.toString()).to.equal(userKeypair.publicKey.toString());
      expect(profileInfo).to.have.property('createdAt');
      expect(profileInfo).to.have.property('reputationScore');
      expect(profileInfo).to.have.property('reputationTier');
    });

    it("Should get trading stats", async () => {
      const tradingStats = await workspace.profileProgram.methods
        .getTradingStats()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(tradingStats).to.have.property('requestedTradesCount');
      expect(tradingStats).to.have.property('activeTradesCount');
      expect(tradingStats).to.have.property('releasedTradesCount');
      expect(tradingStats).to.have.property('activeOffersCount');
      expect(tradingStats).to.have.property('completionRate');
    });

    it("Should check if profile exists", async () => {
      const exists = await workspace.profileProgram.methods
        .profileExists()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(exists).to.be.true;
    });

    it("Should get activity summary", async () => {
      const activitySummary = await workspace.profileProgram.methods
        .getActivitySummary()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(activitySummary).to.have.property('daysSinceCreation');
      expect(activitySummary).to.have.property('daysSinceLastTrade');
      expect(activitySummary).to.have.property('totalActivityScore');
      expect(activitySummary).to.have.property('isActive');
      expect(activitySummary).to.have.property('activityLevel');
    });

    it("Should get contact info", async () => {
      const contactInfo = await workspace.profileProgram.methods
        .getContactInfo()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(contactInfo).to.have.property('contact');
      expect(contactInfo).to.have.property('encryptionKey');
      expect(contactInfo).to.have.property('hasContact');
      expect(contactInfo).to.have.property('hasEncryptionKey');
    });
  });

  describe("Advanced Analytics Tests", () => {
    it("Should get profile statistics", async () => {
      const statistics = await workspace.profileProgram.methods
        .getProfileStatistics()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(statistics).to.have.property('totalTradesRequested');
      expect(statistics).to.have.property('totalTradesCompleted');
      expect(statistics).to.have.property('completionRate');
      expect(statistics).to.have.property('reputationScore');
      expect(statistics).to.have.property('reputationTier');
      expect(statistics).to.have.property('activityLevel');
      expect(statistics).to.have.property('profileCompleteness');
    });

    it("Should get trading performance", async () => {
      const performance = await workspace.profileProgram.methods
        .getTradingPerformance()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(performance).to.have.property('totalTrades');
      expect(performance).to.have.property('completedTrades');
      expect(performance).to.have.property('completionRate');
      expect(performance).to.have.property('performanceTier');
      expect(performance).to.have.property('traderType');
    });

    it("Should get activity analytics", async () => {
      const analytics = await workspace.profileProgram.methods
        .getActivityAnalytics()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(analytics).to.have.property('accountAgeDays');
      expect(analytics).to.have.property('engagementScore');
      expect(analytics).to.have.property('activityPattern');
      expect(analytics).to.have.property('trendDirection');
      expect(analytics).to.have.property('churnRisk');
    });

    it("Should get profile health", async () => {
      const health = await workspace.profileProgram.methods
        .getProfileHealth()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(health).to.have.property('overallScore');
      expect(health).to.have.property('healthStatus');
      expect(health).to.have.property('completenessScore');
      expect(health).to.have.property('activityHealth');
      expect(health).to.have.property('reputationHealth');
      expect(health).to.have.property('securityScore');
      expect(health).to.have.property('recommendations');
    });
  });

  describe("Security and Encryption Tests", () => {
    it("Should validate contact encryption status", async () => {
      const encryptionStatus = await workspace.profileProgram.methods
        .validateContactEncryption()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(encryptionStatus).to.have.property('hasContact');
      expect(encryptionStatus).to.have.property('appearsEncrypted');
      expect(encryptionStatus).to.have.property('hasEncryptionKey');
      expect(encryptionStatus).to.have.property('isProperlyConfigured');
      expect(encryptionStatus).to.have.property('recommendation');
    });

    it("Should get encryption recommendations", async () => {
      const recommendations = await workspace.profileProgram.methods
        .getEncryptionRecommendations()
        .accounts({
          profile: profilePDA,
        })
        .rpc();

      expect(Array.isArray(recommendations)).to.be.true;
    });

    it("Should update contact securely with force flag", async () => {
      const secureContact = "encrypted:abc123def456";
      const secureKey = "ed25519:9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef";

      await workspace.profileProgram.methods
        .updateContactSecure(secureContact, secureKey, true)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.contact).to.equal(secureContact);
      expect(profile.encryptionKey).to.equal(secureKey);
    });
  });

  describe("Error Handling Tests", () => {
    it("Should handle math overflow in trade stats", async () => {
      // Create a profile with maximum values to test overflow protection
      const maxUser = Keypair.generate();
      const [maxProfilePDA] = findProfilePDA(maxUser.publicKey, workspace.profileProgram.programId);
      await airdropSol(workspace.connection, maxUser.publicKey);

      await workspace.profileProgram.methods
        .createProfile(null, null)
        .accounts({
          profile: maxProfilePDA,
          owner: maxUser.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([maxUser])
        .rpc();

      // The overflow protection should be handled internally
      // Multiple increments should not cause overflow
      for (let i = 0; i < 10; i++) {
        await workspace.profileProgram.methods
          .updateTradeStats({ requestedTrades: {} }, true)
          .accounts({
            profile: maxProfilePDA,
            owner: maxUser.publicKey,
          })
          .signers([maxUser])
          .rpc();
      }

      const profile = await workspace.profileProgram.account.profile.fetch(maxProfilePDA);
      expect(profile.requestedTradesCount.toString()).to.equal("10");
    });

    it("Should validate suspicious contact patterns", async () => {
      const suspiciousUser = Keypair.generate();
      const [suspiciousProfilePDA] = findProfilePDA(suspiciousUser.publicKey, workspace.profileProgram.programId);
      await airdropSol(workspace.connection, suspiciousUser.publicKey);

      // Try to create profile with suspicious contact
      const suspiciousContact = "mailto:spam@example.com"; // Should be rejected

      try {
        await workspace.profileProgram.methods
          .createProfile(suspiciousContact, null)
          .accounts({
            profile: suspiciousProfilePDA,
            owner: suspiciousUser.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([suspiciousUser])
          .rpc();
        expect.fail("Should have rejected suspicious contact");
      } catch (error) {
        expect(error.toString()).to.include("SuspiciousContact");
      }
    });
  });

  describe("Integration Tests", () => {
    it("Should handle complete user lifecycle", async () => {
      const lifecycleUser = Keypair.generate();
      const [lifecycleProfilePDA] = findProfilePDA(lifecycleUser.publicKey, workspace.profileProgram.programId);
      await airdropSol(workspace.connection, lifecycleUser.publicKey);

      // 1. Create profile
      await workspace.profileProgram.methods
        .createProfile("telegram:@lifecycle_user", null)
        .accounts({
          profile: lifecycleProfilePDA,
          owner: lifecycleUser.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([lifecycleUser])
        .rpc();

      // 2. Update contact info
      await workspace.profileProgram.methods
        .updateContact("telegram:@updated_lifecycle", "ed25519:abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab")
        .accounts({
          profile: lifecycleProfilePDA,
          owner: lifecycleUser.publicKey,
        })
        .signers([lifecycleUser])
        .rpc();

      // 3. Simulate trading activity
      await workspace.profileProgram.methods
        .updateOfferStats(true)
        .accounts({
          profile: lifecycleProfilePDA,
          owner: lifecycleUser.publicKey,
        })
        .signers([lifecycleUser])
        .rpc();

      await workspace.profileProgram.methods
        .updateTradeStats({ activeTrades: {} }, true)
        .accounts({
          profile: lifecycleProfilePDA,
          owner: lifecycleUser.publicKey,
        })
        .signers([lifecycleUser])
        .rpc();

      await workspace.profileProgram.methods
        .updateTradeStats({ releasedTrades: {} }, true)
        .accounts({
          profile: lifecycleProfilePDA,
          owner: lifecycleUser.publicKey,
        })
        .signers([lifecycleUser])
        .rpc();

      // 4. Update reputation
      await workspace.profileProgram.methods
        .updateReputation({ tradeCompleted: {} })
        .accounts({
          profile: lifecycleProfilePDA,
          owner: lifecycleUser.publicKey,
        })
        .signers([lifecycleUser])
        .rpc();

      // 5. Verify final state
      const finalProfile = await workspace.profileProgram.account.profile.fetch(lifecycleProfilePDA);
      expect(finalProfile.activeOffersCount).to.equal(1);
      expect(finalProfile.releasedTradesCount.toString()).to.equal("1");
      expect(finalProfile.reputationScore).to.be.greaterThan(0);
    });
  });
}); 