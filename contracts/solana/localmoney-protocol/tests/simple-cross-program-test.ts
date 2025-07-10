import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

import { Hub } from "../target/types/hub";
import { Profile } from "../target/types/profile";
import { Price } from "../target/types/price";
import { Offer } from "../target/types/offer";
import { Trade } from "../target/types/trade";

describe("Simple Cross-Program Integration Test", () => {
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

  before(async () => {
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
    
    console.log("✓ Hub configuration initialized successfully");
  });

  it("should register Profile program with Hub", async () => {
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
      throw error;
    }
  });

  it("should register Price program with Hub", async () => {
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
      throw error;
    }
  });

  it("should register Offer program with Hub", async () => {
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
      throw error;
    }
  });

  it("should register Trade program with Hub", async () => {
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
      throw error;
    }
  });

  it("should validate offer parameters with Hub config", async () => {
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
          hubProgram: hubProgram.programId,
          validationAccount,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
      
      console.log("✓ Offer validation successful");
    } catch (error) {
      console.log("Offer validation failed:", error.message);
      throw error;
    }
  });
});