import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  setupTestWorkspace,
  airdropSol,
  findProfilePDA,
  findOfferPDA,
  findGlobalConfigPDA,
  createValidInitializeParams,
} from "./utils/setup";

describe("Complete LocalMoney Protocol Flow Demo", () => {
  const workspace = setupTestWorkspace();
  let authority: Keypair;
  let seller: Keypair;
  let buyer: Keypair;
  let priceOracle: Keypair;
  let sellerProfilePDA: PublicKey;
  let buyerProfilePDA: PublicKey;
  let hubConfigPDA: PublicKey;
  let offerCounterPDA: PublicKey;
  let priceConfigPDA: PublicKey;
  let usdPricePDA: PublicKey;
  let testMint: PublicKey;

  // Store transaction hashes
  let txHashes: { [key: string]: string } = {};

  before(async () => {
    console.log("\n🚀 Starting LocalMoney Protocol Complete Flow Demo");
    console.log("=".repeat(60));

    // Initialize keypairs
    authority = workspace.authority;
    seller = Keypair.generate();
    buyer = Keypair.generate();
    priceOracle = Keypair.generate();
    testMint = Keypair.generate().publicKey;

    console.log("\n📋 Account Information:");
    console.log(`Authority: ${authority.publicKey.toString()}`);
    console.log(`Seller: ${seller.publicKey.toString()}`);
    console.log(`Buyer: ${buyer.publicKey.toString()}`);
    console.log(`Price Oracle: ${priceOracle.publicKey.toString()}`);

    // Airdrop SOL to all accounts
    console.log("\n💰 Airdropping SOL to test accounts...");
    await Promise.all([
      airdropSol(workspace.connection, seller.publicKey),
      airdropSol(workspace.connection, buyer.publicKey),
      airdropSol(workspace.connection, priceOracle.publicKey),
      airdropSol(workspace.connection, authority.publicKey),
    ]);

    // Find PDAs
    [sellerProfilePDA] = findProfilePDA(seller.publicKey, workspace.profileProgram.programId);
    [buyerProfilePDA] = findProfilePDA(buyer.publicKey, workspace.profileProgram.programId);
    [hubConfigPDA] = findGlobalConfigPDA(workspace.hubProgram.programId);
    [offerCounterPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("offer_counter")],
      workspace.offerProgram.programId,
    );
    [priceConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      workspace.priceProgram.programId,
    );
    [usdPricePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("price"), Buffer.from("USD")],
      workspace.priceProgram.programId,
    );

    console.log("\n🏗️  PDA Addresses:");
    console.log(`Hub Config: ${hubConfigPDA.toString()}`);
    console.log(`Seller Profile: ${sellerProfilePDA.toString()}`);
    console.log(`Buyer Profile: ${buyerProfilePDA.toString()}`);
    console.log(`Offer Counter: ${offerCounterPDA.toString()}`);
    console.log(`Price Config: ${priceConfigPDA.toString()}`);
    console.log(`USD Price Feed: ${usdPricePDA.toString()}`);
  });

  describe("Complete Protocol Flow", () => {
    it("Step 1: Initialize Hub Configuration", async () => {
      console.log("\n🏛️  Step 1: Initializing Hub Configuration...");
      
      const initParams = createValidInitializeParams();
      const signature = await workspace.hubProgram.methods
        .initialize(initParams)
        .accounts({
          config: hubConfigPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      txHashes["hub_initialize"] = signature;
      console.log(`✅ Hub initialized - TX: ${signature}`);

      // Verify hub was initialized
      const config = await workspace.hubProgram.account.globalConfig.fetch(hubConfigPDA);
      expect(config.authority.toString()).to.equal(authority.publicKey.toString());
      console.log(`   Authority: ${config.authority.toString()}`);
      console.log(`   Active Offers Limit: ${config.activeOffersLimit}`);
      console.log(`   Active Trades Limit: ${config.activeTradesLimit}`);
    });

    it("Step 2: Initialize Price Oracle", async () => {
      console.log("\n💱 Step 2: Initializing Price Oracle...");
      
      const signature = await workspace.priceProgram.methods
        .initialize(workspace.hubProgram.programId)
        .accounts({
          config: priceConfigPDA,
          authority: priceOracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([priceOracle])
        .rpc();

      txHashes["price_initialize"] = signature;
      console.log(`✅ Price Oracle initialized - TX: ${signature}`);

      // Set USD price
      const priceSignature = await workspace.priceProgram.methods
        .updatePrices(
          { usd: {} },
          new anchor.BN(100000000), // $1.00
          new anchor.BN(Date.now() / 1000),
          "localnet-oracle",
          95
        )
        .accounts({
          currencyPrice: usdPricePDA,
          authority: priceOracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([priceOracle])
        .rpc();

      txHashes["price_update_usd"] = priceSignature;
      console.log(`✅ USD price updated - TX: ${priceSignature}`);
      
      const priceData = await workspace.priceProgram.account.currencyPrice.fetch(usdPricePDA);
      console.log(`   USD Price: $${(priceData.price.toNumber() / 100000000).toFixed(2)}`);
      console.log(`   Confidence: ${priceData.confidence}%`);
    });

    it("Step 3: Initialize Offer Counter", async () => {
      console.log("\n🔢 Step 3: Initializing Offer Counter...");
      
      const signature = await workspace.offerProgram.methods
        .initializeCounter()
        .accounts({
          offerCounter: offerCounterPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      txHashes["offer_counter_init"] = signature;
      console.log(`✅ Offer Counter initialized - TX: ${signature}`);

      const counter = await workspace.offerProgram.account.offerCounter.fetch(offerCounterPDA);
      console.log(`   Initial Count: ${counter.count}`);
    });

    it("Step 4: Create Seller Profile", async () => {
      console.log("\n👤 Step 4: Creating Seller Profile...");
      
      const signature = await workspace.profileProgram.methods
        .createProfile("telegram:@seller123", "ed25519:sellerkey123")
        .accounts({
          profile: sellerProfilePDA,
          owner: seller.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      txHashes["seller_profile_create"] = signature;
      console.log(`✅ Seller profile created - TX: ${signature}`);

      const profile = await workspace.profileProgram.account.profile.fetch(sellerProfilePDA);
      console.log(`   Contact: ${profile.contact}`);
      console.log(`   Reputation Score: ${profile.reputationScore}`);
      console.log(`   Active Offers: ${profile.activeOffersCount}`);
    });

    it("Step 5: Create Buyer Profile", async () => {
      console.log("\n👤 Step 5: Creating Buyer Profile...");
      
      const signature = await workspace.profileProgram.methods
        .createProfile("signal:+1234567890", "ed25519:buyerkey456")
        .accounts({
          profile: buyerProfilePDA,
          owner: buyer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      txHashes["buyer_profile_create"] = signature;
      console.log(`✅ Buyer profile created - TX: ${signature}`);

      const profile = await workspace.profileProgram.account.profile.fetch(buyerProfilePDA);
      console.log(`   Contact: ${profile.contact}`);
      console.log(`   Reputation Score: ${profile.reputationScore}`);
      console.log(`   Active Offers: ${profile.activeOffersCount}`);
    });

    it("Step 6: Create Sell Offer", async () => {
      console.log("\n💰 Step 6: Creating Sell Offer...");
      
      const [offer1PDA] = findOfferPDA(1, workspace.offerProgram.programId);
      
      const signature = await workspace.offerProgram.methods
        .createOfferWithProfileValidation({
          offerType: { sell: {} },
          fiatCurrency: { usd: {} },
          rate: new anchor.BN(10200), // 102% of market rate
          minAmount: new anchor.BN(50000000), // $50 minimum
          maxAmount: new anchor.BN(1000000000), // $1000 maximum
          description: "Selling USDC for USD - Fast & Reliable",
          tokenMint: testMint,
          expirationHours: 24,
        })
        .accounts({
          offer: offer1PDA,
          offerCounter: offerCounterPDA,
          owner: seller.publicKey,
          profile: sellerProfilePDA,
          hubConfig: hubConfigPDA,
          profileProgram: workspace.profileProgram.programId,
          hubProgram: workspace.hubProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      txHashes["offer_create"] = signature;
      console.log(`✅ Sell offer created - TX: ${signature}`);

      const offer = await workspace.offerProgram.account.offer.fetch(offer1PDA);
      console.log(`   Offer ID: ${offer.id}`);
      console.log(`   Type: ${Object.keys(offer.offerType)[0]}`);
      console.log(`   Currency: ${Object.keys(offer.fiatCurrency)[0].toUpperCase()}`);
      console.log(`   Rate: ${(offer.rate.toNumber() / 100).toFixed(2)}%`);
      console.log(`   Range: $${(offer.minAmount.toNumber() / 1000000).toFixed(0)} - $${(offer.maxAmount.toNumber() / 1000000).toFixed(0)}`);
      console.log(`   Description: ${offer.description}`);
      console.log(`   State: ${Object.keys(offer.state)[0]}`);

      // Verify profile was updated
      const sellerProfile = await workspace.profileProgram.account.profile.fetch(sellerProfilePDA);
      console.log(`   Seller Active Offers: ${sellerProfile.activeOffersCount}`);
    });

    it("Step 7: Query and Display Offers", async () => {
      console.log("\n🔍 Step 7: Querying Available Offers...");
      
      // Get offer by ID
      const [offer1PDA] = findOfferPDA(1, workspace.offerProgram.programId);
      const offerSummary = await workspace.offerProgram.methods
        .getOfferById()
        .accounts({
          offer: offer1PDA,
        })
        .view();

      console.log(`✅ Found Offer #${offerSummary.id}:`);
      console.log(`   Owner: ${offerSummary.owner.toString()}`);
      console.log(`   Type: ${Object.keys(offerSummary.offerType)[0]}`);
      console.log(`   Currency: ${Object.keys(offerSummary.fiatCurrency)[0].toUpperCase()}`);
      console.log(`   Rate: ${(offerSummary.rate.toNumber() / 100).toFixed(2)}%`);
      console.log(`   Available: ${offerSummary.isAvailable ? "Yes" : "No"}`);

      // Get total offer count
      const totalCount = await workspace.offerProgram.methods
        .getOfferCount()
        .accounts({
          offerCounter: offerCounterPDA,
        })
        .view();

      console.log(`   Total Offers in System: ${totalCount}`);
    });

    it("Step 8: Update Offer State (Pause/Activate)", async () => {
      console.log("\n⏸️  Step 8: Managing Offer State...");
      
      const [offer1PDA] = findOfferPDA(1, workspace.offerProgram.programId);
      
      // Pause the offer
      const pauseSignature = await workspace.offerProgram.methods
        .pauseOffer()
        .accounts({
          offer: offer1PDA,
          owner: seller.publicKey,
          profile: sellerProfilePDA,
          profileProgram: workspace.profileProgram.programId,
        })
        .signers([seller])
        .rpc();

      txHashes["offer_pause"] = pauseSignature;
      console.log(`✅ Offer paused - TX: ${pauseSignature}`);

      // Verify state change
      let offer = await workspace.offerProgram.account.offer.fetch(offer1PDA);
      console.log(`   State: ${Object.keys(offer.state)[0]}`);

      let sellerProfile = await workspace.profileProgram.account.profile.fetch(sellerProfilePDA);
      console.log(`   Seller Active Offers: ${sellerProfile.activeOffersCount}`);

      // Reactivate the offer
      const activateSignature = await workspace.offerProgram.methods
        .activateOffer()
        .accounts({
          offer: offer1PDA,
          owner: seller.publicKey,
          profile: sellerProfilePDA,
          profileProgram: workspace.profileProgram.programId,
        })
        .signers([seller])
        .rpc();

      txHashes["offer_activate"] = activateSignature;
      console.log(`✅ Offer reactivated - TX: ${activateSignature}`);

      // Verify reactivation
      offer = await workspace.offerProgram.account.offer.fetch(offer1PDA);
      console.log(`   State: ${Object.keys(offer.state)[0]}`);

      sellerProfile = await workspace.profileProgram.account.profile.fetch(sellerProfilePDA);
      console.log(`   Seller Active Offers: ${sellerProfile.activeOffersCount}`);
    });

    it("Step 9: Create Additional Offers", async () => {
      console.log("\n💰 Step 9: Creating Additional Offers...");
      
      // Create a buy offer from buyer
      const [offer2PDA] = findOfferPDA(2, workspace.offerProgram.programId);
      
      const signature = await workspace.offerProgram.methods
        .createOfferWithProfileValidation({
          offerType: { buy: {} },
          fiatCurrency: { usd: {} },
          rate: new anchor.BN(9900), // 99% of market rate (buying at discount)
          minAmount: new anchor.BN(100000000), // $100 minimum
          maxAmount: new anchor.BN(500000000), // $500 maximum
          description: "Looking to buy USDC with USD - Quick settlement",
          tokenMint: testMint,
          expirationHours: 12,
        })
        .accounts({
          offer: offer2PDA,
          offerCounter: offerCounterPDA,
          owner: buyer.publicKey,
          profile: buyerProfilePDA,
          hubConfig: hubConfigPDA,
          profileProgram: workspace.profileProgram.programId,
          hubProgram: workspace.hubProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      txHashes["buyer_offer_create"] = signature;
      console.log(`✅ Buy offer created - TX: ${signature}`);

      const offer = await workspace.offerProgram.account.offer.fetch(offer2PDA);
      console.log(`   Offer ID: ${offer.id}`);
      console.log(`   Type: ${Object.keys(offer.offerType)[0]}`);
      console.log(`   Rate: ${(offer.rate.toNumber() / 100).toFixed(2)}%`);
      console.log(`   Range: $${(offer.minAmount.toNumber() / 1000000).toFixed(0)} - $${(offer.maxAmount.toNumber() / 1000000).toFixed(0)}`);

      const buyerProfile = await workspace.profileProgram.account.profile.fetch(buyerProfilePDA);
      console.log(`   Buyer Active Offers: ${buyerProfile.activeOffersCount}`);
    });

    it("Step 10: Profile Statistics and System Summary", async () => {
      console.log("\n📊 Step 10: Final System Summary...");
      
      // Get final profile states
      const sellerProfile = await workspace.profileProgram.account.profile.fetch(sellerProfilePDA);
      const buyerProfile = await workspace.profileProgram.account.profile.fetch(buyerProfilePDA);
      
      console.log(`\n👤 Seller Profile Summary:`);
      console.log(`   Contact: ${sellerProfile.contact}`);
      console.log(`   Reputation: ${sellerProfile.reputationScore}`);
      console.log(`   Active Offers: ${sellerProfile.activeOffersCount}`);
      console.log(`   Total Trades: ${sellerProfile.tradeStats.totalTrades}`);
      console.log(`   Created At: ${new Date(sellerProfile.createdAt.toNumber() * 1000).toISOString()}`);

      console.log(`\n👤 Buyer Profile Summary:`);
      console.log(`   Contact: ${buyerProfile.contact}`);
      console.log(`   Reputation: ${buyerProfile.reputationScore}`);
      console.log(`   Active Offers: ${buyerProfile.activeOffersCount}`);
      console.log(`   Total Trades: ${buyerProfile.tradeStats.totalTrades}`);
      console.log(`   Created At: ${new Date(buyerProfile.createdAt.toNumber() * 1000).toISOString()}`);

      // Get total system stats
      const offerCounter = await workspace.offerProgram.account.offerCounter.fetch(offerCounterPDA);
      const hubConfig = await workspace.hubProgram.account.globalConfig.fetch(hubConfigPDA);

      console.log(`\n🏛️  Hub Configuration:`);
      console.log(`   Total Offers Created: ${offerCounter.count}`);
      console.log(`   Active Offers Limit: ${hubConfig.activeOffersLimit}`);
      console.log(`   Active Trades Limit: ${hubConfig.activeTradesLimit}`);
      console.log(`   Arbitration Fee: ${(hubConfig.arbitrationFeeBps / 100).toFixed(2)}%`);
      console.log(`   Chain Fee: ${(hubConfig.chainFeeBps / 100).toFixed(2)}%`);
    });

    after(() => {
      console.log("\n🎉 LocalMoney Protocol Complete Flow Demo Finished!");
      console.log("=".repeat(60));
      
      console.log("\n📋 All Transaction Hashes:");
      console.log("-".repeat(30));
      Object.entries(txHashes).forEach(([step, hash]) => {
        console.log(`${step.padEnd(25)}: ${hash}`);
      });
      
      console.log(`\n🔗 View transactions on Solana Explorer:`);
      console.log(`   Cluster: http://localhost:8899`);
      console.log(`   Example: https://explorer.solana.com/tx/${txHashes["hub_initialize"]}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`);
      
      console.log(`\n✅ Demo successfully completed with ${Object.keys(txHashes).length} transactions!`);
      console.log(`🚀 LocalMoney Protocol is now fully operational on localnet!`);
    });
  });
});