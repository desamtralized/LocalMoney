import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, SystemProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
import { expect } from "chai";

// Import program types
import { Trade } from "../target/types/trade";
import { Hub } from "../target/types/hub";
import { Profile } from "../target/types/profile";
import { Offer } from "../target/types/offer";

describe("Arbitration System Integration Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const tradeProgram = anchor.workspace.Trade as Program<Trade>;
  const hubProgram = anchor.workspace.Hub as Program<Hub>;
  const profileProgram = anchor.workspace.Profile as Program<Profile>;
  const offerProgram = anchor.workspace.Offer as Program<Offer>;

  // Test accounts
  let admin: Keypair;
  let authority: Keypair;
  let arbitrator1: Keypair;
  let arbitrator2: Keypair;
  let buyer: Keypair;
  let seller: Keypair;
  let treasury: Keypair;

  // Token setup
  let tokenMint: anchor.web3.PublicKey;
  let buyerTokenAccount: anchor.web3.PublicKey;
  let sellerTokenAccount: anchor.web3.PublicKey;
  let arbitratorTokenAccount: anchor.web3.PublicKey;
  let treasuryTokenAccount: anchor.web3.PublicKey;

  // PDA accounts
  let hubConfig: anchor.web3.PublicKey;
  let buyerProfile: anchor.web3.PublicKey;
  let sellerProfile: anchor.web3.PublicKey;
  let offer: anchor.web3.PublicKey;
  let trade: anchor.web3.PublicKey;
  let arbitratorPool: anchor.web3.PublicKey;
  let arbitratorInfo1: anchor.web3.PublicKey;
  let arbitratorInfo2: anchor.web3.PublicKey;
  let escrowTokenAccount: anchor.web3.PublicKey;

  // Test constants
  const TRADE_ID = new anchor.BN(12345);
  const OFFER_ID = new anchor.BN(67890);
  const TRADE_AMOUNT = new anchor.BN(1000_000); // 1 token with 6 decimals
  const LOCKED_PRICE = new anchor.BN(50_000); // $50 in cents

  const FiatCurrency = {
    USD: { usd: {} },
  };

  before(async () => {
    // Initialize keypairs
    admin = Keypair.generate();
    authority = Keypair.generate();
    arbitrator1 = Keypair.generate();
    arbitrator2 = Keypair.generate();
    buyer = Keypair.generate();
    seller = Keypair.generate();
    treasury = Keypair.generate();

    // Airdrop SOL to accounts
    const accounts = [admin, authority, arbitrator1, arbitrator2, buyer, seller, treasury];
    for (const account of accounts) {
      await provider.connection.requestAirdrop(account.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    }

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create token mint
    tokenMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6 // 6 decimals
    );

    // Create token accounts
    buyerTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      buyer,
      tokenMint,
      buyer.publicKey
    );

    sellerTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      seller,
      tokenMint,
      seller.publicKey
    );

    arbitratorTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      arbitrator1,
      tokenMint,
      arbitrator1.publicKey
    );

    treasuryTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      treasury,
      tokenMint,
      treasury.publicKey
    );

    // Mint tokens to seller (they need to fund escrow)
    await mintTo(
      provider.connection,
      admin,
      tokenMint,
      sellerTokenAccount,
      admin.publicKey,
      10_000_000 // 10 tokens
    );

    // Derive PDA addresses
    [hubConfig] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("hub_config")],
      hubProgram.programId
    );

    [buyerProfile] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), buyer.publicKey.toBuffer()],
      profileProgram.programId
    );

    [sellerProfile] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), seller.publicKey.toBuffer()],
      profileProgram.programId
    );

    [offer] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("offer"), OFFER_ID.toArrayLike(Buffer, "le", 8)],
      offerProgram.programId
    );

    [trade] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("trade"), TRADE_ID.toArrayLike(Buffer, "le", 8)],
      tradeProgram.programId
    );

    [arbitratorPool] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("arbitrator-pool"), Buffer.from("USD")],
      tradeProgram.programId
    );

    [arbitratorInfo1] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("arbitrator"), arbitrator1.publicKey.toBuffer(), Buffer.from("USD")],
      tradeProgram.programId
    );

    [arbitratorInfo2] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("arbitrator"), arbitrator2.publicKey.toBuffer(), Buffer.from("USD")],
      tradeProgram.programId
    );

    [escrowTokenAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("trade"), Buffer.from("escrow"), TRADE_ID.toArrayLike(Buffer, "le", 8)],
      tradeProgram.programId
    );

    // Initialize hub config
    try {
      await hubProgram.methods
        .initialize({
          feeRate: 200, // 2%
          burnRate: 33, // 33% of fees
          chainRate: 33, // 33% of fees
          warchestRate: 34, // 34% of fees
        })
        .accounts({
          config: hubConfig,
          authority: authority.publicKey,
          payer: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    } catch (err) {
      // Might already be initialized
      console.log("Hub config might already exist:", err.message);
    }

    // Initialize profiles
    for (const user of [buyer, seller]) {
      const [userProfile] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("profile"), user.publicKey.toBuffer()],
        profileProgram.programId
      );

      try {
        await profileProgram.methods
          .createProfile("Test User", "test@example.com")
          .accounts({
            profile: userProfile,
            user: user.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([user])
          .rpc();
      } catch (err) {
        // Might already exist
        console.log("Profile might already exist:", err.message);
      }
    }

    // Create offer
    try {
      await offerProgram.methods
        .createOffer({
          offerId: OFFER_ID,
          fiatCurrency: FiatCurrency.USD,
          rate: new anchor.BN(50000), // $50 per token
          minAmount: new anchor.BN(100000), // 0.1 token minimum
          maxAmount: new anchor.BN(10000000), // 10 tokens maximum
          paymentMethods: ["bank_transfer"],
          terms: "Standard trading terms",
          automatic: false,
        })
        .accounts({
          offer: offer,
          owner: seller.publicKey,
          ownerProfile: sellerProfile,
          tokenMint: tokenMint,
          systemProgram: SystemProgram.programId,
          profileProgram: profileProgram.programId,
        })
        .signers([seller])
        .rpc();
    } catch (err) {
      console.log("Offer might already exist:", err.message);
    }
  });

  describe("Arbitrator Management", () => {
    it("should register arbitrator successfully", async () => {
      await tradeProgram.methods
        .registerArbitrator(FiatCurrency.USD)
        .accounts({
          hubConfig: hubConfig,
          arbitratorPool: arbitratorPool,
          arbitratorInfo: arbitratorInfo1,
          arbitrator: arbitrator1.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Verify arbitrator was added to pool
      const poolAccount = await tradeProgram.account.arbitratorPool.fetch(arbitratorPool);
      expect(poolAccount.arbitrators).to.include(arbitrator1.publicKey);

      // Verify arbitrator info was created
      const infoAccount = await tradeProgram.account.arbitratorInfo.fetch(arbitratorInfo1);
      expect(infoAccount.arbitrator.toString()).to.equal(arbitrator1.publicKey.toString());
      expect(infoAccount.isActive).to.be.true;
      expect(infoAccount.totalCases.toNumber()).to.equal(0);
      expect(infoAccount.resolvedCases.toNumber()).to.equal(0);
      expect(infoAccount.reputationScore).to.equal(5000); // 50%
    });

    it("should register second arbitrator", async () => {
      await tradeProgram.methods
        .registerArbitrator(FiatCurrency.USD)
        .accounts({
          hubConfig: hubConfig,
          arbitratorPool: arbitratorPool,
          arbitratorInfo: arbitratorInfo2,
          arbitrator: arbitrator2.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const poolAccount = await tradeProgram.account.arbitratorPool.fetch(arbitratorPool);
      expect(poolAccount.arbitrators).to.have.lengthOf(2);
      expect(poolAccount.arbitrators).to.include(arbitrator2.publicKey);
    });

    it("should fail to register arbitrator with wrong authority", async () => {
      const wrongAuthority = Keypair.generate();
      await provider.connection.requestAirdrop(wrongAuthority.publicKey, anchor.web3.LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const [wrongArbitratorInfo] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("arbitrator"), wrongAuthority.publicKey.toBuffer(), Buffer.from("USD")],
        tradeProgram.programId
      );

      try {
        await tradeProgram.methods
          .registerArbitrator(FiatCurrency.USD)
          .accounts({
            hubConfig: hubConfig,
            arbitratorPool: arbitratorPool,
            arbitratorInfo: wrongArbitratorInfo,
            arbitrator: wrongAuthority.publicKey,
            authority: wrongAuthority.publicKey, // Wrong authority
            systemProgram: SystemProgram.programId,
          })
          .signers([wrongAuthority])
          .rpc();
        
        expect.fail("Should have failed with unauthorized");
      } catch (err) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("should deactivate arbitrator", async () => {
      await tradeProgram.methods
        .deactivateArbitrator(FiatCurrency.USD)
        .accounts({
          hubConfig: hubConfig,
          arbitratorPool: arbitratorPool,
          arbitratorInfo: arbitratorInfo2,
          arbitrator: arbitrator2.publicKey,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      // Verify arbitrator was removed from pool
      const poolAccount = await tradeProgram.account.arbitratorPool.fetch(arbitratorPool);
      expect(poolAccount.arbitrators).to.not.include(arbitrator2.publicKey);

      // Verify arbitrator info was marked inactive
      const infoAccount = await tradeProgram.account.arbitratorInfo.fetch(arbitratorInfo2);
      expect(infoAccount.isActive).to.be.false;
    });
  });

  describe("Trade Creation and Arbitrator Assignment", () => {
    it("should create trade and assign arbitrator", async () => {
      // Create trade first
      await tradeProgram.methods
        .createTrade({
          tradeId: TRADE_ID,
          offerId: OFFER_ID,
          amount: TRADE_AMOUNT,
          lockedPrice: LOCKED_PRICE,
          expiryDuration: new anchor.BN(86400), // 24 hours
          arbitrator: arbitrator1.publicKey, // Will be overridden by assignment
          buyerContact: "buyer@example.com",
        })
        .accounts({
          trade: trade,
          offer: offer,
          buyerProfile: buyerProfile,
          tokenMint: tokenMint,
          buyer: buyer.publicKey,
          profileProgram: profileProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      // Assign arbitrator using simplified assignment function
      await tradeProgram.methods
        .assignArbitrator(TRADE_ID)
        .accounts({
          trade: trade,
          arbitratorPool: arbitratorPool,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      // Verify trade was created and arbitrator assigned
      const tradeAccount = await tradeProgram.account.trade.fetch(trade);
      expect(tradeAccount.id.toString()).to.equal(TRADE_ID.toString());
      expect(tradeAccount.arbitrator.toString()).to.equal(arbitrator1.publicKey.toString());
      expect(tradeAccount.state).to.deep.equal({ requestCreated: {} });
    });

    it("should accept trade request", async () => {
      await tradeProgram.methods
        .acceptRequest("seller@example.com")
        .accounts({
          trade: trade,
          seller: seller.publicKey,
        })
        .signers([seller])
        .rpc();

      const tradeAccount = await tradeProgram.account.trade.fetch(trade);
      expect(tradeAccount.state).to.deep.equal({ requestAccepted: {} });
      expect(tradeAccount.sellerContact).to.equal("seller@example.com");
    });

    it("should fund escrow", async () => {
      await tradeProgram.methods
        .fundEscrow()
        .accounts({
          trade: trade,
          escrowTokenAccount: escrowTokenAccount,
          sellerTokenAccount: sellerTokenAccount,
          tokenMint: tokenMint,
          seller: seller.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const tradeAccount = await tradeProgram.account.trade.fetch(trade);
      expect(tradeAccount.state).to.deep.equal({ escrowFunded: {} });

      // Verify tokens were transferred to escrow
      const escrowAccount = await getAccount(provider.connection, escrowTokenAccount);
      expect(escrowAccount.amount.toString()).to.equal(TRADE_AMOUNT.toString());
    });

    it("should mark fiat deposited", async () => {
      await tradeProgram.methods
        .markFiatDeposited()
        .accounts({
          trade: trade,
          buyer: buyer.publicKey,
        })
        .signers([buyer])
        .rpc();

      const tradeAccount = await tradeProgram.account.trade.fetch(trade);
      expect(tradeAccount.state).to.deep.equal({ fiatDeposited: {} });
      expect(tradeAccount.disputeWindowAt).to.not.be.null;
    });
  });

  describe("Dispute Management", () => {
    it("should initiate dispute", async () => {
      // Wait for dispute window to open (in real scenario, would wait 24 hours)
      // For testing, we'll advance time programmatically if needed
      
      await tradeProgram.methods
        .initiateDispute("buyer-dispute@example.com", "seller-dispute@example.com")
        .accounts({
          trade: trade,
          buyerProfile: buyerProfile,
          sellerProfile: sellerProfile,
          user: buyer.publicKey,
          profileProgram: profileProgram.programId,
        })
        .signers([buyer])
        .rpc();

      const tradeAccount = await tradeProgram.account.trade.fetch(trade);
      expect(tradeAccount.state).to.deep.equal({ escrowDisputed: {} });
      expect(tradeAccount.buyerContact).to.equal("buyer-dispute@example.com");
      expect(tradeAccount.sellerContact).to.equal("seller-dispute@example.com");
    });

    it("should settle dispute in favor of buyer", async () => {
      await tradeProgram.methods
        .settleDispute(buyer.publicKey)
        .accounts({
          trade: trade,
          hubConfig: hubConfig,
          offer: offer,
          arbitratorInfo: arbitratorInfo1,
          escrowTokenAccount: escrowTokenAccount,
          winnerTokenAccount: buyerTokenAccount,
          arbitratorTokenAccount: arbitratorTokenAccount,
          treasuryTokenAccount: treasuryTokenAccount,
          buyerProfile: buyerProfile,
          sellerProfile: sellerProfile,
          tokenMint: tokenMint,
          winner: buyer.publicKey,
          treasury: treasury.publicKey,
          arbitrator: arbitrator1.publicKey,
          profileProgram: profileProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([arbitrator1])
        .rpc();

      const tradeAccount = await tradeProgram.account.trade.fetch(trade);
      expect(tradeAccount.state).to.deep.equal({ settledForTaker: {} });

      // Verify arbitrator stats were updated
      const arbitratorInfoAccount = await tradeProgram.account.arbitratorInfo.fetch(arbitratorInfo1);
      expect(arbitratorInfoAccount.resolvedCases.toNumber()).to.equal(1);

      // Verify token distributions
      const buyerAccount = await getAccount(provider.connection, buyerTokenAccount);
      expect(buyerAccount.amount > 0n).to.be.true; // Buyer received tokens

      const arbitratorAccount = await getAccount(provider.connection, arbitratorTokenAccount);
      expect(arbitratorAccount.amount > 0n).to.be.true; // Arbitrator received fee
    });
  });

  describe("Error Conditions", () => {
    let testTrade2: anchor.web3.PublicKey;
    const TEST_TRADE_ID_2 = new anchor.BN(54321);

    before(async () => {
      [testTrade2] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("trade"), TEST_TRADE_ID_2.toArrayLike(Buffer, "le", 8)],
        tradeProgram.programId
      );

      // Create another trade for error testing
      await tradeProgram.methods
        .createTrade({
          tradeId: TEST_TRADE_ID_2,
          offerId: OFFER_ID,
          amount: TRADE_AMOUNT,
          lockedPrice: LOCKED_PRICE,
          expiryDuration: new anchor.BN(86400),
          arbitrator: arbitrator1.publicKey,
          buyerContact: "buyer2@example.com",
        })
        .accounts({
          trade: testTrade2,
          offer: offer,
          buyerProfile: buyerProfile,
          tokenMint: tokenMint,
          buyer: buyer.publicKey,
          profileProgram: profileProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
    });

    it("should fail to initiate dispute with wrong state", async () => {
      try {
        await tradeProgram.methods
          .initiateDispute("test@example.com", "test2@example.com")
          .accounts({
            trade: testTrade2, // Trade is in RequestCreated state
            buyerProfile: buyerProfile,
            sellerProfile: sellerProfile,
            user: buyer.publicKey,
            profileProgram: profileProgram.programId,
          })
          .signers([buyer])
          .rpc();
        
        expect.fail("Should have failed with invalid trade state");
      } catch (err) {
        expect(err.message).to.include("InvalidTradeState");
      }
    });

    it("should fail to settle dispute with unauthorized arbitrator", async () => {
      const unauthorizedArbitrator = Keypair.generate();
      await provider.connection.requestAirdrop(unauthorizedArbitrator.publicKey, anchor.web3.LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        await tradeProgram.methods
          .settleDispute(buyer.publicKey)
          .accounts({
            trade: trade, // This trade is already settled
            hubConfig: hubConfig,
            offer: offer,
            arbitratorInfo: arbitratorInfo1,
            escrowTokenAccount: escrowTokenAccount,
            winnerTokenAccount: buyerTokenAccount,
            arbitratorTokenAccount: arbitratorTokenAccount,
            treasuryTokenAccount: treasuryTokenAccount,
            buyerProfile: buyerProfile,
            sellerProfile: sellerProfile,
            tokenMint: tokenMint,
            winner: buyer.publicKey,
            treasury: treasury.publicKey,
            arbitrator: unauthorizedArbitrator.publicKey, // Wrong arbitrator
            profileProgram: profileProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([unauthorizedArbitrator])
          .rpc();
        
        expect.fail("Should have failed with unauthorized");
      } catch (err) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("should fail to register duplicate arbitrator", async () => {
      try {
        await tradeProgram.methods
          .registerArbitrator(FiatCurrency.USD)
          .accounts({
            hubConfig: hubConfig,
            arbitratorPool: arbitratorPool,
            arbitratorInfo: arbitratorInfo1, // Same arbitrator
            arbitrator: arbitrator1.publicKey,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        
        expect.fail("Should have failed with arbitrator already exists");
      } catch (err) {
        expect(err.message).to.include("ArbitratorAlreadyExists");
      }
    });
  });

  describe("Fee Calculations", () => {
    it("should calculate arbitration fees correctly", async () => {
      // Create a new trade to test fee calculations
      const TEST_TRADE_ID_3 = new anchor.BN(99999);
      const [testTrade3] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("trade"), TEST_TRADE_ID_3.toArrayLike(Buffer, "le", 8)],
        tradeProgram.programId
      );

      const [escrowTokenAccount3] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("trade"), Buffer.from("escrow"), TEST_TRADE_ID_3.toArrayLike(Buffer, "le", 8)],
        tradeProgram.programId
      );

      // Create and progress trade to disputed state
      await tradeProgram.methods
        .createTrade({
          tradeId: TEST_TRADE_ID_3,
          offerId: OFFER_ID,
          amount: new anchor.BN(2000_000), // 2 tokens
          lockedPrice: LOCKED_PRICE,
          expiryDuration: new anchor.BN(86400),
          arbitrator: arbitrator1.publicKey,
          buyerContact: "buyer3@example.com",
        })
        .accounts({
          trade: testTrade3,
          offer: offer,
          buyerProfile: buyerProfile,
          tokenMint: tokenMint,
          buyer: buyer.publicKey,
          profileProgram: profileProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      await tradeProgram.methods
        .acceptRequest("seller3@example.com")
        .accounts({
          trade: testTrade3,
          seller: seller.publicKey,
        })
        .signers([seller])
        .rpc();

      await tradeProgram.methods
        .fundEscrow()
        .accounts({
          trade: testTrade3,
          escrowTokenAccount: escrowTokenAccount3,
          sellerTokenAccount: sellerTokenAccount,
          tokenMint: tokenMint,
          seller: seller.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      await tradeProgram.methods
        .markFiatDeposited()
        .accounts({
          trade: testTrade3,
          buyer: buyer.publicKey,
        })
        .signers([buyer])
        .rpc();

      await tradeProgram.methods
        .initiateDispute("buyer3@example.com", "seller3@example.com")
        .accounts({
          trade: testTrade3,
          buyerProfile: buyerProfile,
          sellerProfile: sellerProfile,
          user: buyer.publicKey,
          profileProgram: profileProgram.programId,
        })
        .signers([buyer])
        .rpc();

      // Record balances before settlement
      const buyerBalanceBefore = await getAccount(provider.connection, buyerTokenAccount);
      const arbitratorBalanceBefore = await getAccount(provider.connection, arbitratorTokenAccount);
      const treasuryBalanceBefore = await getAccount(provider.connection, treasuryTokenAccount);

      // Settle dispute
      await tradeProgram.methods
        .settleDispute(buyer.publicKey)
        .accounts({
          trade: testTrade3,
          hubConfig: hubConfig,
          offer: offer,
          arbitratorInfo: arbitratorInfo1,
          escrowTokenAccount: escrowTokenAccount3,
          winnerTokenAccount: buyerTokenAccount,
          arbitratorTokenAccount: arbitratorTokenAccount,
          treasuryTokenAccount: treasuryTokenAccount,
          buyerProfile: buyerProfile,
          sellerProfile: sellerProfile,
          tokenMint: tokenMint,
          winner: buyer.publicKey,
          treasury: treasury.publicKey,
          arbitrator: arbitrator1.publicKey,
          profileProgram: profileProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([arbitrator1])
        .rpc();

      // Verify fee distributions
      const buyerBalanceAfter = await getAccount(provider.connection, buyerTokenAccount);
      const arbitratorBalanceAfter = await getAccount(provider.connection, arbitratorTokenAccount);
      const treasuryBalanceAfter = await getAccount(provider.connection, treasuryTokenAccount);

      const buyerReceived = buyerBalanceAfter.amount - buyerBalanceBefore.amount;
      const arbitratorReceived = arbitratorBalanceAfter.amount - arbitratorBalanceBefore.amount;
      const treasuryReceived = treasuryBalanceAfter.amount - treasuryBalanceBefore.amount;

      // Verify total equals original trade amount
      const totalDistributed = buyerReceived + arbitratorReceived + treasuryReceived;
      expect(totalDistributed.toString()).to.equal("2000000"); // 2 tokens

      // Verify arbitrator received fee (should be ~2% of trade amount)
      expect(arbitratorReceived > 0n).to.be.true;
      expect(Number(arbitratorReceived)).to.be.approximately(40000, 5000); // ~2% ± margin

      console.log("Fee distribution:");
      console.log(`Buyer received: ${buyerReceived}`);
      console.log(`Arbitrator fee: ${arbitratorReceived}`);
      console.log(`Treasury fee: ${treasuryReceived}`);
      console.log(`Total distributed: ${totalDistributed}`);
    });
  });
});