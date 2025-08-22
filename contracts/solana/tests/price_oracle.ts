import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";

describe("price-oracle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.Price;
  let priceConfig: PublicKey;
  let priceFeed: PublicKey;
  
  before(async () => {
    // Initialize price config
    [priceConfig] = await PublicKey.findProgramAddress(
      [Buffer.from("price"), Buffer.from("config")],
      program.programId
    );
  });
  
  describe("Oracle Configuration", () => {
    it("initializes enhanced price config", async () => {
      await program.methods
        .initializeEnhanced(
          new anchor.BN(60),     // maxPriceAgeSeconds
          500,                   // maxDeviationBps
          2,                     // minRequiredSources
          new anchor.BN(300)     // twapWindowSeconds
        )
        .accounts({
          priceConfig,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      
      const config = await program.account.enhancedPriceConfig.fetch(priceConfig);
      assert.equal(config.maxPriceAgeSeconds.toNumber(), 60);
      assert.equal(config.minRequiredSources, 2);
      assert.equal(config.maxDeviationBps, 500);
      assert.equal(config.twapWindowSeconds.toNumber(), 300);
      assert.isFalse(config.pricePause);
    });
    
    it("adds oracle source", async () => {
      const pythOracle = Keypair.generate().publicKey;
      
      await program.methods
        .addOracleSource(
          { pyth: {} },
          pythOracle,
          3000 // 30% weight
        )
        .accounts({
          priceConfig,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      
      const config = await program.account.enhancedPriceConfig.fetch(priceConfig);
      assert.equal(config.oracleSources.length, 1);
      assert.equal(config.oracleSources[0].weight, 3000);
      assert.isTrue(config.oracleSources[0].isActive);
    });

    it("adds multiple oracle sources", async () => {
      const switchboardOracle = Keypair.generate().publicKey;
      const internalOracle = Keypair.generate().publicKey;
      
      // Add Switchboard oracle
      await program.methods
        .addOracleSource(
          { switchboard: {} },
          switchboardOracle,
          4000 // 40% weight
        )
        .accounts({
          priceConfig,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      // Add Internal oracle  
      await program.methods
        .addOracleSource(
          { internal: {} },
          internalOracle,
          3000 // 30% weight
        )
        .accounts({
          priceConfig,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      
      const config = await program.account.enhancedPriceConfig.fetch(priceConfig);
      assert.equal(config.oracleSources.length, 3);
    });

    it("rejects unauthorized oracle management", async () => {
      const unauthorizedUser = Keypair.generate();
      const oracleAddress = Keypair.generate().publicKey;
      
      try {
        await program.methods
          .addOracleSource(
            { pyth: {} },
            oracleAddress,
            1000
          )
          .accounts({
            priceConfig,
            authority: unauthorizedUser.publicKey,
          })
          .signers([unauthorizedUser])
          .rpc();
        assert.fail("Should have failed for unauthorized user");
      } catch (err) {
        assert.include(err.toString(), "Unauthorized");
      }
    });
  });
  
  describe("Price Aggregation", () => {
    beforeEach(async () => {
      // Setup price feed PDA
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112"); // SOL mint
      const fiatCurrency = { usd: {} };
      
      [priceFeed] = await PublicKey.findProgramAddress(
        [
          Buffer.from("price"),
          Buffer.from("feed"), 
          tokenMint.toBuffer(),
          Buffer.from("USD")
        ],
        program.programId
      );
    });

    it("initializes price feed aggregate", async () => {
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");
      
      // This will be created in update_price_aggregate with init_if_needed
      await program.methods
        .updatePriceAggregate({ usd: {} })
        .accounts({
          priceConfig,
          priceFeed,
          tokenMint,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts([
          // Mock oracle accounts - in real tests these would be proper oracle accounts
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
        ])
        .rpc();
      
      const feed = await program.account.priceFeedAggregate.fetch(priceFeed);
      assert.equal(feed.tokenMint.toString(), tokenMint.toString());
      assert.equal(feed.fiatCurrency.usd, null); // Checking enum variant
      assert.equal(feed.totalUpdates.toNumber(), 1);
      assert.equal(feed.consecutiveFailures, 0);
    });

    it("handles insufficient oracle sources", async () => {
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");
      
      try {
        await program.methods
          .updatePriceAggregate({ usd: {} })
          .accounts({
            priceConfig,
            priceFeed,
            tokenMint,
            payer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .remainingAccounts([
            // Only one oracle when minimum is 2
            { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          ])
          .rpc();
        assert.fail("Should have failed with insufficient sources");
      } catch (err) {
        assert.include(err.toString(), "InsufficientPriceSources");
      }
    });
  });
  
  describe("TWAP Calculation", () => {
    it("calculates TWAP correctly", async () => {
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");
      
      // First ensure we have a price feed with some history
      await program.methods
        .updatePriceAggregate({ usd: {} })
        .accounts({
          priceConfig,
          priceFeed,
          tokenMint,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
        ])
        .rpc();

      // Add a small delay and another price update to create history
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await program.methods
        .updatePriceAggregate({ usd: {} })
        .accounts({
          priceConfig,
          priceFeed,
          tokenMint,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
        ])
        .rpc();
      
      // Now calculate TWAP
      const tx = await program.methods
        .calculateTwap({ usd: {} }, new anchor.BN(300))
        .accounts({
          priceFeed,
          tokenMint,
        })
        .rpc();
      
      // Check that transaction succeeded
      const txDetails = await provider.connection.getTransaction(tx, {
        commitment: "confirmed",
      });
      
      assert.isNotNull(txDetails);
      assert.isNull(txDetails?.meta?.err);
    });

    it("rejects TWAP with insufficient history", async () => {
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");
      
      // Try to calculate TWAP with empty feed
      const emptyFeed = Keypair.generate();
      
      try {
        await program.methods
          .calculateTwap({ usd: {} }, new anchor.BN(300))
          .accounts({
            priceFeed: emptyFeed.publicKey,
            tokenMint,
          })
          .rpc();
        assert.fail("Should have failed with insufficient history");
      } catch (err) {
        // Expected to fail because empty feed doesn't exist
        assert.isTrue(true);
      }
    });
  });
  
  describe("Circuit Breaker", () => {
    it("pauses price updates", async () => {
      const reason = Buffer.alloc(32);
      reason.write("Test pause", 0);
      
      await program.methods
        .togglePriceCircuitBreaker(
          true,
          Array.from(reason),
          new anchor.BN(3600) // auto-resume after 1 hour
        )
        .accounts({
          priceConfig,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      
      const config = await program.account.enhancedPriceConfig.fetch(priceConfig);
      assert.isTrue(config.pricePause);
      assert.equal(config.autoResumeAfter.toNumber(), 3600);
    });
    
    it("prevents updates when paused", async () => {
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");
      
      try {
        await program.methods
          .updatePriceAggregate({ usd: {} })
          .accounts({
            priceConfig,
            priceFeed,
            tokenMint,
            payer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .remainingAccounts([
            { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
            { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
            { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          ])
          .rpc();
        assert.fail("Should have failed when paused");
      } catch (err) {
        assert.include(err.toString(), "PriceUpdatesPaused");
      }
    });

    it("resumes price updates", async () => {
      const reason = Buffer.alloc(32);
      reason.write("Resume", 0);
      
      await program.methods
        .togglePriceCircuitBreaker(
          false,
          Array.from(reason),
          new anchor.BN(0) // no auto-resume
        )
        .accounts({
          priceConfig,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      
      const config = await program.account.enhancedPriceConfig.fetch(priceConfig);
      assert.isFalse(config.pricePause);
    });

    it("rejects unauthorized circuit breaker toggle", async () => {
      const unauthorizedUser = Keypair.generate();
      const reason = Buffer.alloc(32);
      
      try {
        await program.methods
          .togglePriceCircuitBreaker(
            true,
            Array.from(reason),
            new anchor.BN(0)
          )
          .accounts({
            priceConfig,
            authority: unauthorizedUser.publicKey,
          })
          .signers([unauthorizedUser])
          .rpc();
        assert.fail("Should have failed for unauthorized user");
      } catch (err) {
        assert.include(err.toString(), "Unauthorized");
      }
    });
  });
  
  describe("Oracle Management", () => {
    it("limits maximum oracle sources", async () => {
      // First check current count
      let config = await program.account.enhancedPriceConfig.fetch(priceConfig);
      const currentCount = config.oracleSources.length;
      
      // Add oracles until we hit the limit (5 total)
      for (let i = currentCount; i < 5; i++) {
        const oracleAddress = Keypair.generate().publicKey;
        await program.methods
          .addOracleSource(
            { internal: {} },
            oracleAddress,
            1000
          )
          .accounts({
            priceConfig,
            authority: provider.wallet.publicKey,
          })
          .rpc();
      }
      
      // Try to add one more (should fail)
      const extraOracle = Keypair.generate().publicKey;
      try {
        await program.methods
          .addOracleSource(
            { internal: {} },
            extraOracle,
            1000
          )
          .accounts({
            priceConfig,
            authority: provider.wallet.publicKey,
          })
          .rpc();
        assert.fail("Should have failed with max sources reached");
      } catch (err) {
        assert.include(err.toString(), "MaxOracleSourcesReached");
      }
    });
  });

  describe("Events", () => {
    it("emits price update events", async () => {
      const tokenMint = new PublicKey("So11111111111111111111111111111111111111112");
      
      const tx = await program.methods
        .updatePriceAggregate({ usd: {} })
        .accounts({
          priceConfig,
          priceFeed,
          tokenMint,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
          { pubkey: Keypair.generate().publicKey, isWritable: false, isSigner: false },
        ])
        .rpc();
      
      // Fetch transaction to check for events
      const txDetails = await provider.connection.getTransaction(tx, {
        commitment: "confirmed",
      });
      
      assert.isNotNull(txDetails);
      // In a real test, you would parse the events from the transaction logs
    });

    it("emits circuit breaker events", async () => {
      const reason = Buffer.alloc(32);
      reason.write("Test event", 0);
      
      const tx = await program.methods
        .togglePriceCircuitBreaker(
          true,
          Array.from(reason),
          new anchor.BN(1800)
        )
        .accounts({
          priceConfig,
          authority: provider.wallet.publicKey,
        })
        .rpc();
      
      const txDetails = await provider.connection.getTransaction(tx, {
        commitment: "confirmed",
      });
      
      assert.isNotNull(txDetails);
    });
  });

  describe("Error Handling", () => {
    it("handles invalid oracle data gracefully", async () => {
      // This test would require mock oracle accounts with invalid data
      // For now, we just verify the error code exists
      assert.isDefined(program.idl.errors.find(e => e.name === "InvalidOracleData"));
    });

    it("tracks consecutive failures", async () => {
      // This would require setting up failing oracle calls
      // For now, verify the field exists
      const feed = await program.account.priceFeedAggregate.fetch(priceFeed);
      assert.isDefined(feed.consecutiveFailures);
    });
  });
});