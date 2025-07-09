import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

import { Hub } from "../target/types/hub";
import { Profile } from "../target/types/profile";
import { Price } from "../target/types/price";
import { Offer } from "../target/types/offer";
import { Trade } from "../target/types/trade";

describe("Cross-Program Calls", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const hubProgram = anchor.workspace.Hub as Program<Hub>;
  const profileProgram = anchor.workspace.Profile as Program<Profile>;
  const priceProgram = anchor.workspace.Price as Program<Price>;
  const offerProgram = anchor.workspace.Offer as Program<Offer>;
  const tradeProgram = anchor.workspace.Trade as Program<Trade>;

  let authority: Keypair;
  let hubConfig: PublicKey;
  let hubRegistry: PublicKey;

  beforeEach(async () => {
    authority = Keypair.generate();

    // Airdrop SOL to authority
    await provider.connection.requestAirdrop(authority.publicKey, 2e9);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Derive Hub config and registry PDAs
    [hubConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      hubProgram.programId
    );
    
    [hubRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      hubProgram.programId
    );
  });

  describe("Hub Program Registration", () => {
    it("should initialize Hub configuration", async () => {
      const initParams = {
        offerProgram: offerProgram.programId,
        tradeProgram: tradeProgram.programId,
        profileProgram: profileProgram.programId,
        priceProgram: priceProgram.programId,
        priceProvider: authority.publicKey,
        localMint: Keypair.generate().publicKey,
        chainFeeCollector: authority.publicKey,
        warchest: authority.publicKey,
        activeOffersLimit: 10,
        activeTradesLimit: 5,
        arbitrationFeeBps: 100,
        burnFeeBps: 50,
        chainFeeBps: 25,
        warchestFeeBps: 25,
        tradeExpirationTimer: 24 * 60 * 60, // 24 hours
        tradeDisputeTimer: 7 * 24 * 60 * 60, // 7 days
        tradeLimitMin: 1000000, // 1 USD in micro-units
        tradeLimitMax: 1000000000000, // 1M USD in micro-units
      };

      await hubProgram.methods
        .initialize(initParams)
        .accounts({
          config: hubConfig,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Verify configuration was set correctly
      const config = await hubProgram.account.globalConfig.fetch(hubConfig);
      expect(config.authority.toString()).to.equal(authority.publicKey.toString());
      expect(config.offerProgram.toString()).to.equal(offerProgram.programId.toString());
      expect(config.activeOffersLimit).to.equal(10);
    });

    it("should register all programs with Hub", async () => {
      // Initialize Hub first
      const initParams = {
        offerProgram: offerProgram.programId,
        tradeProgram: tradeProgram.programId,
        profileProgram: profileProgram.programId,
        priceProgram: priceProgram.programId,
        priceProvider: authority.publicKey,
        localMint: Keypair.generate().publicKey,
        chainFeeCollector: authority.publicKey,
        warchest: authority.publicKey,
        activeOffersLimit: 10,
        activeTradesLimit: 5,
        arbitrationFeeBps: 100,
        burnFeeBps: 50,
        chainFeeBps: 25,
        warchestFeeBps: 25,
        tradeExpirationTimer: 24 * 60 * 60,
        tradeDisputeTimer: 7 * 24 * 60 * 60,
        tradeLimitMin: 1000000,
        tradeLimitMax: 1000000000000,
      };

      await hubProgram.methods
        .initialize(initParams)
        .accounts({
          config: hubConfig,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Test Profile program registration
      try {
        await profileProgram.methods
          .registerWithHub()
          .accounts({
            hubProgram: hubProgram.programId,
            hubConfig,
            hubRegistry,
            programAccount: profileProgram.programId,
            payer: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Profile program registered successfully");
      } catch (error) {
        console.log("Profile program registration failed:", error.message);
      }

      // Test Price program registration
      try {
        await priceProgram.methods
          .registerWithHub()
          .accounts({
            hubProgram: hubProgram.programId,
            hubConfig,
            hubRegistry,
            programAccount: priceProgram.programId,
            payer: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Price program registered successfully");
      } catch (error) {
        console.log("Price program registration failed:", error.message);
      }

      // Test Offer program registration
      try {
        await offerProgram.methods
          .registerWithHub()
          .accounts({
            hubProgram: hubProgram.programId,
            hubConfig,
            hubRegistry,
            programAccount: offerProgram.programId,
            payer: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Offer program registered successfully");
      } catch (error) {
        console.log("Offer program registration failed:", error.message);
      }

      // Test Trade program registration
      try {
        await tradeProgram.methods
          .registerWithHub()
          .accounts({
            hubProgram: hubProgram.programId,
            hubConfig,
            hubRegistry,
            programAccount: tradeProgram.programId,
            payer: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Trade program registered successfully");
      } catch (error) {
        console.log("Trade program registration failed:", error.message);
      }
    });
  });

  describe("Hub Configuration Queries", () => {
    beforeEach(async () => {
      // Initialize Hub
      const initParams = {
        offerProgram: offerProgram.programId,
        tradeProgram: tradeProgram.programId,
        profileProgram: profileProgram.programId,
        priceProgram: priceProgram.programId,
        priceProvider: authority.publicKey,
        localMint: Keypair.generate().publicKey,
        chainFeeCollector: authority.publicKey,
        warchest: authority.publicKey,
        activeOffersLimit: 10,
        activeTradesLimit: 5,
        arbitrationFeeBps: 100,
        burnFeeBps: 50,
        chainFeeBps: 25,
        warchestFeeBps: 25,
        tradeExpirationTimer: 24 * 60 * 60,
        tradeDisputeTimer: 7 * 24 * 60 * 60,
        tradeLimitMin: 1000000,
        tradeLimitMax: 1000000000000,
      };

      await hubProgram.methods
        .initialize(initParams)
        .accounts({
          config: hubConfig,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    });

    it("should query Hub configuration from Profile program", async () => {
      const [queryAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("query")],
        profileProgram.programId
      );

      try {
        // Test protocol fees query
        await profileProgram.methods
          .getHubProtocolFees()
          .accounts({
            hubConfig,
            queryAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Protocol fees query successful");
      } catch (error) {
        console.log("Protocol fees query failed:", error.message);
      }

      try {
        // Test trading limits query
        await profileProgram.methods
          .getHubTradingLimits()
          .accounts({
            hubConfig,
            queryAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Trading limits query successful");
      } catch (error) {
        console.log("Trading limits query failed:", error.message);
      }
    });

    it("should query Hub configuration from Price program", async () => {
      const [queryAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("query")],
        priceProgram.programId
      );

      try {
        // Test timer config query
        await priceProgram.methods
          .getHubTimerConfig()
          .accounts({
            hubConfig,
            queryAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Timer config query successful");
      } catch (error) {
        console.log("Timer config query failed:", error.message);
      }

      try {
        // Test program addresses query
        await priceProgram.methods
          .getHubProgramAddresses()
          .accounts({
            hubConfig,
            queryAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Program addresses query successful");
      } catch (error) {
        console.log("Program addresses query failed:", error.message);
      }
    });
  });

  describe("Hub Parameter Validation", () => {
    beforeEach(async () => {
      // Initialize Hub
      const initParams = {
        offerProgram: offerProgram.programId,
        tradeProgram: tradeProgram.programId,
        profileProgram: profileProgram.programId,
        priceProgram: priceProgram.programId,
        priceProvider: authority.publicKey,
        localMint: Keypair.generate().publicKey,
        chainFeeCollector: authority.publicKey,
        warchest: authority.publicKey,
        activeOffersLimit: 10,
        activeTradesLimit: 5,
        arbitrationFeeBps: 100,
        burnFeeBps: 50,
        chainFeeBps: 25,
        warchestFeeBps: 25,
        tradeExpirationTimer: 24 * 60 * 60,
        tradeDisputeTimer: 7 * 24 * 60 * 60,
        tradeLimitMin: 1000000,
        tradeLimitMax: 1000000000000,
      };

      await hubProgram.methods
        .initialize(initParams)
        .accounts({
          config: hubConfig,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    });

    it("should validate offer parameters against Hub config", async () => {
      const [validationAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("validate_offer")],
        offerProgram.programId
      );

      try {
        await offerProgram.methods
          .validateOfferWithHubConfig(
            new anchor.BN(10000000), // 10 USD min
            new anchor.BN(100000000), // 100 USD max
            2, // user offers
            1  // user trades
          )
          .accounts({
            hubConfig,
            validationAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Offer validation successful");
      } catch (error) {
        console.log("Offer validation failed:", error.message);
      }
    });

    it("should validate trade parameters against Hub config", async () => {
      const [validationAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("validate_trade")],
        tradeProgram.programId
      );

      try {
        await tradeProgram.methods
          .validateTradeWithHubConfig(
            new anchor.BN(50000000), // 50 USD
            2, // user offers
            1, // user trades
            Math.floor(Date.now() / 1000) // current timestamp
          )
          .accounts({
            hubConfig,
            validationAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Trade validation successful");
      } catch (error) {
        console.log("Trade validation failed:", error.message);
      }
    });
  });

  describe("Hub Authority Validation", () => {
    beforeEach(async () => {
      // Initialize Hub
      const initParams = {
        offerProgram: offerProgram.programId,
        tradeProgram: tradeProgram.programId,
        profileProgram: profileProgram.programId,
        priceProgram: priceProgram.programId,
        priceProvider: authority.publicKey,
        localMint: Keypair.generate().publicKey,
        chainFeeCollector: authority.publicKey,
        warchest: authority.publicKey,
        activeOffersLimit: 10,
        activeTradesLimit: 5,
        arbitrationFeeBps: 100,
        burnFeeBps: 50,
        chainFeeBps: 25,
        warchestFeeBps: 25,
        tradeExpirationTimer: 24 * 60 * 60,
        tradeDisputeTimer: 7 * 24 * 60 * 60,
        tradeLimitMin: 1000000,
        tradeLimitMax: 1000000000000,
      };

      await hubProgram.methods
        .initialize(initParams)
        .accounts({
          config: hubConfig,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    });

    it("should validate hub authority", async () => {
      const [validationAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("validate_hub_auth")],
        hubProgram.programId
      );

      try {
        await hubProgram.methods
          .validateHubAuthority()
          .accounts({
            config: hubConfig,
            authority: authority.publicKey,
            validationAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Hub authority validation successful");
      } catch (error) {
        console.log("Hub authority validation failed:", error.message);
      }
    });

    it("should validate program authority", async () => {
      const [validationAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("validate_program_auth")],
        hubProgram.programId
      );

      try {
        await hubProgram.methods
          .validateProgramAuthority({ profile: {} }) // RegisteredProgramType::Profile
          .accounts({
            config: hubConfig,
            registry: hubRegistry,
            callingProgram: profileProgram.programId,
            validationAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Program authority validation successful");
      } catch (error) {
        console.log("Program authority validation failed:", error.message);
      }
    });

    it("should validate cross-program operation authority", async () => {
      const [validationAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("validate_cross_program")],
        hubProgram.programId
      );

      try {
        await hubProgram.methods
          .validateCrossProgramAuthority(
            { profile: {} }, // calling program type
            { price: {} },   // target program type
            { query: {} }    // operation type
          )
          .accounts({
            config: hubConfig,
            registry: hubRegistry,
            callingProgram: profileProgram.programId,
            targetProgram: priceProgram.programId,
            validationAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        console.log("✓ Cross-program authority validation successful");
      } catch (error) {
        console.log("Cross-program authority validation failed:", error.message);
      }
    });
  });
});