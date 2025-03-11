/*  */import * as anchor from "@project-serum/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import { TradeClient } from "../sdk/src/clients/trade";
import { PriceClient } from "../sdk/src/clients/price";
import { ProfileClient } from "../sdk/src/clients/profile";
import { airdropSol, delay, createTokenMint, createTokenAccount, mintTokens, getTokenBalance } from "../sdk/src/utils";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

describe("trade", () => {
  if (!process.env.TRADE_PROGRAM_ID || !process.env.PRICE_PROGRAM_ID || !process.env.PROFILE_PROGRAM_ID) {
    throw new Error("Required program IDs not found in environment. Make sure TRADE_PROGRAM_ID, PRICE_PROGRAM_ID, and PROFILE_PROGRAM_ID are set.");
  }

  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const TRADE_PROGRAM_ID = new PublicKey(process.env.TRADE_PROGRAM_ID);
  const PRICE_PROGRAM_ID = new PublicKey(process.env.PRICE_PROGRAM_ID);
  const PROFILE_PROGRAM_ID = new PublicKey(process.env.PROFILE_PROGRAM_ID);

  let tradeClient: TradeClient;
  let priceClient: PriceClient;
  let profileClient: ProfileClient;
  
  // Generate base keypairs for our test
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  const tokenMint = Keypair.generate();
  const priceOracle = Keypair.generate();
  const adminKeypair = Keypair.generate(); // Admin keypair for token operations

  // Additional makers for different tests
  const cancelTestMaker = Keypair.generate();
  const disputeTestMaker = Keypair.generate();
  
  // Token accounts
  let makerTokenAccount: PublicKey;
  let takerTokenAccount: PublicKey;
  let cancelTestMakerTokenAccount: PublicKey;
  let disputeTestMakerTokenAccount: PublicKey;
  let mint: PublicKey;

  // Profile PDAs
  let takerProfile: PublicKey;
  let makerProfile: PublicKey;

  before(async () => {
    // Load the IDLs
    const tradeIdl = require("../target/idl/trade.json");
    const priceIdl = require("../target/idl/price.json");
    const profileIdl = require("../target/idl/profile.json");

    // Initialize clients
    tradeClient = new TradeClient(TRADE_PROGRAM_ID, provider, tradeIdl);
    priceClient = new PriceClient(PRICE_PROGRAM_ID, provider, priceIdl);
    profileClient = new ProfileClient(PROFILE_PROGRAM_ID, provider, profileIdl);

    // Fund test accounts
    await airdropSol(provider.connection, maker.publicKey, 200);
    await airdropSol(provider.connection, taker.publicKey, 200);
    await airdropSol(provider.connection, priceOracle.publicKey, 200);
    await airdropSol(provider.connection, cancelTestMaker.publicKey, 200);
    await airdropSol(provider.connection, disputeTestMaker.publicKey, 200);
    await airdropSol(provider.connection, adminKeypair.publicKey, 200); // Fund admin with extra SOL
    await delay(1000);

    try {
      // Create token mint with admin as payer and mint authority
      mint = await createTokenMint(
        provider.connection,
        adminKeypair,
        adminKeypair.publicKey,
        null,
        6
      );
      await delay(500);

      // Create token accounts
      makerTokenAccount = await createTokenAccount(
        provider.connection,
        adminKeypair,
        mint,
        maker.publicKey
      );

      takerTokenAccount = await createTokenAccount(
        provider.connection,
        adminKeypair,
        mint,
        taker.publicKey
      );

      cancelTestMakerTokenAccount = await createTokenAccount(
        provider.connection,
        adminKeypair,
        mint,
        cancelTestMaker.publicKey
      );

      disputeTestMakerTokenAccount = await createTokenAccount(
        provider.connection,
        adminKeypair,
        mint,
        disputeTestMaker.publicKey
      );

      await delay(500);

      // Mint tokens to all accounts
      await mintTokens(
        provider.connection,
        adminKeypair,
        mint,
        makerTokenAccount,
        adminKeypair,
        1000_000_000 // 1000 tokens with 6 decimals
      );

      await mintTokens(
        provider.connection,
        adminKeypair,
        mint,
        takerTokenAccount,
        adminKeypair,
        1000_000_000
      );

      await mintTokens(
        provider.connection,
        adminKeypair,
        mint,
        cancelTestMakerTokenAccount,
        adminKeypair,
        1000_000_000
      );

      await mintTokens(
        provider.connection,
        adminKeypair,
        mint,
        disputeTestMakerTokenAccount,
        adminKeypair,
        1000_000_000
      );

      await delay(500);

      // Initialize price oracle with a keypair that has authority
      await priceClient.initialize(priceOracle, adminKeypair);
      await delay(500);

      // Update prices in the oracle
      await priceClient.updatePrices(
        priceOracle.publicKey,
        adminKeypair,
        [{
          currency: "USD",
          usdPrice: new anchor.BN(100_000), // $1.00 with 5 decimals
          updatedAt: new anchor.BN(Math.floor(Date.now() / 1000))
        }]
      );
      await delay(500);

      // Initialize profiles - these functions already use Keypairs or WalletAdapters
      takerProfile = await profileClient.createProfile(taker, "taker");
      await delay(500);

      makerProfile = await profileClient.createProfile(maker, "maker");
    } catch (error) {
      throw error;
    }
  });

  it("Creates a trade", async () => {
    const amount = new anchor.BN(1000_000); // 1 token
    const price = new anchor.BN(100_000); // $1.00 with 5 decimals

    // Create a new escrow keypair
    const escrowKeypair = Keypair.generate();

    const tradePDA = await tradeClient.createTrade(
      taker, // Already supports WalletAdapter
      maker.publicKey,
      mint,
      makerTokenAccount,
      escrowKeypair,
      amount,
      price
    );
    await delay(500);

    const tradeBeforeDeposit = await tradeClient.getTrade(tradePDA);
    expect(tradeBeforeDeposit.maker.toString()).to.equal(maker.publicKey.toString());
    expect(tradeBeforeDeposit.taker?.toString()).to.equal(taker.publicKey.toString());
    expect(tradeBeforeDeposit.amount.toNumber()).to.equal(1000_000);
    expect(tradeBeforeDeposit.price.toNumber()).to.equal(100_000);
    expect(tradeBeforeDeposit.tokenMint.toString()).to.equal(mint.toString());
    expect(tradeBeforeDeposit.escrowAccount.toString()).to.equal(escrowKeypair.publicKey.toString());
    expect(tradeBeforeDeposit.status).to.equal('created');

    // Verify no tokens were transferred to escrow yet
    const escrowBalanceBeforeDeposit = await getTokenBalance(provider.connection, escrowKeypair.publicKey);
    expect(escrowBalanceBeforeDeposit).to.equal(0);

    // Now deposit to escrow
    await tradeClient.depositEscrow(
      tradePDA,
      maker, // Already supports WalletAdapter
      makerTokenAccount,
      escrowKeypair.publicKey,
      amount
    );
    
    await delay(500);
    
    // Check trade status after deposit
    const tradeAfterDeposit = await tradeClient.getTrade(tradePDA);
    expect(tradeAfterDeposit.status).to.equal('escrowDeposited');
    
    // Verify tokens were transferred to escrow
    const escrowBalanceAfterDeposit = await getTokenBalance(provider.connection, escrowKeypair.publicKey);
    expect(escrowBalanceAfterDeposit).to.equal(1000_000);
  });

  it("Completes a trade", async () => {
    const escrowKeypair = Keypair.generate();
    const minAmount = 100_000;
    const maxAmount = 1000_000;
    const amount = new anchor.BN(Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount);
    const price = new anchor.BN(100_000); // $1.00 with 5 decimals

    const tradePDA = await tradeClient.createTrade(
      taker, // Already supports WalletAdapter
      maker.publicKey,
      mint,
      makerTokenAccount,
      escrowKeypair,
      amount,
      price
    );
    await delay(500);

    // Now deposit to escrow
    await tradeClient.depositEscrow(
      tradePDA,
      maker, // Already supports WalletAdapter
      makerTokenAccount,
      escrowKeypair.publicKey,
      amount
    );
    
    await delay(500);
    
    // Check trade status after deposit
    const tradeAfterDeposit = await tradeClient.getTrade(tradePDA);
    expect(tradeAfterDeposit.status).to.equal('escrowDeposited');

    await tradeClient.completeTrade(
      tradePDA,
      maker, // Already supports WalletAdapter
      escrowKeypair.publicKey,
      takerTokenAccount,
      priceOracle.publicKey,
      PRICE_PROGRAM_ID,
      takerProfile,
      makerProfile,
      PROFILE_PROGRAM_ID
    );
    await delay(500);

    const trade = await tradeClient.getTrade(tradePDA);
    expect(trade.status).to.equal('completed');

    // Check that escrow account is empty
    const escrowBalance = await getTokenBalance(provider.connection, escrowKeypair.publicKey);
    expect(escrowBalance).to.equal(0);
  });

  it("Cancels a trade", async () => {
    // Create a new trade
    const amount = new anchor.BN(1000_000); // 1 token
    const price = new anchor.BN(100_000); // $1.00 with 5 decimals
    const escrowKeypair = Keypair.generate();

    const tradePDA = await tradeClient.createTrade(
      taker, // Already supports WalletAdapter
      cancelTestMaker.publicKey, // cancelTestMaker is the maker
      mint,
      cancelTestMakerTokenAccount,
      escrowKeypair,
      amount,
      price
    );
    await delay(500);

    // Verify the trade was created with the correct status
    const tradeBeforeCancel = await tradeClient.getTrade(tradePDA);
    expect(tradeBeforeCancel.status).to.equal('created');

    // Cancel the trade using the taker (who created it)
    await tradeClient.cancelTrade(
      tradePDA,
      taker // Already supports WalletAdapter
    );
    await delay(500);

    // Verify the trade is now cancelled
    const tradeAfterCancel = await tradeClient.getTrade(tradePDA);
    expect(tradeAfterCancel.status).to.equal('cancelled');
  });

  it("Disputes a trade", async () => {
    const minAmount = 100_000;
    const maxAmount = 1000_000;
    const amount = new anchor.BN(Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount);
    const price = new anchor.BN(100_000); // $1.00 with 5 decimals

    // Create a new escrow keypair
    const escrowKeypair = Keypair.generate();

    const disputeTradePDA = await tradeClient.createTrade(
      taker, // Already supports WalletAdapter
      disputeTestMaker.publicKey,
      mint,
      disputeTestMakerTokenAccount,
      escrowKeypair,
      amount,
      price
    );
    await delay(500);

    // Deposit to escrow - Use disputeTestMaker as the depositor since they own the token account
    await tradeClient.depositEscrow(
      disputeTradePDA,
      disputeTestMaker, // Already supports WalletAdapter
      disputeTestMakerTokenAccount,
      escrowKeypair.publicKey,
      amount
    );
    await delay(500);

    await tradeClient.disputeTrade(disputeTradePDA, taker); // Already supports WalletAdapter
    await delay(500);

    const trade = await tradeClient.getTrade(disputeTradePDA);
    expect(trade.status).to.equal('disputed');
  });

  it("Fails to dispute with unauthorized user", async () => {
    const unauthorizedUser = Keypair.generate();
    await airdropSol(provider.connection, unauthorizedUser.publicKey, 200);
    await delay(500);

    const escrowKeypair = Keypair.generate();
    const minAmount = 100_000;
    const maxAmount = 1000_000;
    const amount = new anchor.BN(Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount);
    const price = new anchor.BN(100_000); // $1.00 with 5 decimals

    const tradePDA = await tradeClient.createTrade(
      taker, // Already supports WalletAdapter
      maker.publicKey,
      mint,
      makerTokenAccount,
      escrowKeypair,
      amount,
      price
    );
    await delay(500);

    try {
      await tradeClient.disputeTrade(tradePDA, unauthorizedUser); // Already supports WalletAdapter
      throw new Error("Expected error did not occur");
    } catch (error: any) {
      expect(error.message).to.include("UnauthorizedDisputer");
    }
  });

  // Tests for getTradesByUser function
  describe("getTradesByUser", () => {
    let tradePDA1: PublicKey;
    let tradePDA2: PublicKey;
    let testMaker: Keypair;
    let testTaker: Keypair;
    let otherUser: Keypair;
    let makerTokenAccount: PublicKey;
    let takerTokenAccount: PublicKey;
    let escrowAccount1: Keypair;
    let escrowAccount2: Keypair;

    before(async () => {
      // Set up test users
      testMaker = Keypair.generate();
      testTaker = Keypair.generate();
      otherUser = Keypair.generate();

      // Airdrop SOL to the users
      await airdropSol(provider.connection, testMaker.publicKey, 200);
      await airdropSol(provider.connection, testTaker.publicKey, 200);
      await airdropSol(provider.connection, otherUser.publicKey, 200);
      await delay(500);

      // Create token accounts for each user 
      makerTokenAccount = await createTokenAccount(
        provider.connection,
        adminKeypair,
        mint,
        testMaker.publicKey
      );
      
      takerTokenAccount = await createTokenAccount(
        provider.connection,
        adminKeypair,
        mint,
        testTaker.publicKey
      );

      // Mint tokens to the maker
      await mintTokens(
        provider.connection,
        adminKeypair,
        mint,
        makerTokenAccount,
        adminKeypair,
        1000
      );
      // Mint tokens to the taker
      await mintTokens(
        provider.connection,
        adminKeypair,
        mint,
        takerTokenAccount,
        adminKeypair,
        1000
      );
    });

    it("should retrieve all trades for a maker", async () => {
      const makerTrades = await tradeClient.getTradesByUser(testMaker.publicKey);
      
      // Create a trade for the testMaker to guarantee we have at least one trade
      console.log("Creating a test trade for the test maker");
      const escrowKeypair = Keypair.generate();
      const amount = new anchor.BN(500_000);  // 0.5 SOL
      const price = new anchor.BN(50_000);    // $0.50
      
      await tradeClient.createTrade(
        testTaker,
        testMaker.publicKey, 
        mint,
        makerTokenAccount, 
        escrowKeypair,
        amount,
        price
      );
      
      // Get the trades again after creating one
      const updatedMakerTrades = await tradeClient.getTradesByUser(testMaker.publicKey);
      console.log(`Found ${updatedMakerTrades.length} trades for test maker`);
      
      // Now we should have at least one trade
      expect(updatedMakerTrades.length).to.be.at.least(1);
      
      // Verify that at least one trade is related to the maker
      const found = updatedMakerTrades.some(trade => 
        trade.maker.toString() === testMaker.publicKey.toString()
      );
      
      expect(found).to.be.true;
    });

    it("should retrieve all trades for a taker", async () => {
      // We already created a trade in the previous test where testTaker is the taker
      // Now fetch the trades for the taker
      const takerTrades = await tradeClient.getTradesByUser(testTaker.publicKey);
      console.log(`Found ${takerTrades.length} trades for test taker`);
      
      // Now we should have at least one trade
      expect(takerTrades.length).to.be.at.least(1);
      
      // Verify that at least one trade is related to the taker
      const found = takerTrades.some(trade => 
        (trade.taker && trade.taker.toString() === testTaker.publicKey.toString())
      );
      
      expect(found).to.be.true;
    });

    it("should return empty array for users with no trades", async () => {
      // Get trades for a random user that should have no trades
      const randomUser = Keypair.generate();
      const userTrades = await tradeClient.getTradesByUser(randomUser.publicKey);
      
      // SDK should return an empty array, not mock data
      expect(userTrades.length).to.equal(0);
    });
  });

  // Add a dedicated debug test for the getTradesByUser function
  it("DEBUG: Properly creates and reads a trade account with the correct discriminator", async () => {
    // Create a trade first
    console.log("Creating a test trade for discriminator debugging...");
    const tradePDA = await tradeClient.createTrade(
      taker,
      maker.publicKey,
      mint,
      makerTokenAccount,
      Keypair.generate(),
      new anchor.BN(Math.random() * 1000_000),
      new anchor.BN(Math.random() * 100_000)
    );
    await delay(1000); // Longer delay for network confirmation
    const tradePDA2 = await tradeClient.createTrade(
      taker,
      maker.publicKey,
      mint,
      makerTokenAccount,
      Keypair.generate(),
      new anchor.BN(Math.random() * 1000_000),
      new anchor.BN(Math.random() * 100_000)
    );

    console.log("Verifying trade was created by fetching it directly...");
    try {
      const trade = await tradeClient.getTrade(tradePDA);
      console.log("Trade fetched successfully:", {
        maker: trade.maker.toString(),
        taker: trade.taker?.toString(),
        amount: trade.amount.toString(),
        status: trade.status
      });
    } catch (error) {
      console.error("Error fetching trade directly:", error);
    }

    // Try to get trade account info directly
    console.log("Fetching raw account data...");
    const accountInfo = await provider.connection.getAccountInfo(tradePDA);
    
    if (!accountInfo) {
      console.error("Account info not found for trade PDA");
    } else {
      console.log("Account exists with", accountInfo.data.length, "bytes of data");
      console.log("Owner:", accountInfo.owner.toString());
      
      if (accountInfo.data.length >= 8) {
        const actualDiscriminator = accountInfo.data.slice(0, 8);
        console.log("Account discriminator:", Buffer.from(actualDiscriminator).toString('hex'));
        
        // Compute the expected discriminator
        const expectedDiscriminator = anchor.utils.bytes.utf8.encode("account:trade");
        const hash = anchor.utils.sha256.hash(expectedDiscriminator);
        const expectedHash = hash.slice(0, 8);
        console.log("Expected discriminator:", Buffer.from(expectedHash).toString('hex'));
        
        if (Buffer.from(actualDiscriminator).equals(Buffer.from(expectedHash))) {
          console.log("✅ Discriminators match!");
        } else {
          console.log("❌ Discriminators do not match");
        }
      }
    }

    // Now try to fetch using the getTradesByUser method
    console.log("Testing getTradesByUser for maker:", maker.publicKey.toString());
    const makerTrades = await tradeClient.getTradesByUser(maker.publicKey);
    console.log(`Found ${makerTrades.length} maker trades`);
    
    console.log("Testing getTradesByUser for taker:", taker.publicKey.toString());
    const takerTrades = await tradeClient.getTradesByUser(taker.publicKey);
    console.log(`Found ${takerTrades.length} taker trades`);
    
    const randomUser = Keypair.generate();
    const randomUserTrades = await tradeClient.getTradesByUser(randomUser.publicKey);
    console.log(`Found ${randomUserTrades.length} random user trades`);

    // Verify we can get trades
    expect(makerTrades.length).to.be.at.least(1);
    expect(takerTrades.length).to.be.at.least(2);
    expect(randomUserTrades.length).to.be.eq(0);
  });

  // Add a dedicated test for the specific user address
  it("DEBUG: Fetch trades for specific address p1DWhN5r8ifoZmUyJfqjH96twyeGFejsWoBb8BdtaXB", async () => {
    console.log("Testing getTradesByUser for specific user address");
    
    // Convert address string to PublicKey
    const specificUserAddress = new PublicKey("p1DWhN5r8ifoZmUyJfqjH96twyeGFejsWoBb8BdtaXB");
    console.log("User address:", specificUserAddress.toString());
    
    // Call getTradesByUser for the specific address
    const specificUserTrades = await tradeClient.getTradesByUser(specificUserAddress);
    console.log(`Found ${specificUserTrades.length} trades for specific user`);
    
    // Log detailed information about each trade found
    if (specificUserTrades.length > 0) {
      specificUserTrades.forEach((trade, index) => {
        console.log(`Trade ${index + 1}:`);
        console.log(`  PDA: ${trade.publicKey.toString()}`);
        console.log(`  Maker: ${trade.maker.toString()}`);
        console.log(`  Taker: ${trade.taker ? trade.taker.toString() : 'null'}`);
        console.log(`  Amount: ${trade.amount.toString()}`);
        console.log(`  Status: ${trade.status}`);
      });
    } else {
      console.log("No trades found for this specific user address");
    }
  });
});