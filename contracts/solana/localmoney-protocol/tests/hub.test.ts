import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { setupTestWorkspace, airdropSol, findGlobalConfigPDA, createValidInitializeParams, createValidUpdateConfigParams } from "./utils/setup";

describe("Hub Program Tests", () => {
  const workspace = setupTestWorkspace();
  let configPDA: anchor.web3.PublicKey;
  let configBump: number;

  before(async () => {
    // Airdrop SOL to authority
    await airdropSol(workspace.connection, workspace.authority.publicKey);
    
    // Find config PDA
    [configPDA, configBump] = findGlobalConfigPDA(workspace.hubProgram.programId);
  });

  describe("Initialization", () => {
    it("Should initialize hub configuration successfully", async () => {
      const params = createValidInitializeParams();

      const tx = await workspace.hubProgram.methods
        .initialize(params)
        .accounts({
          config: configPDA,
          authority: workspace.authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([workspace.authority])
        .rpc();

      // Fetch the config account
      const config = await workspace.hubProgram.account.globalConfig.fetch(configPDA);

      // Verify all configuration values
      expect(config.authority.toString()).to.equal(workspace.authority.publicKey.toString());
      expect(config.offerProgram.toString()).to.equal(params.offerProgram.toString());
      expect(config.tradeProgram.toString()).to.equal(params.tradeProgram.toString());
      expect(config.profileProgram.toString()).to.equal(params.profileProgram.toString());
      expect(config.priceProgram.toString()).to.equal(params.priceProgram.toString());
      expect(config.activeOffersLimit).to.equal(params.activeOffersLimit);
      expect(config.activeTradesLimit).to.equal(params.activeTradesLimit);
      expect(config.arbitrationFeeBps).to.equal(params.arbitrationFeeBps);
      expect(config.burnFeeBps).to.equal(params.burnFeeBps);
      expect(config.chainFeeBps).to.equal(params.chainFeeBps);
      expect(config.warchestFeeBps).to.equal(params.warchestFeeBps);
    });

    it("Should reject initialization with excessive fees", async () => {
      const params = createValidInitializeParams();
      // Set total fees to 11% (over the 10% limit)
      params.chainFeeBps = 500;   // 5%
      params.burnFeeBps = 400;    // 4%
      params.warchestFeeBps = 300; // 3%
      // Total: 12% > 10% limit

      try {
        await workspace.hubProgram.methods
          .initialize(params)
          .accounts({
            config: Keypair.generate().publicKey, // Different config to avoid conflict
            authority: workspace.authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([workspace.authority])
          .rpc();
        
        expect.fail("Should have failed with excessive fees");
      } catch (error) {
        expect(error.toString()).to.include("ExcessiveFees");
      }
    });

    it("Should reject initialization with excessive trade expiration timer", async () => {
      const params = createValidInitializeParams();
      params.tradeExpirationTimer = new anchor.BN(172801); // 1 second over 2 days limit

      try {
        await workspace.hubProgram.methods
          .initialize(params)
          .accounts({
            config: Keypair.generate().publicKey,
            authority: workspace.authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([workspace.authority])
          .rpc();
        
        expect.fail("Should have failed with excessive expiration timer");
      } catch (error) {
        expect(error.toString()).to.include("ExcessiveExpiration");
      }
    });
  });

  describe("Configuration Updates", () => {
    it("Should update configuration successfully", async () => {
      const params = createValidUpdateConfigParams();

      await workspace.hubProgram.methods
        .updateConfig(params)
        .accounts({
          config: configPDA,
          authority: workspace.authority.publicKey,
        })
        .signers([workspace.authority])
        .rpc();

      // Fetch updated config
      const config = await workspace.hubProgram.account.globalConfig.fetch(configPDA);

      // Verify updates
      expect(config.activeOffersLimit).to.equal(params.activeOffersLimit);
      expect(config.activeTradesLimit).to.equal(params.activeTradesLimit);
      expect(config.arbitrationFeeBps).to.equal(params.arbitrationFeeBps);
    });

    it("Should reject updates from unauthorized signer", async () => {
      const unauthorizedUser = Keypair.generate();
      await airdropSol(workspace.connection, unauthorizedUser.publicKey);

      const params = createValidUpdateConfigParams();

      try {
        await workspace.hubProgram.methods
          .updateConfig(params)
          .accounts({
            config: configPDA,
            authority: unauthorizedUser.publicKey,
          })
          .signers([unauthorizedUser])
          .rpc();
        
        expect.fail("Should have failed with unauthorized access");
      } catch (error) {
        expect(error.toString()).to.include("Unauthorized");
      }
    });

    it("Should reject updates with excessive fees", async () => {
      const params = createValidUpdateConfigParams();
      params.chainFeeBps = 600;   // 6%
      params.burnFeeBps = 300;    // 3%
      params.warchestFeeBps = 200; // 2%
      // Total: 11% > 10% limit

      try {
        await workspace.hubProgram.methods
          .updateConfig(params)
          .accounts({
            config: configPDA,
            authority: workspace.authority.publicKey,
          })
          .signers([workspace.authority])
          .rpc();
        
        expect.fail("Should have failed with excessive fees");
      } catch (error) {
        expect(error.toString()).to.include("ExcessiveFees");
      }
    });
  });

  describe("Authority Management", () => {
    it("Should update authority successfully", async () => {
      const newAuthority = Keypair.generate();
      await airdropSol(workspace.connection, newAuthority.publicKey);

      await workspace.hubProgram.methods
        .updateAuthority(newAuthority.publicKey)
        .accounts({
          config: configPDA,
          authority: workspace.authority.publicKey,
        })
        .signers([workspace.authority])
        .rpc();

      // Verify authority update
      const config = await workspace.hubProgram.account.globalConfig.fetch(configPDA);
      expect(config.authority.toString()).to.equal(newAuthority.publicKey.toString());

      // Update workspace authority for future tests
      workspace.authority = newAuthority;
    });

    it("Should reject authority update from unauthorized signer", async () => {
      const unauthorizedUser = Keypair.generate();
      const newAuthority = Keypair.generate();
      await airdropSol(workspace.connection, unauthorizedUser.publicKey);

      try {
        await workspace.hubProgram.methods
          .updateAuthority(newAuthority.publicKey)
          .accounts({
            config: configPDA,
            authority: unauthorizedUser.publicKey,
          })
          .signers([unauthorizedUser])
          .rpc();
        
        expect.fail("Should have failed with unauthorized access");
      } catch (error) {
        expect(error.toString()).to.include("Unauthorized");
      }
    });
  });

  describe("Query Functions", () => {
    it("Should return protocol fees correctly", async () => {
      const fees = await workspace.hubProgram.methods
        .getProtocolFees()
        .accounts({
          config: configPDA,
          programId: workspace.hubProgram.programId,
        })
        .view();

      expect(fees.chainFeeBps).to.be.a('number');
      expect(fees.burnFeeBps).to.be.a('number');
      expect(fees.warchestFeeBps).to.be.a('number');
      expect(fees.arbitrationFeeBps).to.be.a('number');
    });

    it("Should return trading limits correctly", async () => {
      const limits = await workspace.hubProgram.methods
        .getTradingLimits()
        .accounts({
          config: configPDA,
          programId: workspace.hubProgram.programId,
        })
        .view();

      expect(limits.minAmountUsd.toString()).to.be.a('string');
      expect(limits.maxAmountUsd.toString()).to.be.a('string');
      expect(limits.activeOffersLimit).to.be.a('number');
      expect(limits.activeTradesLimit).to.be.a('number');
    });

    it("Should return program addresses correctly", async () => {
      const addresses = await workspace.hubProgram.methods
        .getProgramAddresses()
        .accounts({
          config: configPDA,
          programId: workspace.hubProgram.programId,
        })
        .view();

      expect(addresses.offerProgram.toString()).to.be.a('string');
      expect(addresses.tradeProgram.toString()).to.be.a('string');
      expect(addresses.profileProgram.toString()).to.be.a('string');
      expect(addresses.priceProgram.toString()).to.be.a('string');
    });
  });

  describe("Validation Functions", () => {
    it("Should validate user activity limits correctly", async () => {
      // This should not throw since we're within limits
      await workspace.hubProgram.methods
        .validateUserActivityLimits(3, 2) // 3 offers, 2 trades (within limits)
        .accounts({
          config: configPDA,
          programId: workspace.hubProgram.programId,
        })
        .view();
    });

    it("Should validate trade amounts correctly", async () => {
      const validAmount = new anchor.BN(50000000); // $50 USD

      // This should not throw since amount is within limits
      await workspace.hubProgram.methods
        .validateTradeAmount(validAmount)
        .accounts({
          config: configPDA,
          programId: workspace.hubProgram.programId,
        })
        .view();
    });

    it("Should validate offer amount ranges correctly", async () => {
      const minAmount = new anchor.BN(10000000);  // $10 USD
      const maxAmount = new anchor.BN(100000000); // $100 USD

      // This should not throw since range is valid
      await workspace.hubProgram.methods
        .validateOfferAmountRange(minAmount, maxAmount)
        .accounts({
          config: configPDA,
          programId: workspace.hubProgram.programId,
        })
        .view();
    });
  });
}); 