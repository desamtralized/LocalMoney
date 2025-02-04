/// <reference types="jest" />

import { Keypair, PublicKey } from '@solana/web3.js';
import { TestSetup } from './setup';
import { LocalMoneyClient } from '../client';
import { ProfileClient } from '../profile';
import { HubClient } from '../hub';
import { PriceClient } from '../price';
import { OfferClient } from '../offer';
import { TradeClient } from '../trade';
import { PaymentMethod, CreateOfferParams, CreateTradeParams } from '../types';

describe('LocalMoney Integration Tests', () => {
  let setup: TestSetup;
  let hubClient: HubClient;
  let priceClient: PriceClient;
  let profileClient: ProfileClient;
  let offerClient: OfferClient;
  let tradeClient: TradeClient;
  let seller: { keypair: Keypair; usdcAccount: PublicKey };
  let buyer: { keypair: Keypair; usdcAccount: PublicKey };

  beforeAll(async () => {
    // Initialize test environment
    setup = new TestSetup();
    await setup.initialize();

    // Initialize clients
    const baseClient = new LocalMoneyClient(setup.connection, setup.payer);
    hubClient = new HubClient(setup.connection, setup.payer);
    priceClient = new PriceClient(setup.connection, setup.payer);
    profileClient = new ProfileClient(setup.connection, setup.payer);
    offerClient = new OfferClient(setup.connection, setup.payer);
    tradeClient = new TradeClient(setup.connection, setup.payer);

    // Create test users
    seller = await setup.createUserWithBalance();
    buyer = await setup.createUserWithBalance();
  });

  it('should complete a successful trade', async () => {
    // 1. Initialize hub
    const hubConfig = new Keypair();
    const feeAccount = await setup.createTokenAccount(setup.payer.publicKey);
    
    await hubClient.initialize(
      hubConfig,
      priceClient.PRICE_PROGRAM_ID,
      tradeClient.TRADE_PROGRAM_ID,
      profileClient.PROFILE_PROGRAM_ID,
      offerClient.OFFER_PROGRAM_ID,
      feeAccount,
      100, // 1% fee
    );

    // 2. Create seller profile
    const sellerProfile = new Keypair();
    await profileClient.createProfile(sellerProfile, 'seller');
    const sellerProfileData = await profileClient.getProfile(sellerProfile.publicKey);
    expect(sellerProfileData.username).toBe('seller');

    // 3. Create buyer profile
    const buyerProfile = new Keypair();
    await profileClient.createProfile(buyerProfile, 'buyer');
    const buyerProfileData = await profileClient.getProfile(buyerProfile.publicKey);
    expect(buyerProfileData.username).toBe('buyer');

    // 4. Register price oracle
    await priceClient.registerHub();
    await priceClient.updatePrices([
      {
        currency: 'USD',
        usdPrice: BigInt(1_000_000), // $1.00
        updatedAt: BigInt(Date.now()),
      },
    ]);

    // 5. Create sell offer
    const offerAccount = new Keypair();
    const paymentMethod: PaymentMethod = {
      type: 'BankTransfer',
      bankName: 'Test Bank',
      accountInfo: '1234567890',
    };

    const createOfferParams: CreateOfferParams = {
      offerAccount,
      tokenMint: setup.usdcMint,
      amount: BigInt(100_000_000), // 100 USDC
      pricePerToken: BigInt(1_000_000), // $1.00 per USDC
      minAmount: BigInt(10_000_000), // Min 10 USDC
      maxAmount: BigInt(100_000_000), // Max 100 USDC
      paymentMethod,
      creator: seller.keypair,
      tokenAccount: seller.usdcAccount,
    };

    await offerClient.createOffer(createOfferParams);

    const offerData = await offerClient.getOffer(offerAccount.publicKey);
    expect(offerData.creator).toEqual(seller.keypair.publicKey);
    expect(offerData.status).toBe('Active');

    // 6. Create trade
    const tradeAccount = new Keypair();
    const escrowAccount = await setup.createTokenAccount(tradeClient.TRADE_PROGRAM_ID);
    
    const createTradeParams: CreateTradeParams = {
      tradeAccount,
      offerAccount: offerAccount.publicKey,
      amount: BigInt(50_000_000), // 50 USDC
      escrowAccount,
      buyer: buyer.keypair,
    };

    await tradeClient.createTrade(createTradeParams);

    let tradeData = await tradeClient.getTrade(tradeAccount.publicKey);
    expect(tradeData.status).toBe('Open');
    expect(tradeData.buyer).toEqual(buyer.keypair.publicKey);

    // 7. Accept trade
    await tradeClient.acceptTrade(
      tradeAccount.publicKey,
      seller.keypair,
    );

    tradeData = await tradeClient.getTrade(tradeAccount.publicKey);
    expect(tradeData.status).toBe('InProgress');

    // 8. Complete trade
    await tradeClient.completeTrade(
      tradeAccount.publicKey,
      buyer.keypair,
    );

    tradeData = await tradeClient.getTrade(tradeAccount.publicKey);
    expect(tradeData.status).toBe('Completed');

    // 9. Verify profiles updated
    const updatedSellerProfile = await profileClient.getProfile(sellerProfile.publicKey);
    expect(updatedSellerProfile.tradesCompleted).toBe(1);
    expect(updatedSellerProfile.reputation).toBeGreaterThan(0);

    const updatedBuyerProfile = await profileClient.getProfile(buyerProfile.publicKey);
    expect(updatedBuyerProfile.tradesCompleted).toBe(1);
    expect(updatedBuyerProfile.reputation).toBeGreaterThan(0);
  }, 30000); // Increase timeout for integration test
}); 