import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { TradingSDK, OfferSDK, ProfileSDK, PriceSDK } from '../modules';
import { createMint, mintTo, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';

export interface TestContext {
  connection: Connection;
  buyer: Keypair;
  seller: Keypair;
  tokenMint: PublicKey;
  tradingSdk: TradingSDK;
  offerSdk: OfferSDK;
  profileSdk: ProfileSDK;
  priceSdk: PriceSDK;
  hubConfig?: PublicKey;
}

export interface TestWallets {
  buyer: Keypair;
  seller: Keypair;
  arbitrator: Keypair;
  oracle: Keypair;
}

export interface TestTokens {
  mint: PublicKey;
  decimals: number;
  buyerTokenAccount: PublicKey;
  sellerTokenAccount: PublicKey;
}

// Create test wallets with SOL airdrops
export async function createTestWallets(
  connection: Connection,
  solAmount: number = 10
): Promise<TestWallets> {
  const buyer = Keypair.generate();
  const seller = Keypair.generate();
  const arbitrator = Keypair.generate();
  const oracle = Keypair.generate();
  
  // Airdrop SOL to all wallets
  const airdrops = [
    connection.requestAirdrop(buyer.publicKey, solAmount * LAMPORTS_PER_SOL),
    connection.requestAirdrop(seller.publicKey, solAmount * LAMPORTS_PER_SOL),
    connection.requestAirdrop(arbitrator.publicKey, solAmount * LAMPORTS_PER_SOL),
    connection.requestAirdrop(oracle.publicKey, solAmount * LAMPORTS_PER_SOL),
  ];
  
  await Promise.all(airdrops);
  
  // Wait for confirmations
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return { buyer, seller, arbitrator, oracle };
}

// Create test token mint and accounts
export async function createTestTokens(
  connection: Connection,
  payer: Keypair,
  buyer: PublicKey,
  seller: PublicKey,
  decimals: number = 6,
  initialSupply: number = 1000000
): Promise<TestTokens> {
  // Create mint
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    decimals
  );
  
  // Create token accounts
  const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    buyer
  );
  
  const sellerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    seller
  );
  
  // Mint tokens to both accounts
  await mintTo(
    connection,
    payer,
    mint,
    buyerTokenAccount.address,
    payer,
    initialSupply * Math.pow(10, decimals)
  );
  
  await mintTo(
    connection,
    payer,
    mint,
    sellerTokenAccount.address,
    payer,
    initialSupply * Math.pow(10, decimals)
  );
  
  return {
    mint,
    decimals,
    buyerTokenAccount: buyerTokenAccount.address,
    sellerTokenAccount: sellerTokenAccount.address,
  };
}

// Setup complete test context
export async function setupTestContext(
  endpoint: string = 'http://localhost:8899'
): Promise<TestContext> {
  const connection = new Connection(endpoint, 'confirmed');
  
  // Create wallets
  const wallets = await createTestWallets(connection);
  
  // Create token mint
  const tokens = await createTestTokens(
    connection,
    wallets.buyer,
    wallets.buyer.publicKey,
    wallets.seller.publicKey
  );
  
  // Create SDK instances
  const buyerWallet = new Wallet(wallets.buyer);
  const sellerWallet = new Wallet(wallets.seller);
  
  const tradingSdk = new TradingSDK(connection, buyerWallet);
  const offerSdk = new OfferSDK(connection, sellerWallet);
  const profileSdk = new ProfileSDK(connection, buyerWallet);
  const priceSdk = new PriceSDK(connection, buyerWallet);
  
  return {
    connection,
    buyer: wallets.buyer,
    seller: wallets.seller,
    tokenMint: tokens.mint,
    tradingSdk,
    offerSdk,
    profileSdk,
    priceSdk,
  };
}

// Create test offer fixture
export async function createTestOffer(
  sdk: OfferSDK,
  tokenMint: PublicKey,
  hubConfig: PublicKey,
  options: Partial<{
    offerType: 'buy' | 'sell';
    fiatCurrency: string;
    rate: number;
    minAmount: number;
    maxAmount: number;
    fiatAmount: number;
    terms: string;
    description: string;
  }> = {}
): Promise<{ offerId: BN; offerAddress: PublicKey; signature: string }> {
  const defaults = {
    offerType: 'buy' as const,
    fiatCurrency: 'USD',
    rate: 100, // 1:1 rate
    minAmount: 10_000000, // 10 USDC
    maxAmount: 10000_000000, // 10000 USDC
  };
  
  const params = { ...defaults, ...options };
  
  return await sdk.createOffer({
    ...params,
    tokenMint,
    hubConfig,
  });
}

// Create test trade fixture
export async function createTestTrade(
  sdk: TradingSDK,
  offerId: number,
  options: Partial<{
    amount: number;
    buyerContact: string;
    expiryDuration: number;
    arbitrator: PublicKey;
  }> = {}
): Promise<{ tradeId: BN; tradeAddress: PublicKey; signature: string }> {
  const defaults = {
    amount: 100_000000, // 100 USDC
    buyerContact: 'test@example.com',
    expiryDuration: 86400, // 24 hours
  };
  
  const params = { ...defaults, ...options };
  
  return await sdk.createTrade({
    offerId,
    ...params,
  });
}

// Create test profile fixture
export async function createTestProfile(
  sdk: ProfileSDK,
  options: Partial<{
    username: string;
    region: string;
    contactInfo: string;
  }> = {}
): Promise<{ profileAddress: PublicKey; signature: string }> {
  const defaults = {
    username: `user_${Date.now()}`,
    region: 'US',
    contactInfo: 'test@example.com',
  };
  
  const params = { ...defaults, ...options };
  
  return await sdk.createProfile(params);
}

// Create test price feed fixture
export async function createTestPriceFeed(
  sdk: PriceSDK,
  tokenMint: PublicKey,
  initialPrice: number = 1000000 // $1.00 with 6 decimals
): Promise<string> {
  const signature = await sdk.initializePriceFeed(tokenMint);
  
  // Update with initial price
  await sdk.updatePrice({
    tokenMint,
    newPrice: initialPrice,
    confidence: 1000, // 0.1% confidence
  });
  
  return signature;
}

// Generate random test data
export class TestDataGenerator {
  static randomUsername(): string {
    const adjectives = ['Fast', 'Trusted', 'Pro', 'Expert', 'Verified'];
    const nouns = ['Trader', 'Seller', 'Buyer', 'Exchange', 'Market'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}${Math.floor(Math.random() * 10000)}`;
  }
  
  static randomRegion(): string {
    const regions = ['US', 'EU', 'UK', 'CA', 'AU', 'JP', 'SG', 'HK'];
    return regions[Math.floor(Math.random() * regions.length)];
  }
  
  static randomFiatCurrency(): string {
    const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SGD', 'HKD'];
    return currencies[Math.floor(Math.random() * currencies.length)];
  }
  
  static randomRate(min: number = 90, max: number = 110): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  static randomAmount(min: number = 10, max: number = 10000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  static randomEmail(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
  }
  
  static randomTerms(): string {
    const terms = [
      'Bank transfer only',
      'PayPal accepted',
      'Cash deposit available',
      'Zelle or Venmo',
      'Wire transfer for large amounts',
    ];
    return terms[Math.floor(Math.random() * terms.length)];
  }
}

// Clean up test accounts
export async function cleanupTestAccounts(
  connection: Connection,
  accounts: PublicKey[]
): Promise<void> {
  // In a real test environment, you might want to close accounts
  // to recover rent. For now, this is a placeholder.
  console.log(`Cleanup: ${accounts.length} accounts marked for cleanup`);
}

// Wait for transaction confirmation
export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  commitment: 'confirmed' | 'finalized' = 'confirmed'
): Promise<void> {
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature,
      ...latestBlockhash,
    },
    commitment
  );
}