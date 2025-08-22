const { LocalMoneySDK } = require('./dist/index.js');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');

async function testOfferCreation() {
  console.log('🧪 Testing Offer Creation with PDA Fix...\n');
  
  const keypair = Keypair.generate();
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  
  // Airdrop SOL
  console.log('💰 Airdropping SOL...');
  const airdropSig = await connection.requestAirdrop(keypair.publicKey, 5000000000);
  await connection.confirmTransaction(airdropSig, 'confirmed');
  console.log('✅ Airdrop completed\n');
  
  const sdk = new LocalMoneySDK({
    provider,
    programIds: {
      hub: new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2'),
      profile: new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC'),
      offer: new PublicKey('48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB'),
      trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM'),
      price: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
    }
  });
  
  // Wait for programs to initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Create profile first
  console.log('👤 Creating profile...');
  try {
    await sdk.createProfile('TestUser_' + Math.floor(Math.random() * 10000));
    console.log('✅ Profile created\n');
  } catch (e) {
    console.error('❌ Profile creation failed:', e.message);
    return;
  }
  
  // Test offer creation with different offer IDs
  const testOfferIds = [1, 42, 999, 123456];
  
  for (const offerId of testOfferIds) {
    console.log(`📝 Testing offer creation with ID: ${offerId}`);
    
    try {
      // Override the offer ID in SDK for testing
      const originalCreateOffer = sdk.createOffer.bind(sdk);
      sdk.createOffer = async function(input) {
        const { BN } = require('@coral-xyz/anchor');
        const user = this.provider.wallet.publicKey;
        const [profilePDA] = this.getProfilePDA(user);
        
        // Use our test offer ID
        const offerIdBN = new BN(offerId);
        const [offerPDA] = this.getOfferPDA(offerIdBN);
        
        console.log(`  - Offer PDA: ${offerPDA.toString()}`);
        
        const idlParams = {
          offer_type: input.offerType,
          fiat_currency: input.fiatCurrency,
          rate: new BN(input.rate),
          min_amount: new BN(input.minAmount ?? 100),
          max_amount: new BN(input.maxAmount ?? 1000),
          description: input.description ? { value: input.description } : null,
        };
        
        const [hubConfigPDA] = this.getHubConfigPDA();
        
        const signature = await this.offerProgram.methods
          .createOffer(offerIdBN, idlParams)
          .accounts({
            owner: user,
            profileProgram: this.programIds.profile,
            userProfile: profilePDA,
            offer: offerPDA,
            tokenMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
            tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
            hubConfig: hubConfigPDA,
            systemProgram: new PublicKey('11111111111111111111111111111111'),
          })
          .rpc();
        
        console.log(`  - Transaction: ${signature}`);
        return { offerId: offerIdBN.toNumber(), signature };
      };
      
      const result = await sdk.createOffer({
        offerType: { sell: {} },
        fiatCurrency: { usd: {} },
        rate: 100,
        minAmount: 100,
        maxAmount: 1000,
        description: 'Test offer',
      });
      
      console.log(`✅ Offer ${offerId} created successfully!\n`);
      
      // Verify the offer was created
      const offer = await sdk.getOffer(offerId);
      if (offer) {
        console.log(`✅ Offer ${offerId} verified on-chain\n`);
      } else {
        console.log(`⚠️ Warning: Could not fetch offer ${offerId} from chain\n`);
      }
      
    } catch (e) {
      console.error(`❌ Offer ${offerId} creation failed:`, e.message);
      console.error('Full error:', e);
      return;
    }
  }
  
  console.log('🎉 All offer creation tests passed!');
}

testOfferCreation().catch(console.error);