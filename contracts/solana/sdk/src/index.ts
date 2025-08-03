import { Connection, PublicKey, Keypair, TransactionSignature, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program, IdlTypes, IdlAccounts, BN, AnchorError } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createInitializeMintInstruction } from '@solana/spl-token';

// Import generated types
import { Hub } from './types/hub';
import { Profile } from './types/profile';
import { Price } from './types/price';
import { Offer } from './types/offer';
import { Trade } from './types/trade';

// Import IDL files for local use with deployed program IDs
const HubIDL = require('../../target/idl/hub.json');
const ProfileIDL = require('../../target/idl/profile.json');
const PriceIDL = require('../../target/idl/price.json');
const OfferIDL = require('../../target/idl/offer.json');
const TradeIDL = require('../../target/idl/trade.json');

// Type aliases for convenience
export type HubAccount = IdlAccounts<Hub>['hubConfig'];
export type ProfileAccount = IdlAccounts<Profile>['profile'];
export type PriceAccount = IdlAccounts<Price>['priceFeed'];
export type OfferAccount = IdlAccounts<Offer>['offer'];
export type TradeAccount = IdlAccounts<Trade>['trade'];

export type CreateOfferParams = IdlTypes<Offer>['CreateOfferParams'];
export type CreateTradeParams = IdlTypes<Trade>['CreateTradeParams'];
export type FiatCurrency = IdlTypes<Profile>['FiatCurrency'];
export type OfferType = IdlTypes<Offer>['OfferType'];
export type TradeState = IdlTypes<Profile>['TradeState'];

export interface LocalMoneyConfig {
  connection: Connection;
  wallet: Wallet;
  programIds: {
    hub: PublicKey;
    profile: PublicKey;
    price: PublicKey;
    offer: PublicKey;
    trade: PublicKey;
  };
  enableCaching?: boolean;
  cacheTtl?: number; // Cache time-to-live in milliseconds
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface BatchTransactionResult {
  signatures: TransactionSignature[];
  errors: (Error | null)[];
  success: boolean;
}

export class LocalMoneyError extends Error {
  constructor(
    message: string,
    public code?: number,
    public programError?: string,
    public logs?: string[]
  ) {
    super(message);
    this.name = 'LocalMoneyError';
  }

  static fromAnchorError(error: AnchorError): LocalMoneyError {
    return new LocalMoneyError(
      error.error.errorMessage || error.message,
      error.error.errorCode?.number,
      error.error.errorCode?.code,
      error.logs
    );
  }
}

export class LocalMoneySDK {
  private connection: Connection;
  private provider: AnchorProvider;
  private programIds: LocalMoneyConfig['programIds'];
  private enableCaching: boolean;
  private cacheTtl: number;
  private cache: Map<string, CacheEntry<any>>;
  private programsInitialized: boolean = false;
  
  // Initialized programs with IDLs
  private hubProgram?: Program<Hub>;
  private profileProgram?: Program<Profile>;
  private priceProgram?: Program<Price>;
  private offerProgram?: Program<Offer>;
  private tradeProgram?: Program<Trade>;

  constructor(config: LocalMoneyConfig) {
    this.connection = config.connection;
    this.provider = new AnchorProvider(config.connection, config.wallet, {});
    this.programIds = config.programIds;
    this.enableCaching = config.enableCaching ?? true;
    this.cacheTtl = config.cacheTtl ?? 60000; // 1 minute default
    this.cache = new Map();
    
    // Programs will be initialized asynchronously
    this.initializePrograms();
  }

  // Static factory method for async initialization
  static async create(config: LocalMoneyConfig): Promise<LocalMoneySDK> {
    const sdk = new LocalMoneySDK(config);
    await sdk.waitForProgramsInitialized();  
    return sdk;
  }

  private async initializePrograms() {
    try {
      console.log('🔄 Initializing programs...');
      
      // Initialize programs using local IDL files with deployed program IDs
      console.log('📝 Initializing profile program:', this.programIds.profile.toString());
      const modifiedProfileIDL = { ...ProfileIDL, address: this.programIds.profile.toString() };
      this.profileProgram = new Program(modifiedProfileIDL, this.provider) as Program<Profile>;
      console.log('✅ Profile program initialized');
      
      console.log('💰 Initializing price program:', this.programIds.price.toString());
      const modifiedPriceIDL = { ...PriceIDL, address: this.programIds.price.toString() };
      this.priceProgram = new Program(modifiedPriceIDL, this.provider) as Program<Price>;
      console.log('✅ Price program initialized');
      
      console.log('🎯 Initializing offer program:', this.programIds.offer.toString());
      const modifiedOfferIDL = { ...OfferIDL, address: this.programIds.offer.toString() };
      this.offerProgram = new Program(modifiedOfferIDL, this.provider) as Program<Offer>;
      console.log('✅ Offer program initialized');
      
      console.log('🤝 Initializing trade program:', this.programIds.trade.toString());
      const modifiedTradeIDL = { ...TradeIDL, address: this.programIds.trade.toString() };
      this.tradeProgram = new Program(modifiedTradeIDL, this.provider) as Program<Trade>;
      console.log('✅ Trade program initialized');
      
      try {
        console.log('🏢 Initializing hub program:', this.programIds.hub.toString());
        const modifiedHubIDL = { ...HubIDL, address: this.programIds.hub.toString() };
        this.hubProgram = new Program(modifiedHubIDL, this.provider) as Program<Hub>;
        console.log('✅ Hub program initialized'); 
      } catch (error) {
        console.warn('⚠️ Hub program not available:', error);
      }
      
      this.programsInitialized = true;
      console.log('🎉 All programs initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize programs:', error);
      this.programsInitialized = true; // Mark as complete even if failed
    }
  }

  async waitForProgramsInitialized() {
    while (!this.programsInitialized) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Utility methods for PDA derivation
  getProfilePDA(user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('profile'), user.toBuffer()],
      this.programIds.profile
    );
  }

  getOfferPDA(offerId: number): [PublicKey, number] {
    // Convert to bytes matching Rust u64 little-endian format
    const offerIdBuffer = Buffer.alloc(8);
    offerIdBuffer.writeBigUInt64LE(BigInt(offerId), 0);
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from('offer'), offerIdBuffer],
      this.programIds.offer
    );
  }

  getHubConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('hub'), Buffer.from('config')],
      this.programIds.hub
    );
  }

  getTradePDA(tradeId: number): [PublicKey, number] {
    // Convert to bytes matching Rust u64 little-endian format
    const tradeIdBuffer = Buffer.alloc(8);
    tradeIdBuffer.writeBigUInt64LE(BigInt(tradeId), 0);
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from('trade'), tradeIdBuffer],
      this.programIds.trade
    );
  }

  getEscrowPDA(tradeId: number): [PublicKey, number] {
    // Convert to bytes matching Rust u64 little-endian format
    const tradeIdBuffer = Buffer.alloc(8);
    tradeIdBuffer.writeBigUInt64LE(BigInt(tradeId), 0);
    
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('trade'), 
        Buffer.from('escrow'), 
        tradeIdBuffer
      ],
      this.programIds.trade
    );
  }

  getPriceFeedPDA(fiatCurrency: FiatCurrency): [PublicKey, number] {
    // Convert enum to string representation 
    let currencyStr: string;
    if (typeof fiatCurrency === 'object' && fiatCurrency !== null) {
      // Handle Anchor enum format like { usd: {} }
      const keys = Object.keys(fiatCurrency);
      if (keys.length > 0) {
        currencyStr = keys[0].toUpperCase();
      } else {
        currencyStr = 'USD'; // fallback
      }
    } else if (typeof fiatCurrency === 'string') {
      currencyStr = fiatCurrency.toUpperCase();
    } else {
      currencyStr = 'USD'; // fallback
    }
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from('price'), Buffer.from(currencyStr)],
      this.programIds.price
    );
  }

  getPriceConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('price'), Buffer.from('config')],
      this.programIds.price
    );
  }

  // Cache utility methods
  private getCacheKey(key: string, ...params: any[]): string {
    return `${key}_${params.map(p => p.toString()).join('_')}`;
  }

  private getFromCache<T>(key: string): T | null {
    if (!this.enableCaching) return null;
    
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.cacheTtl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private setCache<T>(key: string, data: T): void {
    if (!this.enableCaching) return;
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private handleError(error: any): never {
    console.error('🔍 Detailed Error Analysis:');
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error?.constructor?.name);
    
    if (error instanceof AnchorError) {
      console.error('📋 Anchor Error Details:');
      console.error('  - Error Code:', error.error?.errorCode);
      console.error('  - Error Message:', error.error?.errorMessage);
      console.error('  - Program Error Code:', error.error?.errorCode?.code);
      console.error('  - Program Error Number:', error.error?.errorCode?.number);
      console.error('  - Origin:', error.error?.origin);
      console.error('  - Compared Values:', error.error?.comparedValues);
      console.error('  - Logs:', error.logs);
      console.error('  - Raw Error:', JSON.stringify(error.error, null, 2));
      throw LocalMoneyError.fromAnchorError(error);
    }
    
    // Handle SendTransactionError (common simulation error)
    if (error?.name === 'SendTransactionError' || error?.message?.includes('Transaction simulation failed')) {
      console.error('📤 Transaction Simulation Error:');
      console.error('  - Message:', error.message);
      console.error('  - Logs:', error.logs || 'No logs available');
      
      // Try to extract more details from the error
      if (error.getLogs) {
        try {
          const logs = error.getLogs();
          console.error('  - Transaction Logs:', logs);
        } catch (logError) {
          console.error('  - Could not get logs:', logError instanceof Error ? logError.message : 'Unknown log error');
        }
      }
    }
    
    // Handle RPC errors
    if (error?.code || error?.data) {
      console.error('🌐 RPC Error Details:');
      console.error('  - Code:', error.code);
      console.error('  - Message:', error.message);
      console.error('  - Data:', error.data);
    }
    
    // General error logging
    console.error('❌ General Error Info:');
    console.error('  - Message:', error?.message);
    console.error('  - Stack:', error?.stack);
    console.error('  - Full Error Object:', JSON.stringify(error, null, 2));
    
    throw new LocalMoneyError(error.message || 'Unknown error occurred');
  }

  // Debug and utility methods
  /**
   * Creates a test token mint for local validator testing
   */
  async createTestTokenMint(): Promise<PublicKey> {
    try {
      const mintKeypair = Keypair.generate();
      const authority = this.provider.wallet.publicKey;
      
      // Get minimum rent for mint account
      const mintRent = await this.connection.getMinimumBalanceForRentExemption(82); // Mint account size
      
      const createMintTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority,
          newAccountPubkey: mintKeypair.publicKey,
          lamports: mintRent,
          space: 82,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          6, // 6 decimals like USDC
          authority,
          authority,
          TOKEN_PROGRAM_ID
        )
      );
      
      const signature = await this.provider.sendAndConfirm(createMintTx, [mintKeypair]);
      console.log('🪙 Test token mint creation signature:', signature);
      
      return mintKeypair.publicKey;
    } catch (error) {
      console.error('❌ Failed to create test token mint:', error);
      throw error;
    }
  }
  /**
   * Debug method to inspect account states before transactions
   */
  private async debugAccountStates(accounts: { [key: string]: PublicKey }): Promise<void> {
    console.log('🔍 Account State Debug Information:');
    
    for (const [name, pubkey] of Object.entries(accounts)) {
      try {
        const accountInfo = await this.connection.getAccountInfo(pubkey);
        console.log(`  📋 ${name} (${pubkey.toString()}):`);
        
        if (accountInfo) {
          console.log(`    - Exists: ✅`);
          console.log(`    - Owner: ${accountInfo.owner.toString()}`);
          console.log(`    - Lamports: ${accountInfo.lamports}`);
          console.log(`    - Data Length: ${accountInfo.data.length} bytes`);
          console.log(`    - Executable: ${accountInfo.executable}`);
          console.log(`    - Rent Epoch: ${accountInfo.rentEpoch}`);
          
          // Try to read discriminator if data exists
          if (accountInfo.data.length >= 8) {
            const discriminator = accountInfo.data.slice(0, 8);
            console.log(`    - Discriminator: [${Array.from(discriminator).join(', ')}]`);
          }
        } else {
          console.log(`    - Exists: ❌ (Account not found)`);
        }
        
        // Check if it's a PDA
        try {
          const [expectedPDA, bump] = PublicKey.findProgramAddressSync([Buffer.from('test')], pubkey);
          console.log(`    - Is PDA: Possibly (cannot determine without seeds)`);
        } catch {
          console.log(`    - Is PDA: No`);
        }
        
      } catch (error) {
        console.log(`    - Error checking account: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      console.log('');
    }
  }

  /**
   * Validate PDA derivation matches expected addresses
   */
  private async validatePDADerivations(userId: PublicKey, offerId: number): Promise<void> {
    console.log('🔍 PDA Derivation Validation:');
    
    // Profile PDA
    const [profilePDA, profileBump] = this.getProfilePDA(userId);
    console.log(`  📋 Profile PDA:`);
    console.log(`    - Derived: ${profilePDA.toString()}`);
    console.log(`    - Bump: ${profileBump}`);
    console.log(`    - Seeds: ['profile', userId]`);
    
    // Offer PDA
    const [offerPDA, offerBump] = this.getOfferPDA(offerId);
    console.log(`  🎯 Offer PDA:`);
    console.log(`    - Derived: ${offerPDA.toString()}`);
    console.log(`    - Bump: ${offerBump}`);
    console.log(`    - Seeds: ['offer', offerId (u64 LE)]`);
    console.log(`    - Offer ID bytes: [${Array.from(Buffer.alloc(8)).map((_, i) => {
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64LE(BigInt(offerId), 0);
      return buf[i];
    }).join(', ')}]`);
    
    // Hub Config PDA
    const [hubConfigPDA, hubBump] = this.getHubConfigPDA();
    console.log(`  🏢 Hub Config PDA:`);
    console.log(`    - Derived: ${hubConfigPDA.toString()}`);
    console.log(`    - Bump: ${hubBump}`);
    console.log(`    - Seeds: ['hub', 'config']`);
    
    // Price Config PDA
    const [priceConfigPDA, priceBump] = this.getPriceConfigPDA();
    console.log(`  💰 Price Config PDA:`);
    console.log(`    - Derived: ${priceConfigPDA.toString()}`);
    console.log(`    - Bump: ${priceBump}`);
    console.log(`    - Seeds: ['price', 'config']`);
    
    // USD Price Feed PDA
    const [usdPriceFeedPDA, usdPriceBump] = this.getPriceFeedPDA({ usd: {} } as any);
    console.log(`  💵 USD Price Feed PDA:`);
    console.log(`    - Derived: ${usdPriceFeedPDA.toString()}`);
    console.log(`    - Bump: ${usdPriceBump}`);
    console.log(`    - Seeds: ['price', 'USD']`);
  }

  // Hub methods
  /**
   * Initializes the price program config
   * @returns Transaction signature
   */
  async initializePriceProgram(): Promise<TransactionSignature> {
    try {
      await this.waitForProgramsInitialized();
      
      if (!this.priceProgram) {
        throw new LocalMoneyError('Price program not initialized');
      }

      const authority = this.provider.wallet.publicKey;
      const [priceConfigPDA] = this.getPriceConfigPDA();

      // Check if price config already exists
      try {
        const existingConfig = await this.connection.getAccountInfo(priceConfigPDA);
        if (existingConfig) {
          console.log('🔍 Price config already exists, checking authority...');
          // Try to fetch the account data to verify authority
          try {
            const configData = await this.priceProgram.account.priceConfig.fetch(priceConfigPDA);
            console.log('💡 Existing price config authority:', configData.authority.toString());
            console.log('💡 Current authority:', authority.toString());
            if (configData.authority.equals(authority)) {
              console.log('✅ Price config exists with correct authority');
              return 'price_config_exists'; // Return sentinel value
            } else {
              throw new Error(`Price config exists but with wrong authority. Expected: ${authority.toString()}, Found: ${configData.authority.toString()}`);
            }
          } catch (fetchError) {
            console.log('⚠️ Could not fetch price config data:', fetchError);
            throw fetchError;
          }
        }
      } catch (accountError) {
        console.log('🔍 Price config does not exist, proceeding with initialization...');
      }

      const tx = await this.priceProgram.methods
        .initialize()
        .accountsPartial({
          priceConfig: priceConfigPDA,
          authority: authority,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Creates/updates a price feed for a specific fiat currency
   * @param fiatCurrency - The fiat currency to create price feed for
   * @param pricePerToken - Price per token in smallest fiat unit (e.g., cents for USD)
   * @param decimals - Token decimals for scaling
   * @returns Transaction signature
   */
  async updatePriceFeed(
    fiatCurrency: FiatCurrency, 
    pricePerToken: number, 
    decimals: number = 6
  ): Promise<TransactionSignature> {
    try {
      await this.waitForProgramsInitialized();
      
      if (!this.priceProgram) {
        throw new LocalMoneyError('Price program not initialized');
      }

      const authority = this.provider.wallet.publicKey;
      const [priceConfigPDA] = this.getPriceConfigPDA();
      const [priceFeedPDA] = this.getPriceFeedPDA(fiatCurrency);

      // Debug parameter types
      console.log('🐛 updatePriceFeed parameters:', {
        fiatCurrency: typeof fiatCurrency,
        pricePerToken: typeof pricePerToken,
        decimals: typeof decimals,
        pricePerTokenValue: pricePerToken,
        decimalsValue: decimals
      });

      const tx = await this.priceProgram.methods
        .updatePrice(fiatCurrency, new BN(pricePerToken), Number(decimals)) // Use BN for u64, regular number for u8
        .accountsPartial({
          priceConfig: priceConfigPDA,
          priceFeed: priceFeedPDA,
          authority: authority,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Initializes the hub config
   * @returns Transaction signature
   */
  async initializeHub(): Promise<TransactionSignature> {
    try {
      await this.waitForProgramsInitialized();
      
      if (!this.hubProgram) {
        throw new LocalMoneyError('Hub program not initialized');
      }

      const authority = this.provider.wallet.publicKey;
      const [hubConfigPDA] = this.getHubConfigPDA();

      // Create initialization parameters matching TypeScript interface (camelCase, simplified structure)
      const initParams = {
        profileProgram: this.programIds.profile,
        offerProgram: this.programIds.offer,
        tradeProgram: this.programIds.trade,
        priceProgram: this.programIds.price,
        treasury: authority, // Use authority as treasury for testing
        feeRate: 250,        // 2.5%
        burnRate: 100,       // 1% 
        warchestRate: 100,   // 1%
      };

      const tx = await this.hubProgram.methods
        .initialize(initParams)
        .accountsPartial({
          hubConfig: hubConfigPDA,
          authority: authority,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  // Profile methods
  /**
   * Creates a new user profile
   * @param username - The username for the profile
   * @returns Transaction signature
   */
  async createProfile(username: string): Promise<TransactionSignature> {
    try {
      await this.waitForProgramsInitialized();
      
      if (!this.profileProgram) {
        throw new LocalMoneyError('Profile program not initialized');
      }

      const user = this.provider.wallet.publicKey;
      
      // Check if profile already exists
      const existingProfile = await this.getProfile(user);
      if (existingProfile) {
        console.log('🔄 Profile already exists, skipping creation');
        return 'profile_already_exists'; // Return a sentinel value
      }

      const [profilePDA] = this.getProfilePDA(user);

      const tx = await this.profileProgram.methods
        .createProfile(username)
        .accountsPartial({
          profile: profilePDA,
          user: user,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Fetches a user profile with caching
   * @param user - The user's public key
   * @returns Profile account data or null if not found
   */
  async getProfile(user: PublicKey): Promise<ProfileAccount | null> {
    try {
      if (!this.profileProgram) {
        throw new LocalMoneyError('Profile program not initialized');
      }

      const cacheKey = this.getCacheKey('profile', user.toString());
      const cached = this.getFromCache<ProfileAccount | null>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const [profilePDA] = this.getProfilePDA(user);
      const profile = await this.profileProgram.account.profile.fetchNullable(profilePDA);
      
      this.setCache(cacheKey, profile);
      return profile;
    } catch (error) {
      this.handleError(error);
    }
  }

  // Offer methods
  /**
   * Creates a new offer
   * @param params - The offer creation parameters
   * @returns Transaction signature
   */
  async createOffer(params: CreateOfferParams): Promise<TransactionSignature> {
    try {
      await this.waitForProgramsInitialized();

      const user = this.provider.wallet.publicKey;
      const [profilePDA] = this.getProfilePDA(user);
      
      // Generate next offer ID (in real implementation, this would come from the hub)
      const offerId = Math.floor(Math.random() * 1000000); // Placeholder
      const [offerPDA, offerBump] = this.getOfferPDA(offerId);
      
      console.log('🔍 Offer PDA Derivation Debug:');
      console.log('  - Offer ID:', offerId);
      console.log('  - Offer PDA:', offerPDA.toString());
      console.log('  - Offer Bump:', offerBump);
      
      // Also validate that our PDA derivation matches what Anchor expects
      const offerIdBuffer = Buffer.alloc(8);
      offerIdBuffer.writeBigUInt64LE(BigInt(offerId), 0);
      console.log('  - Offer ID Buffer:', Array.from(offerIdBuffer));
      console.log('  - Seeds Used: ["offer", offerId_as_u64_le_bytes]');

      // Transform parameters to match IDL structure (snake_case, BN for u64 types)
      // NOTE: Use BN objects for u64 serialization
      const idlParams = {
        offer_id: new BN(offerId), // u64 needs BN for serialization
        offer_type: params.offerType || { buy: {} },
        fiat_currency: params.fiatCurrency || { usd: {} },
        rate: new BN(typeof params.rate === 'number' ? params.rate : 50000), // u64 needs BN
        min_amount: new BN(typeof params.minAmount === 'number' ? params.minAmount : (params.fiatAmount || 100)), // u64 needs BN
        max_amount: new BN(typeof params.maxAmount === 'number' ? params.maxAmount : (params.fiatAmount || 1000)), // u64 needs BN
        description: params.terms || params.description || null,
      };

      // Try to include hub config as a remaining account in case it's needed
      const [hubConfigPDA] = this.getHubConfigPDA();
      
      const tx = await this.offerProgram!.methods
        .createOffer(idlParams)
        .accountsPartial({
          offer: offerPDA,
          userProfile: profilePDA,
          tokenMint: params.tokenMint || new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
          owner: user,
          profileProgram: this.programIds.profile,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts([
          { pubkey: hubConfigPDA, isSigner: false, isWritable: false }
        ])
        .rpc();

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Fetches an offer with caching
   * @param offerId - The offer ID
   * @returns Offer account data or null if not found
   */
  async getOffer(offerId: number): Promise<OfferAccount | null> {
    try {
      const cacheKey = this.getCacheKey('offer', offerId);
      const cached = this.getFromCache<OfferAccount | null>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const [offerPDA] = this.getOfferPDA(offerId);
      const offer = await this.offerProgram!.account.offer.fetchNullable(offerPDA);
      
      this.setCache(cacheKey, offer);
      return offer;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Updates an existing offer
   * @param offerId - The offer ID to update
   * @param params - The update parameters
   * @returns Transaction signature
   */
  async updateOffer(offerId: number, params: any): Promise<TransactionSignature> {
    try {
      const user = this.provider.wallet.publicKey;
      const [offerPDA] = this.getOfferPDA(offerId);
      const [profilePDA] = this.getProfilePDA(user);

      const tx = await this.offerProgram!.methods
        .updateOffer(params)
        .accountsPartial({
          offer: offerPDA,
          userProfile: profilePDA,
          owner: user,
        } as any)
        .rpc();

      // Invalidate cache
      const cacheKey = this.getCacheKey('offer', offerId);
      this.cache.delete(cacheKey);

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  // Trade methods
  /**
   * Creates a new trade
   * @param params - The trade creation parameters
   * @returns Transaction signature
   */
  async createTrade(params: CreateTradeParams): Promise<TransactionSignature> {
    try {
      const user = this.provider.wallet.publicKey;
      const [profilePDA] = this.getProfilePDA(user);
      const [hubConfigPDA] = this.getHubConfigPDA();
      
      // Generate next trade ID (in real implementation, this would come from the hub)
      const tradeId = Math.floor(Math.random() * 1000000); // Placeholder
      const [tradePDA] = this.getTradePDA(tradeId);
      const [offerPDA] = this.getOfferPDA((params as any).offerId || 1);
      
      // Use a common test token mint (USDC or SOL)
      const tokenMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC mint

      const tx = await this.tradeProgram!.methods
        .createTrade(params)
        .accountsPartial({
          trade: tradePDA,
          hubConfig: hubConfigPDA,
          offer: offerPDA,
          buyerProfile: profilePDA,
          tokenMint: tokenMint,
          buyer: user,
          profileProgram: this.programIds.profile,
          priceProgram: this.programIds.price,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Fetches a trade with caching
   * @param tradeId - The trade ID
   * @returns Trade account data or null if not found
   */
  async getTrade(tradeId: number): Promise<TradeAccount | null> {
    try {
      const cacheKey = this.getCacheKey('trade', tradeId);
      const cached = this.getFromCache<TradeAccount | null>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const [tradePDA] = this.getTradePDA(tradeId);
      const trade = await this.tradeProgram!.account.trade.fetchNullable(tradePDA);
      
      this.setCache(cacheKey, trade);
      return trade;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Accepts a trade request as a seller
   * @param tradeId - The trade ID
   * @param sellerContact - Seller's contact information
   * @returns Transaction signature
   */
  async acceptTradeRequest(tradeId: number, sellerContact: string): Promise<TransactionSignature> {
    try {
      const user = this.provider.wallet.publicKey;
      const [tradePDA] = this.getTradePDA(tradeId);
      const [profilePDA] = this.getProfilePDA(user);

      const tx = await this.tradeProgram!.methods
        .acceptRequest(sellerContact)
        .accountsPartial({
          trade: tradePDA,
          seller: user,
        } as any)
        .rpc();

      // Invalidate trade cache
      const cacheKey = this.getCacheKey('trade', tradeId);
      this.cache.delete(cacheKey);

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Funds the escrow account for a trade
   * @param tradeId - The trade ID
   * @returns Transaction signature
   */
  async fundEscrow(tradeId: number): Promise<TransactionSignature> {
    try {
      const user = this.provider.wallet.publicKey;
      const [tradePDA] = this.getTradePDA(tradeId);
      const [escrowPDA] = this.getEscrowPDA(tradeId);
      const [profilePDA] = this.getProfilePDA(user);

      // Get trade to determine mint and amount
      const trade = await this.getTrade(tradeId);
      if (!trade) {
        throw new LocalMoneyError('Trade not found');
      }

      const userATA = await this.getAssociatedTokenAccount(trade.tokenMint, user);
      const escrowATA = await this.getAssociatedTokenAccount(trade.tokenMint, escrowPDA);

      const tx = await this.tradeProgram!.methods
        .fundEscrow()
        .accountsPartial({
          trade: tradePDA,
          seller: user,
          sellerTokenAccount: userATA,
          escrowTokenAccount: escrowATA,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      // Invalidate trade cache
      const cacheKey = this.getCacheKey('trade', tradeId);
      this.cache.delete(cacheKey);

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Marks fiat as deposited in a trade
   * @param tradeId - The trade ID
   * @returns Transaction signature
   */
  async markFiatDeposited(tradeId: number): Promise<TransactionSignature> {
    try {
      const user = this.provider.wallet.publicKey;
      const [tradePDA] = this.getTradePDA(tradeId);
      const [profilePDA] = this.getProfilePDA(user);

      const tx = await this.tradeProgram!.methods
        .markFiatDeposited()
        .accountsPartial({
          trade: tradePDA,
          buyer: user,
        } as any)
        .rpc();

      // Invalidate trade cache
      const cacheKey = this.getCacheKey('trade', tradeId);
      this.cache.delete(cacheKey);

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Releases escrow funds to complete a trade
   * @param tradeId - The trade ID
   * @returns Transaction signature
   */
  async releaseEscrow(tradeId: number): Promise<TransactionSignature> {
    try {
      const user = this.provider.wallet.publicKey;
      const [tradePDA] = this.getTradePDA(tradeId);
      const [escrowPDA] = this.getEscrowPDA(tradeId);
      const [profilePDA] = this.getProfilePDA(user);

      // Get trade to determine buyer and mint
      const trade = await this.getTrade(tradeId);
      if (!trade) {
        throw new LocalMoneyError('Trade not found');
      }

      const buyerATA = await this.getAssociatedTokenAccount(trade.tokenMint, trade.buyer);
      const escrowATA = await this.getAssociatedTokenAccount(trade.tokenMint, escrowPDA);

      const tx = await this.tradeProgram!.methods
        .releaseEscrow()
        .accountsPartial({
          trade: tradePDA,
          seller: user,
          buyerTokenAccount: buyerATA,
          escrowTokenAccount: escrowATA,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      // Invalidate trade cache
      const cacheKey = this.getCacheKey('trade', tradeId);
      this.cache.delete(cacheKey);

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Cancels a trade request
   * @param tradeId - The trade ID
   * @returns Transaction signature
   */
  async cancelTrade(tradeId: number): Promise<TransactionSignature> {
    try {
      const user = this.provider.wallet.publicKey;
      const [tradePDA] = this.getTradePDA(tradeId);
      const [profilePDA] = this.getProfilePDA(user);

      const tx = await this.tradeProgram!.methods
        .cancelRequest()
        .accountsPartial({
          trade: tradePDA,
          user: user,
        } as any)
        .rpc();

      // Invalidate trade cache
      const cacheKey = this.getCacheKey('trade', tradeId);
      this.cache.delete(cacheKey);

      return tx;
    } catch (error) {
      this.handleError(error);
    }
  }

  // Price methods
  /**
   * Gets the current price for a token in the specified fiat currency
   * @param mint - The token mint address
   * @param fiatCurrency - The fiat currency
   * @returns Current price or null if not available
   */
  async getPrice(mint: PublicKey, fiatCurrency: FiatCurrency): Promise<number | null> {
    try {
      const cacheKey = this.getCacheKey('price', mint.toString(), fiatCurrency.toString());
      const cached = this.getFromCache<number | null>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const [priceFeedPDA] = this.getPriceFeedPDA(fiatCurrency);
      const priceFeed = await this.priceProgram!.account.priceFeed.fetchNullable(priceFeedPDA);
      
      if (!priceFeed) {
        return null;
      }

      // Extract price for the specific mint (implementation would depend on price feed structure)
      const price = priceFeed.pricePerToken ? Number(priceFeed.pricePerToken) : 0;
      
      this.setCache(cacheKey, price);
      return price;
    } catch (error) {
      this.handleError(error);
    }
  }

  // Utility methods
  /**
   * Gets the associated token account address for a mint and owner
   * @param mint - The token mint
   * @param owner - The owner's public key
   * @returns Associated token account address
   */
  async getAssociatedTokenAccount(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    return getAssociatedTokenAddress(mint, owner);
  }

  /**
   * Estimates transaction cost for a given transaction
   * @param transaction - The transaction to estimate
   * @returns Estimated cost in lamports
   */
  async estimateTransactionCost(transaction: Transaction): Promise<number> {
    try {
      const feeCalculator = await this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      );
      return feeCalculator?.value || 5000; // Default fallback
    } catch (error) {
      // Return a reasonable default if estimation fails
      return 5000;
    }
  }

  /**
   * Executes multiple transactions in batch with proper error handling
   * @param transactions - Array of transactions to execute
   * @returns Batch transaction result with signatures and errors
   */
  async executeBatchTransactions(transactions: Transaction[]): Promise<BatchTransactionResult> {
    const signatures: TransactionSignature[] = [];
    const errors: (Error | null)[] = [];
    let success = true;

    for (const [index, transaction] of transactions.entries()) {
      try {
        const signature = await this.provider.sendAndConfirm(transaction);
        signatures.push(signature);
        errors.push(null);
      } catch (error) {
        signatures.push('');
        errors.push(error as Error);
        success = false;
      }
    }

    return {
      signatures,
      errors,
      success
    };
  }

  /**
   * Creates a test offer for E2E testing
   * @param tokenMint - The token mint for the offer
   * @returns Offer ID and signature
   */
  async createTestOffer(tokenMint: PublicKey): Promise<{ offerId: number; signature: TransactionSignature }> {
    try {
      const user = this.provider.wallet.publicKey;
      const [profilePDA] = this.getProfilePDA(user);
      
      const offerId = Math.floor(Math.random() * 1000000);
      const [offerPDA] = this.getOfferPDA(offerId);

      // Create a basic test offer - IMPORTANT: Use snake_case and regular numbers for u64 fields
      const createOfferParams = {
        offer_id: offerId,
        offer_type: { buy: {} },
        fiat_currency: { usd: {} },
        rate: 50000,
        min_amount: 100,
        max_amount: 1000,
        description: 'Test offer for E2E flow'
      };

      // Check if profile exists first
      console.log('🔍 Checking profile exists for user:', user.toString());
      const profile = await this.profileProgram!.account.profile.fetchNullable(profilePDA);
      console.log('👤 Profile status:', profile ? 'Found' : 'Not found');
      
      if (!profile) {
        throw new LocalMoneyError('Profile not found for user. Create profile first.');
      }

      // Try to include hub config as a remaining account in case it's needed
      const [hubConfigPDA] = this.getHubConfigPDA();
      
      console.log('📋 Offer creation accounts:');
      console.log('  - Offer PDA:', offerPDA.toString());
      console.log('  - User Profile PDA:', profilePDA.toString());
      console.log('  - Token Mint:', tokenMint.toString());
      console.log('  - Owner:', user.toString());
      console.log('  - Profile Program:', this.programIds.profile.toString());
      
      console.log('🎯 Attempting to create offer with ID:', offerId);
      
      // Add comprehensive debugging before simulation
      await this.validatePDADerivations(user, offerId);
      
      const debugAccounts = {
        'Offer PDA': offerPDA,
        'User Profile PDA': profilePDA,
        'Token Mint': tokenMint,
        'Owner': user,
        'Profile Program': this.programIds.profile,
        'Hub Config PDA': hubConfigPDA,
        'System Program': SystemProgram.programId,
        'Token Program': TOKEN_PROGRAM_ID
      };
      
      await this.debugAccountStates(debugAccounts);
      
      // Verify CreateOfferParams structure
      console.log('📋 CreateOfferParams validation:');
      console.log('  - offer_id type:', typeof createOfferParams.offer_id, createOfferParams.offer_id);
      console.log('  - offer_type:', JSON.stringify(createOfferParams.offer_type));
      console.log('  - fiat_currency:', JSON.stringify(createOfferParams.fiat_currency));
      console.log('  - rate type:', typeof createOfferParams.rate, createOfferParams.rate);
      console.log('  - min_amount type:', typeof createOfferParams.min_amount, createOfferParams.min_amount);
      console.log('  - max_amount type:', typeof createOfferParams.max_amount, createOfferParams.max_amount);
      console.log('  - description:', createOfferParams.description);
      
      // First simulate to get better error details
      console.log('🔬 Starting transaction simulation...');
      try {
        const simulation = await this.offerProgram!.methods
          .createOffer(createOfferParams)
          .accountsPartial({
            offer: offerPDA,
            userProfile: profilePDA,
            tokenMint: tokenMint,
            owner: user,
            profileProgram: this.programIds.profile,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .remainingAccounts([
            { pubkey: hubConfigPDA, isSigner: false, isWritable: false }
          ])
          .simulate();
        console.log('✅ Simulation successful');
        console.log('📊 Simulation result:', simulation);
      } catch (simError) {
        console.error('❌ Simulation failed - analyzing error...');
        
        // Enhanced simulation error analysis
        if (simError && typeof simError === 'object') {
          console.error('🔍 Simulation Error Deep Analysis:');
          console.error('  - Error Type:', simError.constructor?.name);
          console.error('  - Has message:', 'message' in simError);
          console.error('  - Has logs:', 'logs' in simError);
          console.error('  - Has code:', 'code' in simError);
          
          // Check for specific error properties
          if ('simulationResponse' in simError) {
            console.error('  - Simulation Response:', JSON.stringify(simError.simulationResponse, null, 2));
          }
          
          if ('transactionMessage' in simError) {
            console.error('  - Transaction Message:', simError.transactionMessage);
          }
          
          // Try to extract program logs
          if ('logs' in simError && Array.isArray(simError.logs)) {
            console.error('🪵 Program Logs:');
            simError.logs.forEach((log, index) => {
              console.error(`  ${index}: ${log}`);
            });
          }
          
          // Check for Anchor-specific error details
          if ('error' in simError) {
            console.error('🔗 Anchor Error Details:', JSON.stringify(simError.error, null, 2));
          }
          
          // Log the complete error object structure
          console.error('📋 Complete Error Object Keys:', Object.keys(simError));
          console.error('📋 Complete Error Object:', JSON.stringify(simError, null, 2));
        }
        
        // Don't re-throw here, let the handleError method handle it with better logging
        this.handleError(simError);
      }
      
      const tx = await this.offerProgram!.methods
        .createOffer(createOfferParams)
        .accountsPartial({
          offer: offerPDA,
          userProfile: profilePDA,
          tokenMint: tokenMint,
          owner: user,
          profileProgram: this.programIds.profile,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts([
          { pubkey: hubConfigPDA, isSigner: false, isWritable: false }
        ])
        .rpc();

      return { offerId, signature: tx };
    } catch (error) {
      console.error('❌ Offer creation failed with error:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      // Log error details in more depth
      console.error('Full error object:', JSON.stringify(error, null, 2));
      this.handleError(error);
    }
  }

  /**
   * Executes the complete end-to-end trading flow
   * @param params - Trading flow parameters
   * @returns Trade ID and transaction signatures
   */
  async executeTradingFlow(params: {
    offerId?: number;
    amount: number;
    buyerContact: string;
    sellerContact: string;
  }): Promise<{
    tradeId: number;
    offerId: number;
    signatures: TransactionSignature[];
  }> {
    try {
      const signatures: TransactionSignature[] = [];
      
      // Create a test token mint for local testing instead of using USDC
      console.log('🪙 Creating test token mint for local validator...');
      const testTokenMint = await this.createTestTokenMint();
      console.log('✅ Test token mint created:', testTokenMint.toString());
      
      const tokenMint = testTokenMint;
      
      // 0. Initialize hub if needed
      try {
        console.log('🏢 Initializing hub...');
        const hubInitSig = await this.initializeHub();
        signatures.push(hubInitSig);
        console.log('✅ Hub initialized successfully');
        
        // Wait for hub initialization to confirm
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify hub config exists
        const [hubConfigPDA] = this.getHubConfigPDA();
        const hubConfig = await this.hubProgram!.account.hubConfig.fetchNullable(hubConfigPDA);
        console.log('🔍 Hub config verification:', hubConfig ? 'Found' : 'Not found');
        
      } catch (error) {
        // Hub might already be initialized, check if that's the error
        if (error instanceof Error && (error.message.includes('already in use') || error.message.includes('already initialized'))) {
          console.log('ℹ️ Hub already initialized, continuing...');
        } else {
          console.warn('⚠️ Hub initialization failed:', error);
          throw error;
        } 
      }

      // 0.1. Initialize price program if needed
      try {
        console.log('💰 Initializing price program...');
        const priceInitSig = await this.initializePriceProgram();
        signatures.push(priceInitSig);
        console.log('✅ Price program initialized successfully');
      } catch (error) {
        // Price might already be initialized
        if (error instanceof Error && (error.message.includes('already in use') || error.message.includes('already initialized'))) {
          console.log('ℹ️ Price program already initialized, continuing...');
        } else {
          console.warn('⚠️ Price program initialization failed:', error);
          throw error;
        } 
      }

      // 0.2. Initialize USD price feed
      try {
        console.log('💵 Creating USD price feed...');
        const usdPriceFeedSig = await this.updatePriceFeed({ usd: {} } as any, Number(100000), Number(6)); // $1.00 = 100000 cents
        signatures.push(usdPriceFeedSig);
        console.log('✅ USD price feed created successfully');
      } catch (error) {
        // Price feed might already exist
        if (error instanceof Error && (error.message.includes('already in use') || error.message.includes('already initialized'))) {
          console.log('ℹ️ USD price feed already exists, continuing...');
        } else {
          console.warn('⚠️ USD price feed creation failed:', error);
          throw error;
        } 
      }
      
      // 1. Create test offer if not provided
      let offerId = params.offerId;
      if (!offerId) {
        console.log('🎯 Creating test offer...');
        const offerResult = await this.createTestOffer(tokenMint);
        offerId = offerResult.offerId;
        signatures.push(offerResult.signature);
        console.log('✅ Test offer created with ID:', offerId);
      }
      
      // 2. Create trade request
      console.log('🤝 Creating trade request...');
      const tradeId = Math.floor(Math.random() * 1000000);
      const createTradeParams: CreateTradeParams = {
        trade_id: tradeId,
        offer_id: offerId,
        amount: params.amount,
        locked_price: 50000, // Same as offer rate for simplicity
        expiry_duration: 86400, // 24 hours in seconds
        arbitrator: PublicKey.default, // No arbitrator for now
        buyer_contact: params.buyerContact,
      } as any;

      const createTradeSig = await this.createTrade(createTradeParams);
      signatures.push(createTradeSig);
      console.log('✅ Trade request created with ID:', tradeId);

      // 3. Accept trade request (usually done by seller)
      const acceptSig = await this.acceptTradeRequest(tradeId, params.sellerContact);
      signatures.push(acceptSig);

      // 4. Fund escrow (done by seller)
      const fundSig = await this.fundEscrow(tradeId);
      signatures.push(fundSig);

      // 5. Mark fiat deposited (done by buyer)
      const markFiatSig = await this.markFiatDeposited(tradeId);
      signatures.push(markFiatSig);

      // 6. Release escrow (done by seller or after verification)
      const releaseSig = await this.releaseEscrow(tradeId);
      signatures.push(releaseSig);

      return {
        tradeId,
        offerId,
        signatures
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Clears the SDK cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics
   * @returns Cache statistics
   */
  getCacheStats(): { size: number; ttl: number; enabled: boolean } {
    return {
      size: this.cache.size,
      ttl: this.cacheTtl,
      enabled: this.enableCaching
    };
  }
}

// Export types and utilities
export * from './types/hub';
export * from './types/profile';
export * from './types/price';
export * from './types/offer';
export * from './types/trade';

// Default export
export default LocalMoneySDK;