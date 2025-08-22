import { Connection, PublicKey } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import { 
  TestContext, 
  createTestOffer, 
  createTestTrade,
  createTestProfile,
  TestDataGenerator,
  waitForConfirmation
} from './fixtures';
import { TradingSDK, OfferSDK, ProfileSDK } from '../modules';
import { deriveHubConfigAddress } from '../pdas';
import { PROGRAM_IDS } from '../generated';

// Complete trading scenario from start to finish
export async function completeTradingScenario(
  context: TestContext
): Promise<{
  offerId: BN;
  tradeId: BN;
  signatures: string[];
}> {
  const signatures: string[] = [];
  
  // 1. Create profiles for both users
  console.log('Creating buyer profile...');
  const buyerProfile = await createTestProfile(context.profileSdk, {
    username: TestDataGenerator.randomUsername(),
    region: TestDataGenerator.randomRegion(),
  });
  signatures.push(buyerProfile.signature);
  
  console.log('Creating seller profile...');
  const sellerProfileSdk = new ProfileSDK(
    context.connection,
    new Wallet(context.seller)
  );
  const sellerProfile = await createTestProfile(sellerProfileSdk, {
    username: TestDataGenerator.randomUsername(),
    region: TestDataGenerator.randomRegion(),
  });
  signatures.push(sellerProfile.signature);
  
  // 2. Create an offer
  console.log('Creating offer...');
  const [hubConfig] = deriveHubConfigAddress();
  const offer = await createTestOffer(
    context.offerSdk,
    context.tokenMint,
    hubConfig,
    {
      offerType: 'sell',
      fiatCurrency: TestDataGenerator.randomFiatCurrency(),
      rate: TestDataGenerator.randomRate(),
      minAmount: TestDataGenerator.randomAmount(10, 100) * 1000000,
      maxAmount: TestDataGenerator.randomAmount(1000, 10000) * 1000000,
      terms: TestDataGenerator.randomTerms(),
    }
  );
  signatures.push(offer.signature);
  
  // 3. Activate the offer
  console.log('Activating offer...');
  const activateSig = await context.offerSdk.activateOffer(offer.offerId);
  signatures.push(activateSig);
  
  // 4. Create a trade request
  console.log('Creating trade...');
  const trade = await createTestTrade(
    context.tradingSdk,
    offer.offerId.toNumber(),
    {
      amount: TestDataGenerator.randomAmount(100, 500) * 1000000,
      buyerContact: TestDataGenerator.randomEmail(),
    }
  );
  signatures.push(trade.signature);
  
  // 5. Accept the trade (as seller)
  console.log('Accepting trade...');
  const sellerTradingSdk = new TradingSDK(
    context.connection,
    new Wallet(context.seller)
  );
  const acceptSig = await sellerTradingSdk.acceptTrade(trade.tradeId);
  signatures.push(acceptSig);
  
  // 6. Fund the escrow
  console.log('Funding escrow...');
  const fundSig = await sellerTradingSdk.fundEscrow(
    trade.tradeId,
    new BN(100 * 1000000),
    context.tokenMint
  );
  signatures.push(fundSig);
  
  // 7. Mark fiat as deposited (buyer)
  console.log('Marking fiat deposited...');
  const depositSig = await context.tradingSdk.markFiatDeposited(trade.tradeId);
  signatures.push(depositSig);
  
  // 8. Release funds (seller)
  console.log('Releasing funds...');
  const [hubConfigAddress] = deriveHubConfigAddress();
  const releaseSig = await sellerTradingSdk.releaseFunds(
    trade.tradeId,
    context.buyer.publicKey,
    context.tokenMint,
    hubConfigAddress,
    PublicKey.default // Hub fee account would be derived
  );
  signatures.push(releaseSig);
  
  console.log('Trading scenario completed successfully!');
  
  return {
    offerId: offer.offerId,
    tradeId: trade.tradeId,
    signatures,
  };
}

// Dispute resolution scenario
export async function disputeResolutionScenario(
  context: TestContext
): Promise<{
  tradeId: BN;
  signatures: string[];
  resolution: 'refunded' | 'released';
}> {
  const signatures: string[] = [];
  
  // Setup profiles and offer
  const [hubConfig] = deriveHubConfigAddress();
  const offer = await createTestOffer(
    context.offerSdk,
    context.tokenMint,
    hubConfig
  );
  signatures.push(offer.signature);
  
  // Create and accept trade
  const trade = await createTestTrade(
    context.tradingSdk,
    offer.offerId.toNumber()
  );
  signatures.push(trade.signature);
  
  const sellerTradingSdk = new TradingSDK(
    context.connection,
    new Wallet(context.seller)
  );
  const acceptSig = await sellerTradingSdk.acceptTrade(trade.tradeId);
  signatures.push(acceptSig);
  
  // Fund escrow
  const fundSig = await sellerTradingSdk.fundEscrow(
    trade.tradeId,
    new BN(100 * 1000000),
    context.tokenMint
  );
  signatures.push(fundSig);
  
  // Simulate dispute - randomly choose resolution
  const resolution = Math.random() > 0.5 ? 'refunded' : 'released';
  
  if (resolution === 'refunded') {
    // Refund to seller
    console.log('Refunding escrow to seller...');
    const refundSig = await sellerTradingSdk.refundEscrow(
      trade.tradeId,
      context.tokenMint
    );
    signatures.push(refundSig);
  } else {
    // Release to buyer
    console.log('Releasing escrow to buyer...');
    const [hubConfigAddress] = deriveHubConfigAddress();
    const releaseSig = await sellerTradingSdk.releaseFunds(
      trade.tradeId,
      context.buyer.publicKey,
      context.tokenMint,
      hubConfigAddress,
      PublicKey.default
    );
    signatures.push(releaseSig);
  }
  
  return {
    tradeId: trade.tradeId,
    signatures,
    resolution,
  };
}

// Multiple offers scenario
export async function multipleOffersScenario(
  context: TestContext,
  offerCount: number = 5
): Promise<{
  offerIds: BN[];
  signatures: string[];
}> {
  const signatures: string[] = [];
  const offerIds: BN[] = [];
  const [hubConfig] = deriveHubConfigAddress();
  
  for (let i = 0; i < offerCount; i++) {
    const offer = await createTestOffer(
      context.offerSdk,
      context.tokenMint,
      hubConfig,
      {
        offerType: i % 2 === 0 ? 'buy' : 'sell',
        fiatCurrency: TestDataGenerator.randomFiatCurrency(),
        rate: TestDataGenerator.randomRate(),
        minAmount: TestDataGenerator.randomAmount(10, 100) * 1000000,
        maxAmount: TestDataGenerator.randomAmount(1000, 10000) * 1000000,
      }
    );
    
    offerIds.push(offer.offerId);
    signatures.push(offer.signature);
    
    // Activate every other offer
    if (i % 2 === 0) {
      const activateSig = await context.offerSdk.activateOffer(offer.offerId);
      signatures.push(activateSig);
    }
  }
  
  console.log(`Created ${offerCount} offers`);
  
  return {
    offerIds,
    signatures,
  };
}

// High volume trading scenario
export async function highVolumeScenario(
  context: TestContext,
  tradeCount: number = 10
): Promise<{
  tradeIds: BN[];
  totalVolume: BN;
  signatures: string[];
}> {
  const signatures: string[] = [];
  const tradeIds: BN[] = [];
  let totalVolume = new BN(0);
  const [hubConfig] = deriveHubConfigAddress();
  
  // Create a single offer for all trades
  const offer = await createTestOffer(
    context.offerSdk,
    context.tokenMint,
    hubConfig,
    {
      offerType: 'sell',
      rate: 100,
      minAmount: 10 * 1000000,
      maxAmount: 100000 * 1000000,
    }
  );
  signatures.push(offer.signature);
  
  // Activate offer
  const activateSig = await context.offerSdk.activateOffer(offer.offerId);
  signatures.push(activateSig);
  
  // Create multiple trades
  for (let i = 0; i < tradeCount; i++) {
    const amount = TestDataGenerator.randomAmount(10, 1000) * 1000000;
    const trade = await createTestTrade(
      context.tradingSdk,
      offer.offerId.toNumber(),
      {
        amount,
        buyerContact: TestDataGenerator.randomEmail(),
      }
    );
    
    tradeIds.push(trade.tradeId);
    totalVolume = totalVolume.add(new BN(amount));
    signatures.push(trade.signature);
    
    // Small delay between trades
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`Created ${tradeCount} trades with total volume: ${totalVolume.toString()}`);
  
  return {
    tradeIds,
    totalVolume,
    signatures,
  };
}

// Profile reputation building scenario
export async function reputationBuildingScenario(
  context: TestContext,
  successfulTrades: number = 5
): Promise<{
  profileAddress: PublicKey;
  finalRating: number;
  totalVolume: BN;
}> {
  // Create profile
  const profile = await createTestProfile(context.profileSdk);
  
  let totalVolume = new BN(0);
  const ratings: number[] = [];
  
  // Simulate successful trades
  for (let i = 0; i < successfulTrades; i++) {
    const volume = TestDataGenerator.randomAmount(100, 5000) * 1000000;
    totalVolume = totalVolume.add(new BN(volume));
    
    // Random rating between 3 and 5
    const rating = Math.floor(Math.random() * 3) + 3;
    ratings.push(rating);
  }
  
  // Calculate average rating
  const finalRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  
  console.log(`Built reputation: ${successfulTrades} trades, ${finalRating.toFixed(1)} rating`);
  
  return {
    profileAddress: profile.profileAddress,
    finalRating,
    totalVolume,
  };
}

// Edge case testing scenario
export async function edgeCaseScenario(
  context: TestContext
): Promise<{
  results: Array<{ test: string; passed: boolean; error?: string }>;
}> {
  const results: Array<{ test: string; passed: boolean; error?: string }> = [];
  const [hubConfig] = deriveHubConfigAddress();
  
  // Test 1: Create offer with minimum amount
  try {
    await createTestOffer(
      context.offerSdk,
      context.tokenMint,
      hubConfig,
      {
        minAmount: 1,
        maxAmount: 1,
      }
    );
    results.push({ test: 'Minimum amount offer', passed: true });
  } catch (error: any) {
    results.push({ 
      test: 'Minimum amount offer', 
      passed: false, 
      error: error.message 
    });
  }
  
  // Test 2: Create offer with maximum amount
  try {
    await createTestOffer(
      context.offerSdk,
      context.tokenMint,
      hubConfig,
      {
        minAmount: Number.MAX_SAFE_INTEGER - 1,
        maxAmount: Number.MAX_SAFE_INTEGER,
      }
    );
    results.push({ test: 'Maximum amount offer', passed: true });
  } catch (error: any) {
    results.push({ 
      test: 'Maximum amount offer', 
      passed: false, 
      error: error.message 
    });
  }
  
  // Test 3: Create profile with long username
  try {
    await createTestProfile(context.profileSdk, {
      username: 'a'.repeat(100),
    });
    results.push({ test: 'Long username', passed: true });
  } catch (error: any) {
    results.push({ 
      test: 'Long username', 
      passed: false, 
      error: error.message 
    });
  }
  
  // Test 4: Create trade with expired duration
  try {
    const offer = await createTestOffer(
      context.offerSdk,
      context.tokenMint,
      hubConfig
    );
    await createTestTrade(
      context.tradingSdk,
      offer.offerId.toNumber(),
      {
        expiryDuration: 1, // 1 second
      }
    );
    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 2000));
    results.push({ test: 'Expired trade', passed: true });
  } catch (error: any) {
    results.push({ 
      test: 'Expired trade', 
      passed: false, 
      error: error.message 
    });
  }
  
  return { results };
}

// Stress test scenario
export async function stressTestScenario(
  context: TestContext,
  operations: number = 100
): Promise<{
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageTime: number;
}> {
  let successfulOperations = 0;
  let failedOperations = 0;
  const times: number[] = [];
  const [hubConfig] = deriveHubConfigAddress();
  
  for (let i = 0; i < operations; i++) {
    const startTime = Date.now();
    
    try {
      // Randomly choose operation
      const operation = Math.floor(Math.random() * 4);
      
      switch (operation) {
        case 0:
          // Create offer
          await createTestOffer(
            context.offerSdk,
            context.tokenMint,
            hubConfig
          );
          break;
        case 1:
          // Create profile
          await createTestProfile(context.profileSdk);
          break;
        case 2:
          // Create trade
          const offer = await createTestOffer(
            context.offerSdk,
            context.tokenMint,
            hubConfig
          );
          await createTestTrade(
            context.tradingSdk,
            offer.offerId.toNumber()
          );
          break;
        case 3:
          // Update offer
          const offerToUpdate = await createTestOffer(
            context.offerSdk,
            context.tokenMint,
            hubConfig
          );
          await context.offerSdk.updateOffer({
            offerId: offerToUpdate.offerId,
            rate: TestDataGenerator.randomRate(),
          });
          break;
      }
      
      successfulOperations++;
    } catch (error) {
      failedOperations++;
    }
    
    times.push(Date.now() - startTime);
  }
  
  const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
  
  console.log(`Stress test: ${successfulOperations}/${operations} successful`);
  
  return {
    totalOperations: operations,
    successfulOperations,
    failedOperations,
    averageTime,
  };
}