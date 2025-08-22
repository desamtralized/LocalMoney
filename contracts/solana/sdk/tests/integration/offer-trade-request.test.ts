import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { LocalMoneySDK, LocalMoneyConfig, CreateOfferInput } from '../../src/index';

const describeif = (process.env.INTEGRATION_TESTS === 'true') ? describe : describe.skip;

class TestWallet implements Wallet {
  constructor(public payer: Keypair) {}
  get publicKey() { return this.payer.publicKey; }
  async signTransaction(tx: any) { tx.partialSign(this.payer); return tx; }
  async signAllTransactions(txs: any[]) { return txs.map(tx => { tx.partialSign(this.payer); return tx; }); }
}

describeif('Offer + TradeRequest Integration (minimal)', () => {
  let connection: Connection;
  let buyer: Keypair;
  let seller: Keypair;
  let buyerSdk: LocalMoneySDK;
  let sellerSdk: LocalMoneySDK;

  const programIds = {
    hub: new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2'),
    profile: new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC'),
    price: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
    offer: new PublicKey('48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB'),
    trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM'),
  };

  beforeAll(async () => {
    connection = new Connection('http://localhost:8899', 'confirmed');
    buyer = Keypair.fromSeed(new Uint8Array(32).fill(4));
    seller = Keypair.fromSeed(new Uint8Array(32).fill(5));

    await Promise.all([
      connection.requestAirdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(seller.publicKey, 5 * LAMPORTS_PER_SOL),
    ]);
    await new Promise(r => setTimeout(r, 1000));

    buyerSdk = await LocalMoneySDK.create({
      connection,
      wallet: new TestWallet(buyer),
      programIds,
      enableCaching: true,
    } as LocalMoneyConfig);

    sellerSdk = await LocalMoneySDK.create({
      connection,
      wallet: new TestWallet(seller),
      programIds,
      enableCaching: true,
    } as LocalMoneyConfig);
  }, 15000);

  it('creates offer and trade request', async () => {
    // Ensure profiles
    await sellerSdk.createProfile('seller-mini');
    await buyerSdk.createProfile('buyer-mini');

    // Create a test token mint and offer
    const tokenMint = await sellerSdk.createTestTokenMint();

    const createOfferParams: CreateOfferInput = {
      offerType: { buy: {} },
      fiatCurrency: { usd: {} },
      fiatAmount: 1000,
      rate: 50_000,
      terms: 'bank transfer',
      tokenMint,
    };
    const offerResult = await sellerSdk.createOffer(createOfferParams);
    expect(typeof offerResult.signature).toBe('string');
    expect(typeof offerResult.offerId).toBe('number');

    // Wait briefly for confirmation
    await new Promise(r => setTimeout(r, 1000));

    // Create trade request against the created offer
    const { tradeId, signature } = await buyerSdk.createTradeRequest({
      offerId: offerResult.offerId,
      amount: 100,
      buyerContact: 'buyer@mini.test',
    });

    expect(typeof tradeId).toBe('number');
    expect(typeof signature).toBe('string');
  }, 60000);
});

