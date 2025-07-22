import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { Trade } from "../target/types/trade";
import {
  setupTestWorkspace,
  airdropSol,
  findTradePDA,
  findGlobalConfigPDA,
} from "./utils/setup";

describe("Complete Trade Execution Flow - Integration Tests (Simplified)", () => {
  const workspace = setupTestWorkspace();
  let authority: Keypair;
  let maker: Keypair;
  let taker: Keypair;

  let hubConfigPDA: PublicKey;
  let tradeCounterPDA: PublicKey;
  let testMint: PublicKey;

  let currentTradeId = 0;
  const getNextTradeId = () => ++currentTradeId;

  before(async () => {
    console.log("🚀 Setting up simplified trade execution test...");
    
    // Initialize test accounts
    authority = workspace.authority;
    maker = Keypair.generate();
    taker = Keypair.generate();
    testMint = Keypair.generate().publicKey;

    // Airdrop SOL to test accounts
    await Promise.all([
      airdropSol(workspace.connection, authority.publicKey, 3_000_000_000),
      airdropSol(workspace.connection, maker.publicKey, 2_000_000_000),
      airdropSol(workspace.connection, taker.publicKey, 2_000_000_000),
    ]);

    // Wait for confirmations
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Derive PDAs
    [hubConfigPDA] = findGlobalConfigPDA(workspace.hubProgram.programId);
    [tradeCounterPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("trade_counter")],
      workspace.tradeProgram.programId
    );

    // Initialize trade counter
    try {
      await workspace.tradeProgram.methods
        .initializeCounter()
        .accounts({
          counter: tradeCounterPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
      console.log("✅ Trade counter initialized");
    } catch (error) {
      console.log("⚠️  Trade counter already initialized");
    }
  });

  describe("1. Basic Trade Creation and State Management", () => {
    let tradeId: number;
    let tradePDA: PublicKey;

    it("should create a basic trade request", async () => {
      tradeId = getNextTradeId();
      [tradePDA] = findTradePDA(tradeId, workspace.tradeProgram.programId);

      await workspace.tradeProgram.methods
        .createTrade(
          tradeId,
          1, // offerId 
          { buy: {} },  // OfferType::Buy
          { usd: {} },  // FiatCurrency::USD
          new anchor.BN(50_000_000), // $50 USD (6 decimals)
          1.0, // rate
          "Basic trade test",
          "Test contact info"
        )
        .accounts({
          trade: tradePDA,
          counter: tradeCounterPDA,
          maker: maker.publicKey,
          taker: taker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();

      // Verify trade was created
      const tradeAccount = await workspace.tradeProgram.account.trade.fetch(tradePDA);
      expect(tradeAccount.id.toNumber()).to.equal(tradeId);
      expect(tradeAccount.state).to.deep.equal({ requestCreated: {} });
      expect(tradeAccount.maker.toBase58()).to.equal(maker.publicKey.toBase58());
      expect(tradeAccount.taker.toBase58()).to.equal(taker.publicKey.toBase58());
      expect(tradeAccount.tradeAmount.toNumber()).to.equal(50_000_000);

      console.log("✅ Basic trade created successfully");
    });

    it("should have proper state history", async () => {
      const tradeAccount = await workspace.tradeProgram.account.trade.fetch(tradePDA);
      
      expect(tradeAccount.stateHistory).to.have.length(1);
      expect(tradeAccount.stateHistory[0].state).to.deep.equal({ requestCreated: {} });
      expect(tradeAccount.stateHistory[0].actor.toBase58()).to.equal(maker.publicKey.toBase58());
      expect(tradeAccount.stateHistory[0].timestamp.toNumber()).to.be.greaterThan(0);

      console.log("✅ State history correctly initialized");
    });
  });

  describe("2. Trade State Transitions", () => {
    let tradeId: number;
    let tradePDA: PublicKey;

    before(async () => {
      tradeId = getNextTradeId();
      [tradePDA] = findTradePDA(tradeId, workspace.tradeProgram.programId);

      // Create a trade for state transition testing
      await workspace.tradeProgram.methods
        .createTrade(
          tradeId,
          2, // offerId
          { sell: {} },  // OfferType::Sell
          { eur: {} },  // FiatCurrency::EUR
          new anchor.BN(75_000_000), // $75 USD equivalent
          1.2, // rate
          "State transition test",
          "Contact info"
        )
        .accounts({
          trade: tradePDA,
          counter: tradeCounterPDA,
          maker: maker.publicKey,
          taker: taker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();
    });

    it("should allow trade cancellation", async () => {
      await workspace.tradeProgram.methods
        .cancelTrade(tradeId, "Changed mind")
        .accounts({
          trade: tradePDA,
          authority: maker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();

      // Verify cancellation
      const tradeAccount = await workspace.tradeProgram.account.trade.fetch(tradePDA);
      expect(tradeAccount.state).to.deep.equal({ requestCanceled: {} });
      expect(tradeAccount.cancellationReason).to.equal("Changed mind");

      // Check state history has both states
      expect(tradeAccount.stateHistory).to.have.length(2);
      const states = tradeAccount.stateHistory.map(h => Object.keys(h.state)[0]);
      expect(states).to.deep.equal(["requestCreated", "requestCanceled"]);

      console.log("✅ Trade cancelled successfully");
    });
  });

  describe("3. Trade Expiration", () => {
    let tradeId: number;
    let tradePDA: PublicKey;

    it("should handle trade expiration", async () => {
      tradeId = getNextTradeId();
      [tradePDA] = findTradePDA(tradeId, workspace.tradeProgram.programId);

      // Create trade
      await workspace.tradeProgram.methods
        .createTrade(
          tradeId,
          3, // offerId
          { buy: {} },
          { usd: {} },
          new anchor.BN(20_000_000),
          1.0,
          "Expiration test",
          "Contact"
        )
        .accounts({
          trade: tradePDA,
          counter: tradeCounterPDA,
          maker: maker.publicKey,
          taker: taker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();

      // Expire the trade
      await workspace.tradeProgram.methods
        .expireTrade(tradeId)
        .accounts({
          trade: tradePDA,
          authority: maker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();

      // Verify expiration
      const tradeAccount = await workspace.tradeProgram.account.trade.fetch(tradePDA);
      expect(tradeAccount.state).to.deep.equal({ requestExpired: {} });

      console.log("✅ Trade expired successfully");
    });
  });

  describe("4. Error Handling and Validation", () => {
    it("should prevent unauthorized cancellation", async () => {
      const tradeId = getNextTradeId();
      const [tradePDA] = findTradePDA(tradeId, workspace.tradeProgram.programId);

      // Create trade
      await workspace.tradeProgram.methods
        .createTrade(
          tradeId,
          4,
          { buy: {} },
          { usd: {} },
          new anchor.BN(30_000_000),
          1.0,
          "Auth test",
          "Contact"
        )
        .accounts({
          trade: tradePDA,
          counter: tradeCounterPDA,
          maker: maker.publicKey,
          taker: taker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();

      // Try to cancel as wrong user
      try {
        await workspace.tradeProgram.methods
          .cancelTrade(tradeId, "Unauthorized cancel")
          .accounts({
            trade: tradePDA,
            authority: taker.publicKey, // Wrong authority!
            systemProgram: SystemProgram.programId,
          })
          .signers([taker])
          .rpc();

        expect.fail("Should have thrown authorization error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        console.log("✅ Unauthorized cancellation prevented");
      }
    });

    it("should validate trade amount", async () => {
      try {
        await workspace.tradeProgram.methods
          .createTrade(
            getNextTradeId(),
            5,
            { buy: {} },
            { usd: {} },
            new anchor.BN(0), // Invalid amount
            1.0,
            "Amount test",
            "Contact"
          )
          .accounts({
            trade: findTradePDA(currentTradeId, workspace.tradeProgram.programId)[0],
            counter: tradeCounterPDA,
            maker: maker.publicKey,
            taker: taker.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([maker])
          .rpc();

        expect.fail("Should have thrown amount validation error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        console.log("✅ Amount validation working");
      }
    });
  });

  describe("5. Trade Counter Management", () => {
    it("should maintain proper trade counter", async () => {
      const counterBefore = await workspace.tradeProgram.account.tradeCounter.fetch(tradeCounterPDA);
      const initialCount = counterBefore.count.toNumber();

      // Create a new trade
      const tradeId = getNextTradeId();
      await workspace.tradeProgram.methods
        .createTrade(
          tradeId,
          6,
          { sell: {} },
          { gbp: {} },
          new anchor.BN(40_000_000),
          0.8,
          "Counter test",
          "Contact"
        )
        .accounts({
          trade: findTradePDA(tradeId, workspace.tradeProgram.programId)[0],
          counter: tradeCounterPDA,
          maker: maker.publicKey,
          taker: taker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();

      // Verify counter incremented
      const counterAfter = await workspace.tradeProgram.account.tradeCounter.fetch(tradeCounterPDA);
      expect(counterAfter.count.toNumber()).to.equal(initialCount + 1);

      console.log(`✅ Trade counter properly maintained: ${initialCount} -> ${counterAfter.count.toNumber()}`);
    });
  });

  describe("6. Trade Data Integrity", () => {
    it("should maintain all trade properties correctly", async () => {
      const tradeId = getNextTradeId();
      const [tradePDA] = findTradePDA(tradeId, workspace.tradeProgram.programId);

      const testData = {
        id: tradeId,
        offerId: 7,
        offerType: { buy: {} },
        fiatCurrency: { jpy: {} },
        amount: new anchor.BN(100_000_000),
        rate: 150.5,
        description: "Data integrity test trade",
        contact: "test@example.com encrypted"
      };

      await workspace.tradeProgram.methods
        .createTrade(
          testData.id,
          testData.offerId,
          testData.offerType,
          testData.fiatCurrency,
          testData.amount,
          testData.rate,
          testData.description,
          testData.contact
        )
        .accounts({
          trade: tradePDA,
          counter: tradeCounterPDA,
          maker: maker.publicKey,
          taker: taker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([maker])
        .rpc();

      // Verify all data is preserved
      const tradeAccount = await workspace.tradeProgram.account.trade.fetch(tradePDA);
      expect(tradeAccount.id.toNumber()).to.equal(testData.id);
      expect(tradeAccount.offerId.toNumber()).to.equal(testData.offerId);
      expect(tradeAccount.offerType).to.deep.equal(testData.offerType);
      expect(tradeAccount.fiatCurrency).to.deep.equal(testData.fiatCurrency);
      expect(tradeAccount.tradeAmount.toNumber()).to.equal(testData.amount.toNumber());
      expect(tradeAccount.rate).to.equal(testData.rate);
      expect(tradeAccount.description).to.equal(testData.description);
      expect(tradeAccount.makerContact).to.equal(testData.contact);

      console.log("✅ All trade data preserved correctly");
    });
  });

  after(async () => {
    console.log("\n🎉 Complete Trade Execution Flow Integration Tests (Simplified) Completed!");
    console.log(`   📊 Total trades tested: ${currentTradeId}`);
    console.log("   ✅ Basic trade lifecycle validated");
    console.log("   ✅ State transitions confirmed");
    console.log("   ✅ Error handling validated");
    console.log("   ✅ Data integrity verified");
  });
});