const anchor = require('@coral-xyz/anchor');
const { SystemProgram, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { 
  TOKEN_PROGRAM_ID, 
  NATIVE_MINT, 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createMint,
  mintTo 
} = require('@solana/spl-token');
const assert = require('assert');

describe('LocalMoney Integration Tests', () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());
  
  const provider = anchor.getProvider();
  const connection = provider.connection;

  // Program clients
  let hubProgram;
  let profileProgram;
  let priceProgram;
  let offerProgram;
  let tradeProgram;

  // Test accounts
  let authority;
  let seller;
  let buyer;
  let arbitrator;
  let treasury;

  // Test mint
  let testMint;
  let sellerTokenAccount;
  let buyerTokenAccount;
  let treasuryTokenAccount;

  // Test data
  const TEST_AMOUNT = 1000_000_000; // 1000 tokens (assuming 6 decimals)
  const TEST_RATE = 150; // 1.5% rate
  const TEST_EXPIRY = 3600; // 1 hour

  before(async () => {
    try {
      // Initialize program clients
      hubProgram = anchor.workspace.Hub;
      profileProgram = anchor.workspace.Profile;
      priceProgram = anchor.workspace.Price;
      offerProgram = anchor.workspace.Offer;
      tradeProgram = anchor.workspace.Trade;

      // Generate test keypairs
      authority = Keypair.generate();
      seller = Keypair.generate();
      buyer = Keypair.generate();
      arbitrator = Keypair.generate();
      treasury = Keypair.generate();

      // Fund test accounts
      await connection.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.requestAirdrop(seller.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.requestAirdrop(buyer.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.requestAirdrop(arbitrator.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.requestAirdrop(treasury.publicKey, 10 * LAMPORTS_PER_SOL);

      // Wait for airdrops to confirm
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create test mint
      testMint = await createMint(
        connection,
        authority,
        authority.publicKey,
        null,
        6 // 6 decimals
      );

      // Create associated token accounts
      sellerTokenAccount = await getAssociatedTokenAddress(testMint, seller.publicKey);
      buyerTokenAccount = await getAssociatedTokenAddress(testMint, buyer.publicKey);
      treasuryTokenAccount = await getAssociatedTokenAddress(testMint, treasury.publicKey);

      // Create token accounts
      const createSellerATA = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        sellerTokenAccount,
        seller.publicKey,
        testMint
      );

      const createBuyerATA = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        buyerTokenAccount,
        buyer.publicKey,
        testMint
      );

      const createTreasuryATA = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        treasuryTokenAccount,
        treasury.publicKey,
        testMint
      );

      const createATATx = new anchor.web3.Transaction()
        .add(createSellerATA)
        .add(createBuyerATA)
        .add(createTreasuryATA);

      await provider.sendAndConfirm(createATATx, [authority]);

      // Mint tokens to seller
      await mintTo(
        connection,
        authority,
        testMint,
        sellerTokenAccount,
        authority,
        TEST_AMOUNT * 10 // Give seller 10x the test amount
      );

      console.log('Setup complete');
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  });

  describe('System Initialization', () => {
    it('Initializes hub configuration', async () => {
      const [hubConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('hub'), Buffer.from('config')],
        hubProgram.programId
      );

      await hubProgram.methods
        .initialize({
          profileProgram: profileProgram.programId,
          offerProgram: offerProgram.programId,
          tradeProgram: tradeProgram.programId,
          priceProgram: priceProgram.programId,
          treasury: treasury.publicKey,
          feeRate: 150, // 1.5%
          burnRate: 50, // 0.5%
          warchestRate: 100, // 1.0%
        })
        .accounts({
          hubConfig: hubConfigPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const hubConfig = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
      assert.equal(hubConfig.authority.toString(), authority.publicKey.toString());
      assert.equal(hubConfig.feeRate, 150);
    });

    it('Initializes price feeds', async () => {
      const [priceConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('price'), Buffer.from('config')],
        priceProgram.programId
      );

      await priceProgram.methods
        .initialize()
        .accounts({
          priceConfig: priceConfigPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Update USD price feed
      const [usdPriceFeedPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('price'), Buffer.from('USD')],
        priceProgram.programId
      );

      await priceProgram.methods
        .updatePrice(
          { usd: {} }, // FiatCurrency::USD
          100000, // $1.00 = 100,000 (in cents)
          6 // decimals
        )
        .accounts({
          priceConfig: priceConfigPDA,
          priceFeed: usdPriceFeedPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const priceFeed = await priceProgram.account.priceFeed.fetch(usdPriceFeedPDA);
      assert.equal(priceFeed.pricePerToken, 100000);
    });
  });

  describe('Profile Management', () => {
    let sellerProfilePDA;
    let buyerProfilePDA;

    it('Creates user profiles', async () => {
      // Create seller profile
      [sellerProfilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), seller.publicKey.toBuffer()],
        profileProgram.programId
      );

      await profileProgram.methods
        .createProfile('TestSeller')
        .accounts({
          profile: sellerProfilePDA,
          user: seller.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      // Create buyer profile
      [buyerProfilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), buyer.publicKey.toBuffer()],
        profileProgram.programId
      );

      await profileProgram.methods
        .createProfile('TestBuyer')
        .accounts({
          profile: buyerProfilePDA,
          user: buyer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      // Verify profiles
      const sellerProfile = await profileProgram.account.profile.fetch(sellerProfilePDA);
      const buyerProfile = await profileProgram.account.profile.fetch(buyerProfilePDA);

      assert.equal(sellerProfile.username, 'TestSeller');
      assert.equal(buyerProfile.username, 'TestBuyer');
      assert.equal(sellerProfile.owner.toString(), seller.publicKey.toString());
      assert.equal(buyerProfile.owner.toString(), buyer.publicKey.toString());
    });
  });

  describe('Offer Management', () => {
    let offerPDA;
    const offerId = 1;

    it('Creates a sell offer', async () => {
      [offerPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), new anchor.BN(offerId).toArrayLike(Buffer, 'le', 8)],
        offerProgram.programId
      );

      const [sellerProfilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), seller.publicKey.toBuffer()],
        profileProgram.programId
      );

      await offerProgram.methods
        .createOffer({
          offerId: new anchor.BN(offerId),
          offerType: { sell: {} },
          fiatCurrency: { usd: {} },
          rate: new anchor.BN(TEST_RATE),
          minAmount: new anchor.BN(100_000_000), // 100 tokens
          maxAmount: new anchor.BN(TEST_AMOUNT), // 1000 tokens
          description: 'Test sell offer',
        })
        .accounts({
          offer: offerPDA,
          userProfile: sellerProfilePDA,
          tokenMint: testMint,
          owner: seller.publicKey,
          profileProgram: profileProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const offer = await offerProgram.account.offer.fetch(offerPDA);
      assert.equal(offer.id.toString(), offerId.toString());
      assert.equal(offer.owner.toString(), seller.publicKey.toString());
      assert.equal(offer.rate.toString(), TEST_RATE.toString());
      assert.deepEqual(offer.offerType, { sell: {} });
    });
  });

  describe('Complete Trading Flow', () => {
    let tradePDA;
    let escrowPDA;
    const tradeId = 1;
    const offerId = 1;

    it('Creates a trade request', async () => {
      [tradePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('trade'), new anchor.BN(tradeId).toArrayLike(Buffer, 'le', 8)],
        tradeProgram.programId
      );

      const [offerPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), new anchor.BN(offerId).toArrayLike(Buffer, 'le', 8)],
        offerProgram.programId
      );

      const [buyerProfilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), buyer.publicKey.toBuffer()],
        profileProgram.programId
      );

      await tradeProgram.methods
        .createTrade({
          tradeId: new anchor.BN(tradeId),
          offerId: new anchor.BN(offerId),
          amount: new anchor.BN(TEST_AMOUNT),
          lockedPrice: new anchor.BN(100000), // $1.00
          expiryDuration: new anchor.BN(TEST_EXPIRY),
          arbitrator: arbitrator.publicKey,
          buyerContact: 'buyer@test.com',
        })
        .accounts({
          trade: tradePDA,
          offer: offerPDA,
          buyerProfile: buyerProfilePDA,
          tokenMint: testMint,
          buyer: buyer.publicKey,
          profileProgram: profileProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      const trade = await tradeProgram.account.trade.fetch(tradePDA);
      assert.equal(trade.id.toString(), tradeId.toString());
      assert.equal(trade.buyer.toString(), buyer.publicKey.toString());
      assert.equal(trade.seller.toString(), seller.publicKey.toString());
      assert.deepEqual(trade.state, { requestCreated: {} });
    });

    it('Accepts trade request', async () => {
      await tradeProgram.methods
        .acceptRequest('seller@test.com')
        .accounts({
          trade: tradePDA,
          seller: seller.publicKey,
        })
        .signers([seller])
        .rpc();

      const trade = await tradeProgram.account.trade.fetch(tradePDA);
      assert.deepEqual(trade.state, { requestAccepted: {} });
      assert.equal(trade.sellerContact, 'seller@test.com');
    });

    it('Funds escrow', async () => {
      [escrowPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from('trade'), 
          Buffer.from('escrow'), 
          new anchor.BN(tradeId).toArrayLike(Buffer, 'le', 8)
        ],
        tradeProgram.programId
      );

      await tradeProgram.methods
        .fundEscrow()
        .accounts({
          trade: tradePDA,
          escrowTokenAccount: escrowPDA,
          sellerTokenAccount: sellerTokenAccount,
          tokenMint: testMint,
          seller: seller.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const trade = await tradeProgram.account.trade.fetch(tradePDA);
      assert.deepEqual(trade.state, { escrowFunded: {} });

      // Verify escrow balance
      const escrowBalance = await connection.getTokenAccountBalance(escrowPDA);
      assert.equal(escrowBalance.value.amount, TEST_AMOUNT.toString());
    });

    it('Marks fiat deposited', async () => {
      await tradeProgram.methods
        .markFiatDeposited()
        .accounts({
          trade: tradePDA,
          buyer: buyer.publicKey,
        })
        .signers([buyer])
        .rpc();

      const trade = await tradeProgram.account.trade.fetch(tradePDA);
      assert.deepEqual(trade.state, { fiatDeposited: {} });
      assert.ok(trade.disputeWindowAt);
    });

    it('Releases escrow and completes trade', async () => {
      const [sellerProfilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), seller.publicKey.toBuffer()],
        profileProgram.programId
      );

      const [buyerProfilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), buyer.publicKey.toBuffer()],
        profileProgram.programId
      );

      // Get initial balances
      const initialBuyerBalance = await connection.getTokenAccountBalance(buyerTokenAccount);
      const initialTreasuryBalance = await connection.getTokenAccountBalance(treasuryTokenAccount);

      await tradeProgram.methods
        .releaseEscrow()
        .accounts({
          trade: tradePDA,
          escrowTokenAccount: escrowPDA,
          buyerTokenAccount: buyerTokenAccount,
          treasuryTokenAccount: treasuryTokenAccount,
          buyerProfile: buyerProfilePDA,
          sellerProfile: sellerProfilePDA,
          tokenMint: testMint,
          treasury: treasury.publicKey,
          buyer: buyer.publicKey,
          seller: seller.publicKey,
          profileProgram: profileProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();

      const trade = await tradeProgram.account.trade.fetch(tradePDA);
      assert.deepEqual(trade.state, { escrowReleased: {} });

      // Verify final balances
      const finalBuyerBalance = await connection.getTokenAccountBalance(buyerTokenAccount);
      const finalTreasuryBalance = await connection.getTokenAccountBalance(treasuryTokenAccount);

      // Buyer should receive tokens minus fees
      const expectedFees = Math.floor(TEST_AMOUNT * 0.015); // 1.5% total fees
      const expectedBuyerAmount = TEST_AMOUNT - expectedFees;

      assert.equal(finalBuyerBalance.value.amount, expectedBuyerAmount.toString());
      assert.equal(finalTreasuryBalance.value.amount, expectedFees.toString());

      // Verify profile stats were updated
      const updatedBuyerProfile = await profileProgram.account.profile.fetch(buyerProfilePDA);
      const updatedSellerProfile = await profileProgram.account.profile.fetch(sellerProfilePDA);

      assert.equal(updatedBuyerProfile.releasedTradesCount, 1);
      assert.equal(updatedSellerProfile.releasedTradesCount, 1);
    });
  });

  describe('Error Cases', () => {
    it('Prevents unauthorized trade actions', async () => {
      const [tradePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('trade'), new anchor.BN(1).toArrayLike(Buffer, 'le', 8)],
        tradeProgram.programId
      );

      try {
        // Try to accept trade with wrong seller
        await tradeProgram.methods
          .acceptRequest('wrong@test.com')
          .accounts({
            trade: tradePDA,
            seller: buyer.publicKey, // Wrong seller
          })
          .signers([buyer])
          .rpc();
        
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('Unauthorized') || error.message.includes('constraint'));
      }
    });

    it('Prevents double spending', async () => {
      // This test would verify that the same escrow can't be funded twice
      // and other similar edge cases
    });
  });
});