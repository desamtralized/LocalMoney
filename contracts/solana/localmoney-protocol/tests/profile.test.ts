import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { setupTestWorkspace, airdropSol, findProfilePDA } from "./utils/setup";

describe("Profile Program Tests", () => {
  const workspace = setupTestWorkspace();
  let userKeypair: Keypair;
  let profilePDA: anchor.web3.PublicKey;
  let profileBump: number;

  before(async () => {
    // Create test user and airdrop SOL
    userKeypair = Keypair.generate();
    await airdropSol(workspace.connection, userKeypair.publicKey);
    
    // Find profile PDA
    [profilePDA, profileBump] = findProfilePDA(userKeypair.publicKey, workspace.profileProgram.programId);
  });

  describe("Profile Creation", () => {
    it("Should create a new profile successfully", async () => {
      const contactInfo = "Encrypted contact info";
      const encryptionKey = Keypair.generate().publicKey;

      await workspace.profileProgram.methods
        .createProfile(contactInfo, encryptionKey)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      // Fetch the created profile
      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);

      // Verify profile data
      expect(profile.owner.toString()).to.equal(userKeypair.publicKey.toString());
      expect(profile.contactInfo).to.equal(contactInfo);
      expect(profile.encryptionKey.toString()).to.equal(encryptionKey.toString());
      expect(profile.activeOffers).to.equal(0);
      expect(profile.activeTrades).to.equal(0);
      expect(profile.totalOffers).to.equal(0);
      expect(profile.totalTrades).to.equal(0);
      expect(profile.reputation).to.equal(0);
      expect(profile.createdAt.toNumber()).to.be.greaterThan(0);
    });

    it("Should reject duplicate profile creation", async () => {
      try {
        await workspace.profileProgram.methods
          .createProfile("New contact", Keypair.generate().publicKey)
          .accounts({
            profile: profilePDA,
            owner: userKeypair.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([userKeypair])
          .rpc();
        
        expect.fail("Should have failed with duplicate profile");
      } catch (error) {
        // Anchor automatically handles account already exists error
        expect(error.toString()).to.include("already in use");
      }
    });
  });

  describe("Profile Updates", () => {
    it("Should update contact info successfully", async () => {
      const newContactInfo = "Updated encrypted contact info";

      await workspace.profileProgram.methods
        .updateContact(newContactInfo)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      // Verify update
      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.contactInfo).to.equal(newContactInfo);
    });

    it("Should update trade statistics successfully", async () => {
      const newActiveTrades = 2;
      const newTotalTrades = 5;

      await workspace.profileProgram.methods
        .updateTradeStats(newActiveTrades, newTotalTrades)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      // Verify update
      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeTrades).to.equal(newActiveTrades);
      expect(profile.totalTrades).to.equal(newTotalTrades);
    });

    it("Should update offer statistics successfully", async () => {
      const newActiveOffers = 3;
      const newTotalOffers = 8;

      await workspace.profileProgram.methods
        .updateOfferStats(newActiveOffers, newTotalOffers)
        .accounts({
          profile: profilePDA,
          owner: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      // Verify update
      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);
      expect(profile.activeOffers).to.equal(newActiveOffers);
      expect(profile.totalOffers).to.equal(newTotalOffers);
    });

    it("Should reject updates from unauthorized signer", async () => {
      const unauthorizedUser = Keypair.generate();
      await airdropSol(workspace.connection, unauthorizedUser.publicKey);

      try {
        await workspace.profileProgram.methods
          .updateContact("Unauthorized update")
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

  describe("Profile Queries", () => {
    it("Should fetch profile data correctly", async () => {
      const profile = await workspace.profileProgram.account.profile.fetch(profilePDA);

      expect(profile.owner.toString()).to.equal(userKeypair.publicKey.toString());
      expect(profile.contactInfo).to.be.a('string');
      expect(profile.encryptionKey).to.not.be.null;
      expect(profile.activeOffers).to.be.a('number');
      expect(profile.activeTrades).to.be.a('number');
      expect(profile.totalOffers).to.be.a('number');
      expect(profile.totalTrades).to.be.a('number');
      expect(profile.reputation).to.be.a('number');
      expect(profile.createdAt.toNumber()).to.be.greaterThan(0);
    });
  });
}); 