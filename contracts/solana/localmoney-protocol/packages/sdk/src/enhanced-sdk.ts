import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import {
  EnhancedErrorHandler,
  ErrorContext,
  RetryConfig,
  CircuitBreakerConfig,
  Logger,
  ConsoleLogger,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  LocalMoneyError,
  ErrorCategory,
  ErrorSeverity,
  RecoveryStrategy
} from './error-handling';
import { LocalMoneySDK } from './sdk';
import { HubSDK } from './programs/hub';
import { ProfileSDK } from './programs/profile';
import { PriceSDK } from './programs/price';
import { OfferSDK } from './programs/offer';
import { TradeSDK } from './programs/trade';
import { ArbitrationSDK } from './programs/arbitration';
import { AccountFetcher } from './account-fetcher';
import { LocalMoneyWallet } from './wallet';
import { ProgramAddresses, TransactionResult } from './types';

/**
 * Enhanced SDK configuration options
 */
export interface EnhancedSDKConfig {
  retryConfig?: RetryConfig;
  circuitBreakerConfig?: CircuitBreakerConfig;
  logger?: Logger;
  enableErrorHandling?: boolean;
  cacheEnabled?: boolean;
  cacheTtl?: number;
  environment?: 'development' | 'staging' | 'production';
}

/**
 * Enhanced LocalMoney SDK with comprehensive error handling and recovery
 */
export class EnhancedLocalMoneySDK {
  private baseSdk: LocalMoneySDK;
  private errorHandler: EnhancedErrorHandler;
  private logger: Logger;
  private config: EnhancedSDKConfig;

  // Enhanced program SDKs
  public readonly hub: EnhancedHubSDK;
  public readonly profile: EnhancedProfileSDK;
  public readonly price: EnhancedPriceSDK;
  public readonly offer: EnhancedOfferSDK;
  public readonly trade: EnhancedTradeSDK;
  public readonly arbitration: EnhancedArbitrationSDK;
  public readonly accountFetcher: EnhancedAccountFetcher;

  constructor(
    connection: Connection,
    wallet: Wallet | LocalMoneyWallet,
    programAddresses: ProgramAddresses,
    config: EnhancedSDKConfig = {}
  ) {
    this.config = {
      enableErrorHandling: true,
      cacheEnabled: true,
      cacheTtl: 300000, // 5 minutes
      environment: 'development',
      ...config
    };

    this.logger = config.logger || new ConsoleLogger(this.config.environment === 'development');

    // Select retry configuration based on environment
    const retryConfig = config.retryConfig || this.getDefaultRetryConfig();
    const circuitBreakerConfig = config.circuitBreakerConfig || DEFAULT_CIRCUIT_BREAKER_CONFIG;

    this.errorHandler = new EnhancedErrorHandler(retryConfig, circuitBreakerConfig, this.logger);

    // Initialize base SDK
    this.baseSdk = new LocalMoneySDK(connection, wallet, programAddresses);

    // Initialize enhanced program SDKs
    this.hub = new EnhancedHubSDK(this.baseSdk.hub, this.errorHandler, this.logger);
    this.profile = new EnhancedProfileSDK(this.baseSdk.profile, this.errorHandler, this.logger);
    this.price = new EnhancedPriceSDK(this.baseSdk.price, this.errorHandler, this.logger);
    this.offer = new EnhancedOfferSDK(this.baseSdk.offer, this.errorHandler, this.logger);
    this.trade = new EnhancedTradeSDK(this.baseSdk.trade, this.errorHandler, this.logger);
    this.arbitration = new EnhancedArbitrationSDK(this.baseSdk.arbitration, this.errorHandler, this.logger);
    this.accountFetcher = new EnhancedAccountFetcher(this.baseSdk.accountFetcher, this.errorHandler, this.logger);
  }

  /**
   * Get connection
   */
  get connection(): Connection {
    return this.baseSdk.connection;
  }

  /**
   * Get provider
   */
  get provider(): AnchorProvider {
    return this.baseSdk.provider;
  }

  /**
   * Get program addresses
   */
  get programAddresses(): ProgramAddresses {
    return this.baseSdk.programAddresses;
  }

  /**
   * Get base SDK instance
   */
  get baseSDK(): LocalMoneySDK {
    return this.baseSdk;
  }

  /**
   * Get error handling statistics
   */
  getErrorStats(): Record<string, any> {
    return this.errorHandler.getStats();
  }

  /**
   * Reset error handling state
   */
  resetErrorHandling(): void {
    this.errorHandler.reset();
  }

  /**
   * Execute operation with enhanced error handling
   */
  async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    fallbackOperation?: () => Promise<T>
  ): Promise<T> {
    if (!this.config.enableErrorHandling) {
      return await operation();
    }

    return await this.errorHandler.execute(operation, context, fallbackOperation);
  }

  /**
   * Create enhanced SDK instance
   */
  static create(
    connection: Connection,
    wallet: Wallet | LocalMoneyWallet,
    programAddresses: ProgramAddresses,
    config?: EnhancedSDKConfig
  ): EnhancedLocalMoneySDK {
    return new EnhancedLocalMoneySDK(connection, wallet, programAddresses, config);
  }

  /**
   * Create local development instance
   */
  static createLocal(
    wallet: Wallet | LocalMoneyWallet,
    config?: EnhancedSDKConfig
  ): EnhancedLocalMoneySDK {
    const connection = new Connection('http://localhost:8899', 'confirmed');
    const programAddresses: ProgramAddresses = {
      hub: new PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
      profile: new PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
      price: new PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
      offer: new PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
      trade: new PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
      arbitration: new PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
    };

    return new EnhancedLocalMoneySDK(connection, wallet, programAddresses, {
      environment: 'development',
      ...config
    });
  }

  private getDefaultRetryConfig(): RetryConfig {
    switch (this.config.environment) {
      case 'production':
        return DEFAULT_RETRY_CONFIGS.conservative;
      case 'staging':
        return DEFAULT_RETRY_CONFIGS.aggressive;
      default:
        return DEFAULT_RETRY_CONFIGS.minimal;
    }
  }
}

/**
 * Base class for enhanced program SDKs
 */
abstract class EnhancedProgramSDK<T> {
  constructor(
    protected baseSDK: T,
    protected errorHandler: EnhancedErrorHandler,
    protected logger: Logger
  ) {}

  /**
   * Execute operation with error handling
   */
  protected async executeWithErrorHandling<R>(
    operation: () => Promise<R>,
    context: ErrorContext,
    fallbackOperation?: () => Promise<R>
  ): Promise<R> {
    return await this.errorHandler.execute(operation, context, fallbackOperation);
  }

  /**
   * Create error context for operations
   */
  protected createContext(operation: string, metadata?: Record<string, any>): ErrorContext {
    return {
      operation,
      metadata,
    };
  }
}

/**
 * Enhanced Hub SDK with error handling
 */
export class EnhancedHubSDK extends EnhancedProgramSDK<HubSDK> {
  async getGlobalConfig(): Promise<any> {
    const context = this.createContext('hub.getGlobalConfig');
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getGlobalConfig(),
      context,
      // Fallback: return cached config or minimal config
      async () => {
        this.logger.warn('Using fallback for global config');
        return null;
      }
    );
  }

  async initialize(params: any): Promise<TransactionResult> {
    const context = this.createContext('hub.initialize', { params });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.initialize(params),
      context
    );
  }

  async updateConfig(params: any): Promise<TransactionResult> {
    const context = this.createContext('hub.updateConfig', { params });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.updateConfig(params),
      context
    );
  }

  async updateAuthority(newAuthority: PublicKey): Promise<TransactionResult> {
    const context = this.createContext('hub.updateAuthority', { newAuthority: newAuthority.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.updateAuthority(newAuthority),
      context
    );
  }

  async validateUserActivityLimits(user: PublicKey, offersCount: number, tradesCount: number): Promise<any> {
    const context = this.createContext('hub.validateUserActivityLimits', { user: user.toString(), offersCount, tradesCount });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.validateUserActivityLimits(user, offersCount, tradesCount),
      context,
      // Fallback: return permissive validation
      async () => {
        this.logger.warn('Using fallback validation - allowing operation');
        return { valid: true };
      }
    );
  }

  async validateTradeAmount(amount: BN): Promise<any> {
    const context = this.createContext('hub.validateTradeAmount', { amount: amount.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.validateTradeAmount(amount),
      context,
      // Fallback: basic validation
      async () => {
        this.logger.warn('Using fallback trade amount validation');
        return { valid: amount.gt(new BN(0)) };
      }
    );
  }

  async getFeeConfiguration(): Promise<any> {
    const context = this.createContext('hub.getFeeConfiguration');
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getFeeConfiguration(),
      context,
      // Fallback: default fee configuration
      async () => {
        this.logger.warn('Using default fee configuration');
        return {
          chainFeeBps: 50,
          burnFeeBps: 0,
          warchestFeeBps: 0,
          arbitrationFeeBps: 200,
          totalFeeBps: 250,
        };
      }
    );
  }

  async calculateFees(amount: BN): Promise<any> {
    const context = this.createContext('hub.calculateFees', { amount: amount.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.calculateFees(amount),
      context,
      // Fallback: basic fee calculation
      async () => {
        this.logger.warn('Using fallback fee calculation');
        const chainFee = amount.mul(new BN(50)).div(new BN(10000)); // 0.5%
        const arbitrationFee = amount.mul(new BN(200)).div(new BN(10000)); // 2%
        const totalFees = chainFee.add(arbitrationFee);
        return {
          chainFee,
          burnFee: new BN(0),
          warchestFee: new BN(0),
          arbitrationFee,
          totalFees,
          netAmount: amount.sub(totalFees),
        };
      }
    );
  }
}

/**
 * Enhanced Profile SDK with error handling
 */
export class EnhancedProfileSDK extends EnhancedProgramSDK<ProfileSDK> {
  async createProfile(owner?: PublicKey, encryptedContactInfo?: string): Promise<TransactionResult> {
    const context = this.createContext('profile.createProfile', { owner: owner?.toString(), hasContactInfo: !!encryptedContactInfo });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.createProfile(owner, encryptedContactInfo),
      context
    );
  }

  async updateContact(owner?: PublicKey, encryptedContactInfo?: string): Promise<TransactionResult> {
    const context = this.createContext('profile.updateContact', { owner: owner?.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.updateContact(owner, encryptedContactInfo || ''),
      context
    );
  }

  async getProfile(owner: PublicKey): Promise<any> {
    const context = this.createContext('profile.getProfile', { owner: owner.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getProfile(owner),
      context,
      // Fallback: return minimal profile
      async () => {
        this.logger.warn('Using fallback profile data');
        return null;
      }
    );
  }

  async profileExists(owner: PublicKey): Promise<boolean> {
    const context = this.createContext('profile.profileExists', { owner: owner.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.profileExists(owner),
      context,
      // Fallback: assume profile doesn't exist
      async () => {
        this.logger.warn('Assuming profile does not exist (fallback)');
        return false;
      }
    );
  }

  async getMultipleProfiles(owners: PublicKey[]): Promise<any[]> {
    const context = this.createContext('profile.getMultipleProfiles', { count: owners.length });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getMultipleProfiles(owners),
      context,
      // Fallback: return null for all profiles
      async () => {
        this.logger.warn('Using fallback for multiple profiles');
        return owners.map(() => null);
      }
    );
  }

  async getProfileStats(owner: PublicKey): Promise<any> {
    const context = this.createContext('profile.getProfileStats', { owner: owner.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getProfileStats(owner),
      context,
      // Fallback: return default stats
      async () => {
        this.logger.warn('Using default profile stats');
        return {
          totalTrades: 0,
          successfulTrades: 0,
          successRate: 0,
          reputationScore: 0,
          totalVolume: '0',
          activeOffersCount: 0,
          activeTradesCount: 0,
          lastActivity: null,
        };
      }
    );
  }

  async canCreateOffer(owner: PublicKey, activeOffersLimit: number): Promise<any> {
    const context = this.createContext('profile.canCreateOffer', { owner: owner.toString(), limit: activeOffersLimit });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.canCreateOffer(owner, activeOffersLimit),
      context,
      // Fallback: allow creation
      async () => {
        this.logger.warn('Allowing offer creation (fallback)');
        return { canCreate: true };
      }
    );
  }

  async canCreateTrade(owner: PublicKey, activeTradesLimit: number): Promise<any> {
    const context = this.createContext('profile.canCreateTrade', { owner: owner.toString(), limit: activeTradesLimit });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.canCreateTrade(owner, activeTradesLimit),
      context,
      // Fallback: allow creation
      async () => {
        this.logger.warn('Allowing trade creation (fallback)');
        return { canCreate: true };
      }
    );
  }
}

/**
 * Enhanced Price SDK with error handling
 */
export class EnhancedPriceSDK extends EnhancedProgramSDK<PriceSDK> {
  async updatePrice(params: any): Promise<TransactionResult> {
    const context = this.createContext('price.updatePrice', { currency: params.currency });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.updatePrice(params),
      context
    );
  }

  async getPrice(currency: string): Promise<any> {
    const context = this.createContext('price.getPrice', { currency });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getPrice(currency as any),
      context,
      // Fallback: return stale price or default
      async () => {
        this.logger.warn(`Using fallback price for ${currency}`);
        return null;
      }
    );
  }

  async getMultiplePrices(currencies: string[]): Promise<Map<string, any>> {
    const context = this.createContext('price.getMultiplePrices', { currencies });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getMultiplePrices(currencies as any),
      context,
      // Fallback: return empty map
      async () => {
        this.logger.warn('Using fallback for multiple prices');
        return new Map();
      }
    );
  }

  async isPriceFresh(currency: string, maxStalenessSeconds?: number): Promise<boolean> {
    const context = this.createContext('price.isPriceFresh', { currency, maxStalenessSeconds });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.isPriceFresh(currency as any, maxStalenessSeconds),
      context,
      // Fallback: assume price is stale
      async () => {
        this.logger.warn('Assuming price is stale (fallback)');
        return false;
      }
    );
  }

  async convertToUSD(amount: BN, fromCurrency: string): Promise<any> {
    const context = this.createContext('price.convertToUSD', { amount: amount.toString(), fromCurrency });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.convertToUSD(amount, fromCurrency as any),
      context,
      // Fallback: return 1:1 conversion if USD, null otherwise
      async () => {
        this.logger.warn('Using fallback USD conversion');
        if (fromCurrency.toUpperCase() === 'USD') {
          return { usdAmount: amount, exchangeRate: new BN(100000000) };
        }
        return null;
      }
    );
  }

  async convertFromUSD(usdAmount: BN, toCurrency: string): Promise<any> {
    const context = this.createContext('price.convertFromUSD', { usdAmount: usdAmount.toString(), toCurrency });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.convertFromUSD(usdAmount, toCurrency as any),
      context,
      // Fallback: return 1:1 conversion if USD, null otherwise
      async () => {
        this.logger.warn('Using fallback from USD conversion');
        if (toCurrency.toUpperCase() === 'USD') {
          return { amount: usdAmount, exchangeRate: new BN(100000000) };
        }
        return null;
      }
    );
  }
}

/**
 * Enhanced Offer SDK with error handling
 */
export class EnhancedOfferSDK extends EnhancedProgramSDK<OfferSDK> {
  async createOffer(params: any): Promise<TransactionResult> {
    const context = this.createContext('offer.createOffer', { 
      offerType: params.offerType,
      currency: params.fiatCurrency,
      amount: params.maxAmount?.toString()
    });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.createOffer(params),
      context
    );
  }

  async updateOffer(offerId: BN, params: any, maker?: PublicKey): Promise<TransactionResult> {
    const context = this.createContext('offer.updateOffer', { 
      offerId: offerId.toString(),
      maker: maker?.toString()
    });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.updateOffer(offerId, params, maker),
      context
    );
  }

  async getOffer(offerId: BN): Promise<any> {
    const context = this.createContext('offer.getOffer', { offerId: offerId.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getOffer(offerId),
      context
    );
  }

  async searchOffers(filters?: any): Promise<any> {
    const context = this.createContext('offer.searchOffers', { filters });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.searchOffers(filters),
      context,
      // Fallback: return empty results
      async () => {
        this.logger.warn('Using fallback for offer search');
        return { offers: [], total: 0 };
      }
    );
  }
}

/**
 * Enhanced Trade SDK with error handling
 */
export class EnhancedTradeSDK extends EnhancedProgramSDK<TradeSDK> {
  async createTrade(params: any): Promise<TransactionResult> {
    const context = this.createContext('trade.createTrade', { 
      offerId: params.offerId?.toString(),
      amount: params.amount?.toString()
    });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.createTrade(params),
      context
    );
  }

  async acceptTrade(tradeId: BN, maker?: PublicKey): Promise<TransactionResult> {
    const context = this.createContext('trade.acceptTrade', { 
      tradeId: tradeId.toString(),
      maker: maker?.toString()
    });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.acceptTrade(tradeId, maker),
      context
    );
  }

  async getTrade(tradeId: BN): Promise<any> {
    const context = this.createContext('trade.getTrade', { tradeId: tradeId.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getTrade(tradeId),
      context
    );
  }

  async searchTrades(filters?: any): Promise<any> {
    const context = this.createContext('trade.searchTrades', { filters });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.searchTrades(filters),
      context,
      // Fallback: return empty results
      async () => {
        this.logger.warn('Using fallback for trade search');
        return { trades: [], total: 0 };
      }
    );
  }
}

/**
 * Enhanced Arbitration SDK with error handling
 */
export class EnhancedArbitrationSDK extends EnhancedProgramSDK<ArbitrationSDK> {
  async registerArbitrator(params: any): Promise<TransactionResult> {
    const context = this.createContext('arbitration.registerArbitrator', { 
      feePercentage: params.feePercentage,
      languages: params.languages?.length
    });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.registerArbitrator(params),
      context
    );
  }

  async getArbitrator(authority: PublicKey): Promise<any> {
    const context = this.createContext('arbitration.getArbitrator', { authority: authority.toString() });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getArbitrator(authority),
      context
    );
  }

  async getAllArbitrators(filters?: any): Promise<any[]> {
    const context = this.createContext('arbitration.getAllArbitrators', { filters });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.getAllArbitrators(filters),
      context,
      // Fallback: return empty array
      async () => {
        this.logger.warn('Using fallback for arbitrators list');
        return [];
      }
    );
  }
}

/**
 * Enhanced Account Fetcher with error handling
 */
export class EnhancedAccountFetcher extends EnhancedProgramSDK<AccountFetcher> {
  async fetchGlobalConfig(options?: any): Promise<any> {
    const context = this.createContext('accountFetcher.fetchGlobalConfig', { options });
    
    return await this.executeWithErrorHandling(
      async () => {
        const result = await this.baseSDK.fetchGlobalConfig(options);
        if (!result.success) {
          throw new LocalMoneyError(
            result.error || 'Failed to fetch global config',
            ErrorCategory.ACCOUNT,
            ErrorSeverity.HIGH
          );
        }
        return result.data;
      },
      context
    );
  }

  async fetchProfile(owner: PublicKey, options?: any): Promise<any> {
    const context = this.createContext('accountFetcher.fetchProfile', { owner: owner.toString(), options });
    
    return await this.executeWithErrorHandling(
      async () => {
        const result = await this.baseSDK.fetchProfile(owner, options);
        if (!result.success) {
          throw new LocalMoneyError(
            result.error || 'Failed to fetch profile',
            ErrorCategory.ACCOUNT,
            ErrorSeverity.MEDIUM
          );
        }
        return result.data;
      },
      context
    );
  }

  async searchProfiles(filters?: any, pagination?: any, options?: any): Promise<any> {
    const context = this.createContext('accountFetcher.searchProfiles', { filters, pagination, options });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.searchProfiles(filters, pagination, options),
      context,
      // Fallback: return empty results
      async () => {
        this.logger.warn('Using fallback for profile search');
        return { profiles: [], total: 0 };
      }
    );
  }

  async fetchMultipleProfiles(owners: PublicKey[], options?: any): Promise<Map<string, any>> {
    const context = this.createContext('accountFetcher.fetchMultipleProfiles', { count: owners.length, options });
    
    return await this.executeWithErrorHandling(
      () => this.baseSDK.fetchMultipleProfiles(owners, options),
      context,
      // Fallback: return empty map
      async () => {
        this.logger.warn('Using fallback for multiple profiles fetch');
        return new Map();
      }
    );
  }
}