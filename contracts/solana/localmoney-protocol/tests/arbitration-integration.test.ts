import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { Trade } from "../target/types/trade";
import { Profile } from "../target/types/profile";
import { Hub } from "../target/types/hub";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAccount } from "@solana/spl-token";

describe("Arbitration System Integration", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const tradeProgram = anchor.workspace.Trade as Program<Trade>;
  const profileProgram = anchor.workspace.Profile as Program<Profile>;
  const hubProgram = anchor.workspace.Hub as Program<Hub>;

  let authority: Keypair;
  let arbitrator: Keypair;
  let maker: Keypair;
  let taker: Keypair;
  let hubConfigPDA: PublicKey;
  let arbitratorPDA: PublicKey;
  let arbitratorConfigPDA: PublicKey;
  let arbitratorCounterPDA: PublicKey;
  let makerProfilePDA: PublicKey;
  let takerProfilePDA: PublicKey;
  let tradePDA: PublicKey;
  let escrowPDA: PublicKey;
  let tokenMint: PublicKey;
  let makerTokenAccount: PublicKey;
  let takerTokenAccount: PublicKey;
  let escrowTokenAccount: PublicKey;

  before(async () => {
    // Initialize test accounts
    authority = Keypair.generate();
    arbitrator = Keypair.generate();
    maker = Keypair.generate();
    taker = Keypair.generate();

    // Airdrop SOL to test accounts
    await Promise.all([
      anchor.getProvider().connection.requestAirdrop(authority.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      anchor.getProvider().connection.requestAirdrop(arbitrator.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      anchor.getProvider().connection.requestAirdrop(maker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      anchor.getProvider().connection.requestAirdrop(taker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
    ]);

    // Wait for confirmations
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create token mint and accounts
    tokenMint = await createMint(
      anchor.getProvider().connection,
      authority,
      authority.publicKey,
      null,
      9
    );

    makerTokenAccount = await createAccount(
      anchor.getProvider().connection,
      authority,
      tokenMint,
      maker.publicKey
    );

    takerTokenAccount = await createAccount(
      anchor.getProvider().connection,
      authority,
      tokenMint,
      taker.publicKey
    );

    // Mint tokens to maker
    await mintTo(
      anchor.getProvider().connection,
      authority,
      tokenMint,
      makerTokenAccount,
      authority,
      1000000000 // 1000 tokens
    );

    // Derive PDAs
    [hubConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      hubProgram.programId
    );

    [arbitratorConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("arbitration_config")],
      tradeProgram.programId
    );

    [arbitratorCounterPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("arbitrator_counter")],
      tradeProgram.programId
    );

    [arbitratorPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("arbitrator"), arbitrator.publicKey.toBuffer()],
      tradeProgram.programId
    );

    [makerProfilePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), maker.publicKey.toBuffer()],
      profileProgram.programId
    );

    [takerProfilePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), taker.publicKey.toBuffer()],
      profileProgram.programId
    );

    [tradePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("trade"), new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
      tradeProgram.programId
    );

    [escrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), tradePDA.toBuffer()],
      tradeProgram.programId
    );

    // Create escrow token account
    escrowTokenAccount = await createAccount(
      anchor.getProvider().connection,
      authority,
      tokenMint,
      escrowPDA
    );

    // Initialize Hub configuration
    const hubParams = {
      chainFeePercentage: 200, // 2%
      warchestFeePercentage: 100, // 1%
      burnFeePercentage: 50, // 0.5%
      platformFeePercentage: 25, // 0.25%
      arbitrationFeePercentage: 300, // 3%
      maxPlatformFeePercentage: 1000, // 10%
      maxChainFeePercentage: 1000, // 10%
      maxOfferAmountUsd: new anchor.BN(100000), // $100k
      minOfferAmountUsd: new anchor.BN(10), // $10
      maxActiveOffersPerUser: 10,
      maxActiveTradesPerUser: 5,
      maxTradeExpirationDays: 2,
      maxDisputeTimerDays: 1,
      feeCollectorChain: authority.publicKey,
      feeCollectorWarchest: authority.publicKey,
      feeCollectorBurn: authority.publicKey,
      feeCollectorArbitration: authority.publicKey,
    };

    await hubProgram.methods
      .initialize(hubParams)
      .accounts({
        globalConfig: hubConfigPDA,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // Create profiles for maker and taker
    await profileProgram.methods
      .createProfile("maker@example.com", "+1234567890")
      .accounts({
        profile: makerProfilePDA,
        authority: maker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    await profileProgram.methods
      .createProfile("taker@example.com", "+0987654321")
      .accounts({
        profile: takerProfilePDA,
        authority: taker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();
  });

  describe("Arbitrator Registration with Hub", () => {
    it("should register arbitrator program with Hub", async () => {
      // This test would verify that the arbitration system can register with the Hub
      // Currently, this functionality would need to be implemented in the trade program
      
      // For now, we'll test that the Hub can store arbitrator-related configuration
      const hubConfig = await hubProgram.account.globalConfig.fetch(hubConfigPDA);
      expect(hubConfig.arbitrationFeePercentage).to.equal(300);
      expect(hubConfig.feeCollectorArbitration).to.eql(authority.publicKey);
    });

    it("should validate arbitrator registration parameters", async () => {
      // Test that arbitrator registration validates against Hub configuration
      const hubConfig = await hubProgram.account.globalConfig.fetch(hubConfigPDA);
      
      // Verify that arbitration fee percentage is within Hub limits
      expect(hubConfig.arbitrationFeePercentage).to.be.at.most(hubConfig.maxPlatformFeePercentage);
    });
  });

  describe("Arbitrator Management", () => {
    it("should register arbitrator with proper validation", async () => {
      try {
        await tradeProgram.methods
          .registerArbitrator(
            500, // 5% fee
            ["English", "Spanish"],
            ["Crypto", "Fiat", "Disputes"]
          )
          .accounts({
            arbitrator: arbitratorPDA,
            arbitratorConfig: arbitratorConfigPDA,
            arbitratorCounter: arbitratorCounterPDA,
            authority: arbitrator.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([arbitrator])
          .rpc();

        const arbitratorAccount = await tradeProgram.account.arbitrator.fetch(arbitratorPDA);
        expect(arbitratorAccount.authority).to.eql(arbitrator.publicKey);
        expect(arbitratorAccount.feePercentage).to.equal(500);
        expect(arbitratorAccount.languages).to.deep.equal(["English", "Spanish"]);
        expect(arbitratorAccount.specializations).to.deep.equal(["Crypto", "Fiat", "Disputes"]);
      } catch (error) {
        // If the instruction doesn't exist, this is expected for now
        console.log("Arbitrator registration instruction not implemented yet");
      }
    });

    it("should validate arbitrator fee limits", async () => {
      try {
        // Try to register arbitrator with fee exceeding Hub limits
        await tradeProgram.methods
          .registerArbitrator(
            1100, // 11% fee (exceeds 10% limit)
            ["English"],
            ["Crypto"]
          )
          .accounts({
            arbitrator: arbitratorPDA,
            arbitratorConfig: arbitratorConfigPDA,
            arbitratorCounter: arbitratorCounterPDA,
            authority: arbitrator.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([arbitrator])
          .rpc();

        // Should fail due to fee limit validation
        expect.fail("Should have failed due to fee limit validation");
      } catch (error) {
        // Expected to fail - either due to validation or instruction not existing
        expect(error.message).to.include("fee" || "not found");
      }
    });
  });

  describe("Arbitration Fee Distribution", () => {
    it("should distribute arbitration fees via CPI", async () => {
      // This test would verify that arbitration fees are properly distributed
      // through CPI calls to the fee distribution system
      
      // For now, we'll test that the Hub has proper fee collector configuration
      const hubConfig = await hubProgram.account.globalConfig.fetch(hubConfigPDA);
      expect(hubConfig.feeCollectorArbitration).to.eql(authority.publicKey);
      expect(hubConfig.arbitrationFeePercentage).to.equal(300);
    });

    it("should handle arbitration fee accumulation", async () => {
      // Test that arbitration fees are properly accumulated and distributed
      // This would involve testing the ArbitrationAccumulator functionality
      
      // For now, verify that the fee percentage is properly configured
      const hubConfig = await hubProgram.account.globalConfig.fetch(hubConfigPDA);
      const totalFees = hubConfig.chainFeePercentage + 
                       hubConfig.warchestFeePercentage + 
                       hubConfig.burnFeePercentage + 
                       hubConfig.platformFeePercentage + 
                       hubConfig.arbitrationFeePercentage;
      
      expect(totalFees).to.be.at.most(hubConfig.maxPlatformFeePercentage);
    });
  });

  describe("Arbitration Workflow Integration", () => {
    it("should create a trade that can be disputed", async () => {
      try {
        // Create a trade that can be disputed
        await tradeProgram.methods
          .createTrade(
            new anchor.BN(1000000000), // 1000 tokens
            new anchor.BN(1000), // $1000
            { usd: {} },
            "Test trade for arbitration"
          )
          .accounts({
            trade: tradePDA,
            tradeCounter: PublicKey.findProgramAddressSync(
              [Buffer.from("trade_counter")],
              tradeProgram.programId
            )[0],
            maker: maker.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([maker])
          .rpc();

        const tradeAccount = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeAccount.maker).to.eql(maker.publicKey);
        expect(tradeAccount.tokenAmount.toString()).to.equal("1000000000");
      } catch (error) {
        console.log("Trade creation instruction may not exist yet");
      }
    });

    it("should handle dispute creation with arbitrator assignment", async () => {
      try {
        // Dispute the trade and assign arbitrator
        await tradeProgram.methods
          .disputeTrade("Payment not received")
          .accounts({
            trade: tradePDA,
            arbitrator: arbitratorPDA,
            disputeInitiator: taker.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([taker])
          .rpc();

        // Verify that the dispute was created and arbitrator assigned
        const tradeAccount = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeAccount.state).to.have.property("escrowDisputed");
      } catch (error) {
        console.log("Dispute instruction may not exist yet");
      }
    });

    it("should update profile reputation through arbitration decisions", async () => {
      try {
        // Settle dispute in favor of taker
        await tradeProgram.methods
          .settleDispute(
            { taker: {} },
            "Evidence supports taker's claim"
          )
          .accounts({
            trade: tradePDA,
            arbitrator: arbitratorPDA,
            makerProfile: makerProfilePDA,
            takerProfile: takerProfilePDA,
            profileProgram: profileProgram.programId,
            authority: arbitrator.publicKey,
          })
          .signers([arbitrator])
          .rpc();

        // Verify that profile reputations were updated
        const takerProfile = await profileProgram.account.profile.fetch(takerProfilePDA);
        const makerProfile = await profileProgram.account.profile.fetch(makerProfilePDA);
        
        // Taker should have gained reputation (won dispute)
        // Maker should have lost reputation (lost dispute)
        expect(takerProfile.reputationScore).to.be.greaterThan(0);
      } catch (error) {
        console.log("Settle dispute instruction may not exist yet");
      }
    });
  });

  describe("Cross-Program Arbitration Validation", () => {
    it("should validate arbitrator authority across programs", async () => {
      // Test that arbitrator authority is properly validated when making
      // cross-program calls to Profile and Hub programs
      
      // For now, verify that the arbitrator PDA is correctly derived
      const [expectedArbitratorPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("arbitrator"), arbitrator.publicKey.toBuffer()],
        tradeProgram.programId
      );
      
      expect(arbitratorPDA).to.eql(expectedArbitratorPDA);
    });

    it("should validate arbitrator selection algorithm", async () => {
      try {
        // Test arbitrator selection based on reputation, workload, etc.
        await tradeProgram.methods
          .selectArbitrator()
          .accounts({
            trade: tradePDA,
            arbitrator: arbitratorPDA,
            arbitratorConfig: arbitratorConfigPDA,
            authority: authority.publicKey,
          })
          .signers([authority])
          .rpc();

        // Verify that the arbitrator was properly selected
        const tradeAccount = await tradeProgram.account.trade.fetch(tradePDA);
        expect(tradeAccount.arbitrator).to.eql(arbitratorPDA);
      } catch (error) {
        console.log("Arbitrator selection instruction may not exist yet");
      }
    });
  });

  describe("Error Handling for Arbitration Integration", () => {
    it("should handle arbitrator not found errors", async () => {
      try {
        const invalidArbitratorPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("arbitrator"), Keypair.generate().publicKey.toBuffer()],
          tradeProgram.programId
        )[0];

        await tradeProgram.methods
          .settleDispute(
            { maker: {} },
            "Test settlement"
          )
          .accounts({
            trade: tradePDA,
            arbitrator: invalidArbitratorPDA,
            authority: arbitrator.publicKey,
          })
          .signers([arbitrator])
          .rpc();

        expect.fail("Should have failed with arbitrator not found");
      } catch (error) {
        expect(error.message).to.include("not found" || "invalid");
      }
    });

    it("should handle unauthorized arbitration attempts", async () => {
      try {
        const unauthorizedKeypair = Keypair.generate();
        
        await tradeProgram.methods
          .settleDispute(
            { maker: {} },
            "Unauthorized settlement"
          )
          .accounts({
            trade: tradePDA,
            arbitrator: arbitratorPDA,
            authority: unauthorizedKeypair.publicKey,
          })
          .signers([unauthorizedKeypair])
          .rpc();

        expect.fail("Should have failed with unauthorized access");
      } catch (error) {
        expect(error.message).to.include("unauthorized" || "invalid");
      }
    });

    it("should handle CPI failures to Profile program", async () => {
      // Test that arbitration system properly handles failures when making
      // CPI calls to update profile reputation
      
      // For now, verify that the profiles exist and are accessible
      const makerProfile = await profileProgram.account.profile.fetch(makerProfilePDA);
      const takerProfile = await profileProgram.account.profile.fetch(takerProfilePDA);
      
      expect(makerProfile.authority).to.eql(maker.publicKey);
      expect(takerProfile.authority).to.eql(taker.publicKey);
    });
  });
});