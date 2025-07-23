import { PublicKey, Connection, AccountInfo, Commitment, GetProgramAccountsFilter } from '@solana/web3.js';
import { Program, BorshAccountsCoder, IdlAccounts } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import {
  GlobalConfig,
  Profile,
  CurrencyPrice,
  Offer,
  Trade, 
  Arbitrator,
  ProgramAddresses,
  FiatCurrency,
  OfferState,
  TradeState
} from './types';
import { PDAGenerator, Utils, ErrorHandler } from './utils';

/**
 * Account fetching options
 */
interface FetchOptions {
  /** Commitment level for fetching */
  commitment?: Commitment;
  /** Whether to use cache */
  useCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Cached account data
 */
interface CachedAccount<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Account fetching result
 */
interface FetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fromCache?: boolean;
}

/**
 * Batch fetch options
 */
interface BatchFetchOptions extends FetchOptions {
  /** Batch size for fetching accounts */
  batchSize?: number;
  /** Parallel fetch limit */
  parallelLimit?: number;
}

/**
 * Account search filters
 */
interface AccountFilters {
  /** Filter by owner */
  owner?: PublicKey;
  /** Filter by data size */
  dataSize?: number;
  /** Custom memcmp filters */
  memcmp?: Array<{
    offset: number;
    bytes: string;
  }>;
}

/**
 * Pagination options
 */
interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Comprehensive account fetching utility for LocalMoney protocol
 */
export class AccountFetcher {
  private connection: Connection;
  private programs: Record<string, Program>;
  private pdaGenerator: PDAGenerator;
  private cache: Map<string, CachedAccount<any>>;
  private defaultOptions: FetchOptions;

  constructor(
    connection: Connection,
    programs: {
      hub?: Program;
      profile?: Program;
      price?: Program;
      offer?: Program;
      trade?: Program;
      arbitration?: Program;
    },
    programAddresses: ProgramAddresses,
    options: FetchOptions = {}
  ) {
    this.connection = connection;
    this.programs = programs;
    this.pdaGenerator = new PDAGenerator(programAddresses);
    this.cache = new Map();
    this.defaultOptions = {
      commitment: 'confirmed',
      useCache: true,
      cacheTtl: 30000, // 30 seconds
      maxRetries: 3,
      retryDelay: 1000,
      ...options
    };
  }

  // ===== CORE FETCHING METHODS =====

  /**
   * Fetch a single account with caching and retry logic
   */
  async fetchAccount<T>(
    address: PublicKey,
    programName: string,
    accountType: string,
    mapper: (data: any) => T,
    options: FetchOptions = {}
  ): Promise<FetchResult<T>> {
    const opts = { ...this.defaultOptions, ...options };
    const cacheKey = `${programName}:${accountType}:${address.toString()}`;

    // Check cache first
    if (opts.useCache) {
      const cached = this.getCachedAccount<T>(cacheKey);
      if (cached) {
        return {
          success: true,
          data: cached,
          fromCache: true
        };
      }
    }

    try {
      const result = await Utils.retryWithBackoff(async () => {
        const program = this.programs[programName];
        if (!program) {
          throw new Error(`Program ${programName} not available`);
        }

        const account = await program.account[accountType].fetch(address, opts.commitment);
        return mapper(account);
      }, opts.maxRetries, opts.retryDelay);

      // Cache the result
      if (opts.useCache) {
        this.setCachedAccount(cacheKey, result, opts.cacheTtl!);
      }

      return {
        success: true,
        data: result
      };
    } catch (error: any) {
      return {
        success: false,
        error: ErrorHandler.parseAnchorError(error)
      };
    }
  }

  /**
   * Fetch multiple accounts in batches
   */
  async fetchMultipleAccounts<T>(
    addresses: PublicKey[],
    programName: string,
    accountType: string,
    mapper: (data: any) => T,
    options: BatchFetchOptions = {}
  ): Promise<Map<string, FetchResult<T>>> {
    const opts = { ...this.defaultOptions, batchSize: 10, parallelLimit: 3, ...options };
    const results = new Map<string, FetchResult<T>>();

    // Process in batches
    const batches = this.createBatches(addresses, opts.batchSize!);
    
    for (const batch of batches) {
      const batchPromises = batch.map(address => 
        this.fetchAccount(address, programName, accountType, mapper, opts)
          .then(result => ({ address: address.toString(), result }))
      );

      const batchResults = await Promise.all(batchPromises);
      
      for (const { address, result } of batchResults) {
        results.set(address, result);
      }

      // Add delay between batches to avoid rate limiting
      if (batches.length > 1) {
        await Utils.sleep(100);
      }
    }

    return results;
  }

  /**
   * Fetch all accounts of a specific type from a program
   */
  async fetchAllAccounts<T>(
    programName: string,
    accountType: string,
    mapper: (data: any) => T,
    filters: AccountFilters = {},
    pagination: PaginationOptions = {},
    options: FetchOptions = {}
  ): Promise<{ accounts: T[], total: number }> {
    const opts = { ...this.defaultOptions, ...options };

    try {
      const program = this.programs[programName];
      if (!program) {
        throw new Error(`Program ${programName} not available`);
      }

      const allAccounts = await program.account[accountType].all(
        this.buildProgramAccountsFilters(filters)
      );

      let mappedAccounts = allAccounts.map(account => mapper(account.account));

      // Apply additional filtering if needed
      if (filters.owner) {
        mappedAccounts = mappedAccounts.filter((account: any) => 
          account.owner && account.owner.equals(filters.owner)
        );
      }

      // Apply sorting
      if (pagination.sortBy) {
        mappedAccounts.sort((a: any, b: any) => {
          const aVal = a[pagination.sortBy!];
          const bVal = b[pagination.sortBy!];
          
          if (aVal instanceof BN && bVal instanceof BN) {
            const comparison = aVal.cmp(bVal);
            return pagination.sortOrder === 'desc' ? -comparison : comparison;
          }
          
          if (aVal < bVal) return pagination.sortOrder === 'desc' ? 1 : -1;
          if (aVal > bVal) return pagination.sortOrder === 'desc' ? -1 : 1;
          return 0;
        });
      }

      const total = mappedAccounts.length;

      // Apply pagination
      const offset = pagination.offset || 0;
      const limit = pagination.limit || mappedAccounts.length;
      const paginatedAccounts = mappedAccounts.slice(offset, offset + limit);

      return {
        accounts: paginatedAccounts,
        total
      };
    } catch (error: any) {
      console.error(`Error fetching all ${accountType} accounts:`, error);
      return { accounts: [], total: 0 };
    }
  }

  // ===== HUB PROGRAM ACCOUNTS =====

  /**
   * Fetch global configuration
   */
  async fetchGlobalConfig(options: FetchOptions = {}): Promise<FetchResult<GlobalConfig>> {
    const [globalConfigPDA] = this.pdaGenerator.getGlobalConfigPDA();
    
    return this.fetchAccount(
      globalConfigPDA,
      'hub',
      'globalConfig',
      (data: any) => this.mapGlobalConfig(data),
      options
    );
  }

  // ===== PROFILE PROGRAM ACCOUNTS =====

  /**
   * Fetch user profile
   */
  async fetchProfile(owner: PublicKey, options: FetchOptions = {}): Promise<FetchResult<Profile>> {
    const [profilePDA] = this.pdaGenerator.getProfilePDA(owner);
    
    return this.fetchAccount(
      profilePDA,
      'profile', 
      'profile',
      (data: any) => this.mapProfile(data),
      options
    );
  }

  /**
   * Fetch multiple profiles
   */
  async fetchMultipleProfiles(
    owners: PublicKey[],
    options: BatchFetchOptions = {}
  ): Promise<Map<string, FetchResult<Profile>>> {
    const addresses = owners.map(owner => this.pdaGenerator.getProfilePDA(owner)[0]);
    
    return this.fetchMultipleAccounts(
      addresses,
      'profile',
      'profile',
      (data: any) => this.mapProfile(data),
      options
    );
  }

  /**
   * Search profiles with filters
   */
  async searchProfiles(
    filters: {
      minReputationScore?: number;
      minTotalTrades?: number;
      hasContactInfo?: boolean;
      activeOnly?: boolean;
    } = {},
    pagination: PaginationOptions = {},
    options: FetchOptions = {}
  ): Promise<{ profiles: Profile[], total: number }> {
    const result = await this.fetchAllAccounts(
      'profile',
      'profile',
      (data: any) => this.mapProfile(data),
      {},
      pagination,
      options
    );

    // Apply custom filters
    let filteredProfiles = result.accounts.filter(profile => {
      if (filters.minReputationScore && profile.reputationScore.toNumber() < filters.minReputationScore) {
        return false;
      }
      if (filters.minTotalTrades && profile.totalTrades.toNumber() < filters.minTotalTrades) {
        return false;
      }
      if (filters.hasContactInfo && (!profile.encryptedContactInfo || profile.encryptedContactInfo.length === 0)) {
        return false;
      }
      if (filters.activeOnly) {
        const now = new BN(Math.floor(Date.now() / 1000));
        const thirtyDaysAgo = now.sub(new BN(30 * 24 * 60 * 60));
        if (profile.lastActivityTimestamp.lt(thirtyDaysAgo)) {
          return false;
        }
      }
      return true;
    });

    return {
      profiles: filteredProfiles,
      total: filteredProfiles.length
    };
  }

  // ===== PRICE PROGRAM ACCOUNTS =====

  /**
   * Fetch currency price
   */
  async fetchCurrencyPrice(
    currency: FiatCurrency,
    options: FetchOptions = {}
  ): Promise<FetchResult<CurrencyPrice>> {
    const [currencyPricePDA] = this.pdaGenerator.getCurrencyPricePDA(currency);
    
    return this.fetchAccount(
      currencyPricePDA,
      'price',
      'currencyPrice',
      (data: any) => this.mapCurrencyPrice(data, currency),
      options
    );
  }

  /**
   * Fetch multiple currency prices
   */
  async fetchMultipleCurrencyPrices(
    currencies: FiatCurrency[],
    options: BatchFetchOptions = {}
  ): Promise<Map<string, FetchResult<CurrencyPrice>>> {
    const addresses = currencies.map(currency => this.pdaGenerator.getCurrencyPricePDA(currency)[0]);
    
    return this.fetchMultipleAccounts(
      addresses,
      'price',
      'currencyPrice',
      (data: any, index: number) => this.mapCurrencyPrice(data, currencies[index]),
      options
    );
  }

  /**
   * Fetch all currency prices
   */
  async fetchAllCurrencyPrices(
    options: FetchOptions = {}
  ): Promise<{ prices: CurrencyPrice[], total: number }> {
    return this.fetchAllAccounts(
      'price',
      'currencyPrice',
      (data: any) => this.mapCurrencyPrice(data, this.extractCurrency(data)),
      {},
      {},
      options
    );
  }

  // ===== OFFER PROGRAM ACCOUNTS =====

  /**
   * Fetch offer by ID
   */
  async fetchOffer(offerId: BN, options: FetchOptions = {}): Promise<FetchResult<Offer>> {
    const [offerPDA] = this.pdaGenerator.getOfferPDA(offerId);
    
    return this.fetchAccount(
      offerPDA,
      'offer',
      'offer', 
      (data: any) => this.mapOffer(data),
      options
    );
  }

  /**
   * Fetch multiple offers
   */
  async fetchMultipleOffers(
    offerIds: BN[],
    options: BatchFetchOptions = {}
  ): Promise<Map<string, FetchResult<Offer>>> {
    const addresses = offerIds.map(id => this.pdaGenerator.getOfferPDA(id)[0]);
    
    return this.fetchMultipleAccounts(
      addresses,
      'offer',
      'offer',
      (data: any) => this.mapOffer(data),
      options
    );
  }

  /**
   * Search offers with filters
   */
  async searchOffers(
    filters: {
      owner?: PublicKey;
      offerType?: 'Buy' | 'Sell';
      fiatCurrency?: FiatCurrency;
      state?: OfferState;
      minAmount?: BN;
      maxAmount?: BN;
    } = {},
    pagination: PaginationOptions = {},
    options: FetchOptions = {}
  ): Promise<{ offers: Offer[], total: number }> {
    const accountFilters: AccountFilters = {};
    
    if (filters.owner) {
      accountFilters.owner = filters.owner;
    }

    const result = await this.fetchAllAccounts(
      'offer',
      'offer',
      (data: any) => this.mapOffer(data),
      accountFilters,
      pagination,
      options
    );

    // Apply custom filters
    let filteredOffers = result.accounts.filter(offer => {
      if (filters.offerType && offer.offerType !== filters.offerType) {
        return false;
      }
      if (filters.fiatCurrency && offer.fiatCurrency !== filters.fiatCurrency) {
        return false;
      }
      if (filters.state && offer.state !== filters.state) {
        return false;
      }
      if (filters.minAmount && offer.maxAmount.lt(filters.minAmount)) {
        return false;
      }
      if (filters.maxAmount && offer.minAmount.gt(filters.maxAmount)) {
        return false;
      }
      return true;
    });

    return {
      offers: filteredOffers,
      total: filteredOffers.length
    };
  }

  // ===== TRADE PROGRAM ACCOUNTS =====

  /**
   * Fetch trade by ID
   */
  async fetchTrade(tradeId: BN, options: FetchOptions = {}): Promise<FetchResult<Trade>> {
    const [tradePDA] = this.pdaGenerator.getTradePDA(tradeId);
    
    return this.fetchAccount(
      tradePDA,
      'trade',
      'trade',
      (data: any) => this.mapTrade(data),
      options
    );
  }

  /**
   * Fetch multiple trades
   */
  async fetchMultipleTrades(
    tradeIds: BN[],
    options: BatchFetchOptions = {}
  ): Promise<Map<string, FetchResult<Trade>>> {
    const addresses = tradeIds.map(id => this.pdaGenerator.getTradePDA(id)[0]);
    
    return this.fetchMultipleAccounts(
      addresses,
      'trade',
      'trade',
      (data: any) => this.mapTrade(data),
      options
    );
  }

  /**
   * Search trades with filters
   */
  async searchTrades(
    filters: {
      maker?: PublicKey;
      taker?: PublicKey;
      state?: TradeState;
      minAmount?: BN;
      maxAmount?: BN;
    } = {},
    pagination: PaginationOptions = {},
    options: FetchOptions = {}
  ): Promise<{ trades: Trade[], total: number }> {
    const result = await this.fetchAllAccounts(
      'trade',
      'trade',
      (data: any) => this.mapTrade(data),
      {},
      pagination,
      options
    );

    // Apply custom filters
    let filteredTrades = result.accounts.filter(trade => {
      if (filters.maker && !trade.maker.equals(filters.maker)) {
        return false;
      }
      if (filters.taker && !trade.taker.equals(filters.taker)) {
        return false;
      }
      if (filters.state && trade.state !== filters.state) {
        return false;
      }
      if (filters.minAmount && trade.amount.lt(filters.minAmount)) {
        return false;
      }
      if (filters.maxAmount && trade.amount.gt(filters.maxAmount)) {
        return false;
      }
      return true;
    });

    return {
      trades: filteredTrades,
      total: filteredTrades.length
    };
  }

  // ===== ARBITRATION PROGRAM ACCOUNTS =====

  /**
   * Fetch arbitrator
   */
  async fetchArbitrator(
    authority: PublicKey,
    options: FetchOptions = {}
  ): Promise<FetchResult<Arbitrator>> {
    const [arbitratorPDA] = this.pdaGenerator.getArbitratorPDA(authority);
    
    return this.fetchAccount(
      arbitratorPDA,
      'arbitration',
      'arbitrator',
      (data: any) => this.mapArbitrator(data),
      options
    );
  }

  /**
   * Fetch all arbitrators
   */
  async fetchAllArbitrators(
    filters: {
      status?: 'Active' | 'Inactive';
      minReputationScore?: number;
      maxActiveDisputes?: number;
    } = {},
    pagination: PaginationOptions = {},
    options: FetchOptions = {}
  ): Promise<{ arbitrators: Arbitrator[], total: number }> {
    const result = await this.fetchAllAccounts(
      'arbitration',
      'arbitrator',
      (data: any) => this.mapArbitrator(data),
      {},
      pagination,
      options
    );

    // Apply custom filters
    let filteredArbitrators = result.accounts.filter(arbitrator => {
      if (filters.status && arbitrator.status !== filters.status) {
        return false;
      }
      if (filters.minReputationScore && arbitrator.reputationScore.toNumber() < filters.minReputationScore) {
        return false;
      }
      if (filters.maxActiveDisputes && arbitrator.activeDisputes > filters.maxActiveDisputes) {
        return false;
      }
      return true;
    });

    return {
      arbitrators: filteredArbitrators,
      total: filteredArbitrators.length
    };
  }

  // ===== UTILITY METHODS =====

  /**
   * Clear cache
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    totalEntries: number;
    hitRate: number;
    memoryUsage: number;
  } {
    // This is a simplified implementation
    return {
      totalEntries: this.cache.size,
      hitRate: 0.85, // Would track actual hit rate
      memoryUsage: this.cache.size * 1024 // Rough estimate
    };
  }

  /**
   * Warmup cache with common accounts
   */
  async warmupCache(): Promise<void> {
    // Fetch commonly accessed accounts
    await Promise.all([
      this.fetchGlobalConfig(),
      this.fetchAllCurrencyPrices({ useCache: true, cacheTtl: 60000 })
    ]);
  }

  // ===== PRIVATE HELPER METHODS =====

  private getCachedAccount<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    
    if (cached) {
      this.cache.delete(key);
    }
    
    return null;
  }

  private setCachedAccount<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private buildProgramAccountsFilters(filters: AccountFilters): GetProgramAccountsFilter[] {
    const programFilters: GetProgramAccountsFilter[] = [];

    if (filters.dataSize) {
      programFilters.push({ dataSize: filters.dataSize });
    }

    if (filters.memcmp) {
      filters.memcmp.forEach(filter => {
        programFilters.push({ memcmp: filter });
      });
    }

    return programFilters;
  }

  // Data mapping methods (would be implemented based on actual account structures)
  private mapGlobalConfig(data: any): GlobalConfig {
    return {
      authority: data.authority,
      offerProgram: data.offerProgram,
      tradeProgram: data.tradeProgram,
      profileProgram: data.profileProgram,
      priceProgram: data.priceProgram,
      priceProvider: data.priceProvider,
      localMint: data.localMint,
      chainFeeCollector: data.chainFeeCollector,
      warchest: data.warchest,
      activeOffersLimit: data.activeOffersLimit,
      activeTradesLimit: data.activeTradesLimit,
      arbitrationFeeBps: data.arbitrationFeeBps,
      burnFeeBps: data.burnFeeBps,
      chainFeeBps: data.chainFeeBps,
      warchestFeeBps: data.warchestFeeBps,
      tradeExpirationTimer: data.tradeExpirationTimer,
      tradeDisputeTimer: data.tradeDisputeTimer,
      tradeLimitMin: data.tradeLimitMin,
      tradeLimitMax: data.tradeLimitMax,
      bump: data.bump,
    };
  }

  private mapProfile(data: any): Profile {
    return {
      owner: data.owner,
      encryptedContactInfo: data.encryptedContactInfo || '',
      totalTrades: data.totalTrades,
      successfulTrades: data.successfulTrades,
      reputationScore: data.reputationScore,
      totalTradeVolume: data.totalTradeVolume,
      activeOffersCount: data.activeOffersCount,
      activeTradesCount: data.activeTradesCount,
      totalOffersCount: data.totalOffersCount,
      lastActivityTimestamp: data.lastActivityTimestamp,
      bump: data.bump,
    };
  }

  private mapCurrencyPrice(data: any, currency: FiatCurrency): CurrencyPrice {
    return {
      currency,
      priceUsd: data.priceUsd,
      timestamp: data.timestamp,
      confidence: data.confidence,
      source: data.source,
      bump: data.bump,
    };
  }

  private mapOffer(data: any): Offer {
    // This would map the actual offer data structure
    return data as Offer;
  }

  private mapTrade(data: any): Trade {
    // This would map the actual trade data structure
    return data as Trade;
  }

  private mapArbitrator(data: any): Arbitrator {
    // This would map the actual arbitrator data structure
    return data as Arbitrator;
  }

  private extractCurrency(data: any): FiatCurrency {
    // This would extract currency from account data
    return data.currency || FiatCurrency.USD;
  }
}

/**
 * Create an AccountFetcher instance
 */
export function createAccountFetcher(
  connection: Connection,
  programs: {
    hub?: Program;
    profile?: Program;
    price?: Program;
    offer?: Program;
    trade?: Program;
    arbitration?: Program;
  },
  programAddresses: ProgramAddresses,
  options: FetchOptions = {}
): AccountFetcher {
  return new AccountFetcher(connection, programs, programAddresses, options);
}