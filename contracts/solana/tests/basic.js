const anchor = require('@coral-xyz/anchor');
const { SystemProgram, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const assert = require('assert');

describe('LocalMoney Basic Tests', () => {
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

  before(async () => {
    try {
      // Initialize program clients
      hubProgram = anchor.workspace.Hub;
      profileProgram = anchor.workspace.Profile;
      priceProgram = anchor.workspace.Price;
      offerProgram = anchor.workspace.Offer;
      tradeProgram = anchor.workspace.Trade;

      // Generate test keypair
      authority = Keypair.generate();

      // Fund test account
      await connection.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL);

      // Wait for airdrop to confirm
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('Basic setup complete');
      console.log('Hub Program ID:', hubProgram.programId.toString());
      console.log('Profile Program ID:', profileProgram.programId.toString());
      console.log('Price Program ID:', priceProgram.programId.toString());
      console.log('Offer Program ID:', offerProgram.programId.toString());
      console.log('Trade Program ID:', tradeProgram.programId.toString());
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  });

  describe('Program Deployment Validation', () => {
    it('All programs are deployed and accessible', async () => {
      // Verify all programs are loaded
      assert.ok(hubProgram, 'Hub program should be loaded');
      assert.ok(profileProgram, 'Profile program should be loaded');
      assert.ok(priceProgram, 'Price program should be loaded');
      assert.ok(offerProgram, 'Offer program should be loaded');
      assert.ok(tradeProgram, 'Trade program should be loaded');

      // Verify program IDs are valid
      assert.ok(hubProgram.programId, 'Hub program should have valid ID');
      assert.ok(profileProgram.programId, 'Profile program should have valid ID');
      assert.ok(priceProgram.programId, 'Price program should have valid ID');
      assert.ok(offerProgram.programId, 'Offer program should have valid ID');
      assert.ok(tradeProgram.programId, 'Trade program should have valid ID');

      console.log('✅ All 5 programs successfully deployed');
    });

    it('Programs have correct IDL structure', async () => {
      // Check Hub program IDL
      const hubIdl = hubProgram.idl;
      assert.ok(hubIdl.instructions.find(ix => ix.name === 'initialize'), 'Hub should have initialize instruction');
      assert.ok(hubIdl.accounts.find(acc => acc.name === 'HubConfig'), 'Hub should have HubConfig account');

      // Check Profile program IDL
      const profileIdl = profileProgram.idl;
      assert.ok(profileIdl.instructions.find(ix => ix.name === 'createProfile'), 'Profile should have createProfile instruction');
      assert.ok(profileIdl.accounts.find(acc => acc.name === 'Profile'), 'Profile should have Profile account');

      // Check Price program IDL
      const priceIdl = priceProgram.idl;
      assert.ok(priceIdl.instructions.find(ix => ix.name === 'initialize'), 'Price should have initialize instruction');
      assert.ok(priceIdl.accounts.find(acc => acc.name === 'PriceFeed'), 'Price should have PriceFeed account');

      // Check Offer program IDL
      const offerIdl = offerProgram.idl;
      assert.ok(offerIdl.instructions.find(ix => ix.name === 'createOffer'), 'Offer should have createOffer instruction');
      assert.ok(offerIdl.accounts.find(acc => acc.name === 'Offer'), 'Offer should have Offer account');

      // Check Trade program IDL
      const tradeIdl = tradeProgram.idl;
      assert.ok(tradeIdl.instructions.find(ix => ix.name === 'createTrade'), 'Trade should have createTrade instruction');
      assert.ok(tradeIdl.accounts.find(acc => acc.name === 'Trade'), 'Trade should have Trade account');

      console.log('✅ All programs have correct IDL structure');
    });

    it('Hub initialization works', async () => {
      const [hubConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('hub'), Buffer.from('config')],
        hubProgram.programId
      );

      try {
        await hubProgram.methods
          .initialize({
            profileProgram: profileProgram.programId,
            offerProgram: offerProgram.programId,
            tradeProgram: tradeProgram.programId,
            priceProgram: priceProgram.programId,
            treasury: authority.publicKey,
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
        assert.equal(hubConfig.profileProgram.toString(), profileProgram.programId.toString());

        console.log('✅ Hub initialization successful');
        console.log('   Fee rate:', hubConfig.feeRate);
        console.log('   Profile program:', hubConfig.profileProgram.toString());
        console.log('   Offer program:', hubConfig.offerProgram.toString());
        console.log('   Trade program:', hubConfig.tradeProgram.toString());
        console.log('   Price program:', hubConfig.priceProgram.toString());
      } catch (error) {
        console.error('Hub initialization failed:', error);
        throw error;
      }
    });

    it('Profile creation works', async () => {
      const [profilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), authority.publicKey.toBuffer()],
        profileProgram.programId
      );

      try {
        await profileProgram.methods
          .createProfile('TestUser')
          .accounts({
            profile: profilePDA,
            user: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        const profile = await profileProgram.account.profile.fetch(profilePDA);
        assert.equal(profile.username, 'TestUser');
        assert.equal(profile.owner.toString(), authority.publicKey.toString());
        assert.equal(profile.requestedTradesCount, 0);
        assert.equal(profile.releasedTradesCount, 0);

        console.log('✅ Profile creation successful');
        console.log('   Username:', profile.username);
        console.log('   Owner:', profile.owner.toString());
        console.log('   Trades count:', profile.requestedTradesCount.toString());
      } catch (error) {
        console.error('Profile creation failed:', error);
        throw error;
      }
    });

    it('Price feed initialization works', async () => {
      const [priceConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('price'), Buffer.from('config')],
        priceProgram.programId
      );

      try {
        await priceProgram.methods
          .initialize()
          .accounts({
            priceConfig: priceConfigPDA,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();

        const priceConfig = await priceProgram.account.priceConfig.fetch(priceConfigPDA);
        assert.equal(priceConfig.authority.toString(), authority.publicKey.toString());

        console.log('✅ Price feed initialization successful');
        console.log('   Authority:', priceConfig.authority.toString());
      } catch (error) {
        console.error('Price feed initialization failed:', error);
        throw error;
      }
    });
  });

  describe('Cross-Program Integration', () => {
    it('PDA derivation works correctly', async () => {
      // Test Hub config PDA
      const [hubConfigPDA, hubBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('hub'), Buffer.from('config')],
        hubProgram.programId
      );
      
      // Test Profile PDA
      const [profilePDA, profileBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), authority.publicKey.toBuffer()],
        profileProgram.programId
      );

      // Test Offer PDA (using offer ID 1)
      const [offerPDA, offerBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), new anchor.BN(1).toArrayLike(Buffer, 'le', 8)],
        offerProgram.programId
      );

      // Test Trade PDA (using trade ID 1)
      const [tradePDA, tradeBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('trade'), new anchor.BN(1).toArrayLike(Buffer, 'le', 8)],
        tradeProgram.programId
      );

      // Test Price feed PDA
      const [priceFeedPDA, priceBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('price'), Buffer.from('USD')],
        priceProgram.programId
      );

      assert.ok(hubConfigPDA, 'Hub config PDA should be derivable');
      assert.ok(profilePDA, 'Profile PDA should be derivable');
      assert.ok(offerPDA, 'Offer PDA should be derivable');
      assert.ok(tradePDA, 'Trade PDA should be derivable');
      assert.ok(priceFeedPDA, 'Price feed PDA should be derivable');

      console.log('✅ All PDA derivations successful');
      console.log('   Hub config PDA:', hubConfigPDA.toString());
      console.log('   Profile PDA:', profilePDA.toString());
      console.log('   Offer PDA:', offerPDA.toString());
      console.log('   Trade PDA:', tradePDA.toString());
      console.log('   Price feed PDA:', priceFeedPDA.toString());
    });
  });
});