import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program, BN } from '@coral-xyz/anchor';
import { derivePriceFeedAddress } from '../pdas';
import { Price } from '../types/price';
import { PROGRAM_IDS } from '../generated';

const PriceIDL = require('../types/price.json');

export interface PriceFeedInfo {
  tokenMint: PublicKey;
  price: BN;
  confidence: BN;
  oracle: PublicKey;
  authority: PublicKey;
  lastUpdateSlot: BN;
  lastUpdateTimestamp: BN;
  isActive: boolean;
}

export interface UpdatePriceParams {
  tokenMint: PublicKey;
  newPrice: number;
  confidence: number;
}

export class PriceSDK {
  private program: Program<Price>;
  
  constructor(
    private connection: Connection,
    private wallet: Wallet,
    private programId: PublicKey = new PublicKey(PROGRAM_IDS.price)
  ) {
    const provider = new AnchorProvider(connection, wallet, {});
    this.program = new Program<Price>(PriceIDL, programId, provider);
  }
  
  // Initialize a new price feed
  async initializePriceFeed(tokenMint: PublicKey): Promise<string> {
    const [priceFeed] = derivePriceFeedAddress(tokenMint, this.programId);
    
    const tx = await this.program.methods
      .initializePriceFeed(tokenMint)
      .accounts({
        priceFeed,
        authority: this.wallet.publicKey,
        tokenMint,
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      })
      .rpc();
    
    return tx;
  }
  
  // Update price (oracle only)
  async updatePrice(params: UpdatePriceParams): Promise<string> {
    const [priceFeed] = derivePriceFeedAddress(params.tokenMint, this.programId);
    
    const tx = await this.program.methods
      .updatePrice(
        new BN(params.newPrice),
        new BN(params.confidence)
      )
      .accounts({
        priceFeed,
        oracle: this.wallet.publicKey,
      })
      .rpc();
    
    return tx;
  }
  
  // Set oracle for a price feed (authority only)
  async setOracle(tokenMint: PublicKey, oracle: PublicKey): Promise<string> {
    const [priceFeed] = derivePriceFeedAddress(tokenMint, this.programId);
    
    const tx = await this.program.methods
      .setOracle(oracle)
      .accounts({
        priceFeed,
        authority: this.wallet.publicKey,
      })
      .rpc();
    
    return tx;
  }
  
  // Set new authority for a price feed
  async setPriceAuthority(tokenMint: PublicKey, newAuthority: PublicKey): Promise<string> {
    const [priceFeed] = derivePriceFeedAddress(tokenMint, this.programId);
    
    const tx = await this.program.methods
      .setPriceAuthority(newAuthority)
      .accounts({
        priceFeed,
        currentAuthority: this.wallet.publicKey,
      })
      .rpc();
    
    return tx;
  }
  
  // Get price feed data
  async getPriceFeed(tokenMint: PublicKey): Promise<PriceFeedInfo | null> {
    try {
      const [priceFeedAddress] = derivePriceFeedAddress(tokenMint, this.programId);
      const priceFeed = await this.program.account.priceFeed.fetch(priceFeedAddress);
      
      return {
        tokenMint: priceFeed.tokenMint,
        price: priceFeed.price,
        confidence: priceFeed.confidence,
        oracle: priceFeed.oracle,
        authority: priceFeed.authority,
        lastUpdateSlot: priceFeed.lastUpdateSlot,
        lastUpdateTimestamp: priceFeed.lastUpdateTimestamp,
        isActive: priceFeed.isActive,
      };
    } catch (error) {
      // Price feed doesn't exist
      return null;
    }
  }
  
  // Get current price
  async getCurrentPrice(tokenMint: PublicKey): Promise<number | null> {
    const priceFeed = await this.getPriceFeed(tokenMint);
    return priceFeed ? priceFeed.price.toNumber() : null;
  }
  
  // Get all price feeds
  async getAllPriceFeeds(): Promise<PriceFeedInfo[]> {
    const priceFeeds = await this.program.account.priceFeed.all();
    
    return priceFeeds.map(p => ({
      tokenMint: p.account.tokenMint,
      price: p.account.price,
      confidence: p.account.confidence,
      oracle: p.account.oracle,
      authority: p.account.authority,
      lastUpdateSlot: p.account.lastUpdateSlot,
      lastUpdateTimestamp: p.account.lastUpdateTimestamp,
      isActive: p.account.isActive,
    }));
  }
  
  // Get active price feeds
  async getActivePriceFeeds(): Promise<PriceFeedInfo[]> {
    const priceFeeds = await this.program.account.priceFeed.all();
    
    return priceFeeds
      .filter(p => p.account.isActive)
      .map(p => ({
        tokenMint: p.account.tokenMint,
        price: p.account.price,
        confidence: p.account.confidence,
        oracle: p.account.oracle,
        authority: p.account.authority,
        lastUpdateSlot: p.account.lastUpdateSlot,
        lastUpdateTimestamp: p.account.lastUpdateTimestamp,
        isActive: p.account.isActive,
      }));
  }
  
  // Check if price is stale
  isPriceStale(priceFeed: PriceFeedInfo, maxAgeSeconds: number = 300): boolean {
    const now = Date.now() / 1000;
    const lastUpdate = priceFeed.lastUpdateTimestamp.toNumber();
    return (now - lastUpdate) > maxAgeSeconds;
  }
  
  // Get price with staleness check
  async getPriceWithStalenessCheck(
    tokenMint: PublicKey,
    maxAgeSeconds: number = 300
  ): Promise<{
    price: number | null;
    isStale: boolean;
    lastUpdate: number;
  }> {
    const priceFeed = await this.getPriceFeed(tokenMint);
    
    if (!priceFeed) {
      return {
        price: null,
        isStale: true,
        lastUpdate: 0,
      };
    }
    
    return {
      price: priceFeed.price.toNumber(),
      isStale: this.isPriceStale(priceFeed, maxAgeSeconds),
      lastUpdate: priceFeed.lastUpdateTimestamp.toNumber(),
    };
  }
  
  // Calculate price with confidence interval
  getPriceWithConfidence(priceFeed: PriceFeedInfo): {
    price: number;
    minPrice: number;
    maxPrice: number;
    confidence: number;
  } {
    const price = priceFeed.price.toNumber();
    const confidence = priceFeed.confidence.toNumber();
    
    return {
      price,
      minPrice: price - confidence,
      maxPrice: price + confidence,
      confidence,
    };
  }
  
  // Monitor price changes
  async onPriceChange(
    tokenMint: PublicKey,
    callback: (newPrice: PriceFeedInfo) => void
  ): Promise<number> {
    const [priceFeedAddress] = derivePriceFeedAddress(tokenMint, this.programId);
    
    return this.program.account.priceFeed.subscribe(
      priceFeedAddress,
      (account) => {
        callback({
          tokenMint: account.tokenMint,
          price: account.price,
          confidence: account.confidence,
          oracle: account.oracle,
          authority: account.authority,
          lastUpdateSlot: account.lastUpdateSlot,
          lastUpdateTimestamp: account.lastUpdateTimestamp,
          isActive: account.isActive,
        });
      }
    );
  }
  
  // Unsubscribe from price changes
  async unsubscribe(subscriptionId: number): Promise<void> {
    await this.program.account.priceFeed.unsubscribe(subscriptionId);
  }
  
  // Get price feed address
  getPriceFeedAddress(tokenMint: PublicKey): PublicKey {
    const [address] = derivePriceFeedAddress(tokenMint, this.programId);
    return address;
  }
}