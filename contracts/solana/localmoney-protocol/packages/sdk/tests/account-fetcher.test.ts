import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { BN } from 'bn.js';
import { AccountFetcher, createAccountFetcher } from '../src/account-fetcher';
import {
  ProgramAddresses,
  GlobalConfig,
  Profile,
  CurrencyPrice,
  Offer,
  Trade,
  Arbitrator,
  FiatCurrency,
  OfferState,
  TradeState,
  ArbitratorStatus
} from '../src/types';

// Mock program interface
const createMockProgram = (accountData: any = {}) => ({
  account: {
    globalConfig: {
      fetch: jest.fn().mockResolvedValue(accountData.globalConfig || {}),
    },
    profile: {
      fetch: jest.fn().mockResolvedValue(accountData.profile || {}),
      all: jest.fn().mockResolvedValue(accountData.allProfiles || []),
    },
    currencyPrice: {
      fetch: jest.fn().mockResolvedValue(accountData.currencyPrice || {}),
      all: jest.fn().mockResolvedValue(accountData.allPrices || []),
    },
    offer: {
      fetch: jest.fn().mockResolvedValue(accountData.offer || {}),
      all: jest.fn().mockResolvedValue(accountData.allOffers || []),
    },
    trade: {
      fetch: jest.fn().mockResolvedValue(accountData.trade || {}),
      all: jest.fn().mockResolvedValue(accountData.allTrades || []),
    },
    arbitrator: {
      fetch: jest.fn().mockResolvedValue(accountData.arbitrator || {}),
      all: jest.fn().mockResolvedValue(accountData.allArbitrators || []),
    },
  },
});

describe('AccountFetcher', () => {
  let connection: Connection;
  let programAddresses: ProgramAddresses;
  let accountFetcher: AccountFetcher;
  let mockPrograms: any;

  beforeEach(() => {
    connection = new Connection('http://localhost:8899');
    
    programAddresses = {
      hub: new PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
      profile: new PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
      price: new PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
      offer: new PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
      trade: new PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
      arbitration: new PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
    };

    mockPrograms = {
      hub: createMockProgram(),
      profile: createMockProgram(),
      price: createMockProgram(),
      offer: createMockProgram(),
      trade: createMockProgram(),
      arbitration: createMockProgram(),
    };

    accountFetcher = new AccountFetcher(
      connection,
      mockPrograms,
      programAddresses,
      { useCache: false } // Disable cache for testing
    );
  });

  describe('Core Fetching Functionality', () => {
    test('should fetch single account successfully', async () => {
      const mockAccountData = {
        authority: new PublicKey('EU54goz6N45zceUGXEhVBbH9KHLcdA6RXxahyr7B6Gap'),
        activeOffersLimit: 5,
        activeTradesLimit: 3,
        bump: 255,
      };

      mockPrograms.hub.account.globalConfig.fetch.mockResolvedValueOnce(mockAccountData);

      const result = await accountFetcher.fetchGlobalConfig();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.authority).toEqual(mockAccountData.authority);
      expect(result.fromCache).toBeUndefined();
    });

    test('should handle fetch errors gracefully', async () => {
      mockPrograms.hub.account.globalConfig.fetch.mockRejectedValueOnce(
        new Error('Account not found')
      );

      const result = await accountFetcher.fetchGlobalConfig();

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBe('Account not found');
    });

    test('should fetch multiple accounts in batches', async () => {
      const userKeys = Array.from({ length: 5 }, () => Keypair.generate().publicKey);
      const mockProfileData = {
        owner: userKeys[0],
        totalTrades: new BN(10),
        reputationScore: new BN(500),
        bump: 255,
      };

      mockPrograms.profile.account.profile.fetch.mockResolvedValue(mockProfileData);

      const results = await accountFetcher.fetchMultipleProfiles(userKeys, {
        batchSize: 2,
        useCache: false,
      });

      expect(results.size).toBe(5);
      expect(mockPrograms.profile.account.profile.fetch).toHaveBeenCalledTimes(5);

      for (const [address, result] of results) {
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
      }
    });
  });

  describe('Hub Program Accounts', () => {
    test('should fetch global configuration', async () => {
      const mockConfig = {
        authority: new PublicKey('EU54goz6N45zceUGXEhVBbH9KHLcdA6RXxahyr7B6Gap'),
        offerProgram: programAddresses.offer,
        tradeProgram: programAddresses.trade,
        profileProgram: programAddresses.profile,
        priceProgram: programAddresses.price,
        activeOffersLimit: 5,
        activeTradesLimit: 3,
        chainFeeBps: 50,
        arbitrationFeeBps: 200,
        bump: 255,
      };

      mockPrograms.hub.account.globalConfig.fetch.mockResolvedValueOnce(mockConfig);

      const result = await accountFetcher.fetchGlobalConfig();

      expect(result.success).toBe(true);
      expect(result.data?.authority).toEqual(mockConfig.authority);
      expect(result.data?.activeOffersLimit).toBe(5);
      expect(result.data?.chainFeeBps).toBe(50);
    });
  });

  describe('Profile Program Accounts', () => {
    test('should fetch user profile', async () => {
      const userKey = Keypair.generate().publicKey;
      const mockProfile = {
        owner: userKey,
        encryptedContactInfo: 'encrypted_contact',
        totalTrades: new BN(25),
        successfulTrades: new BN(23),
        reputationScore: new BN(750),
        totalTradeVolume: new BN(1000000),
        activeOffersCount: 2,
        activeTradesCount: 1,
        totalOffersCount: 15,
        lastActivityTimestamp: new BN(Math.floor(Date.now() / 1000)),
        bump: 255,
      };

      mockPrograms.profile.account.profile.fetch.mockResolvedValueOnce(mockProfile);

      const result = await accountFetcher.fetchProfile(userKey);

      expect(result.success).toBe(true);
      expect(result.data?.owner).toEqual(userKey);
      expect(result.data?.totalTrades.toNumber()).toBe(25);
      expect(result.data?.reputationScore.toNumber()).toBe(750);
    });

    test('should search profiles with filters', async () => {
      const mockProfiles = [
        {
          account: {
            owner: Keypair.generate().publicKey,
            totalTrades: new BN(10),
            reputationScore: new BN(500),
            encryptedContactInfo: 'contact1',
            lastActivityTimestamp: new BN(Math.floor(Date.now() / 1000) - 86400), // 1 day ago
          },
        },
        {
          account: {
            owner: Keypair.generate().publicKey,
            totalTrades: new BN(5),
            reputationScore: new BN(200),
            encryptedContactInfo: '',
            lastActivityTimestamp: new BN(Math.floor(Date.now() / 1000) - 86400 * 45), // 45 days ago
          },
        },
      ];

      mockPrograms.profile.account.profile.all.mockResolvedValueOnce(mockProfiles);

      const result = await accountFetcher.searchProfiles({
        minReputationScore: 400,
        hasContactInfo: true,
        activeOnly: true,
      });

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0].reputationScore.toNumber()).toBe(500);
      expect(result.profiles[0].encryptedContactInfo).toBe('contact1');
    });
  });

  describe('Price Program Accounts', () => {
    test('should fetch currency price', async () => {
      const mockPrice = {
        priceUsd: new BN(100000000), // $1.00 in 1e8 precision
        timestamp: new BN(Math.floor(Date.now() / 1000)),
        confidence: 95,
        source: 'oracle',
        bump: 255,
      };

      mockPrograms.price.account.currencyPrice.fetch.mockResolvedValueOnce(mockPrice);

      const result = await accountFetcher.fetchCurrencyPrice(FiatCurrency.USD);

      expect(result.success).toBe(true);
      expect(result.data?.currency).toBe(FiatCurrency.USD);
      expect(result.data?.priceUsd.toNumber()).toBe(100000000);
      expect(result.data?.confidence).toBe(95);
    });

    test('should fetch multiple currency prices', async () => {
      const currencies = [FiatCurrency.USD, FiatCurrency.EUR, FiatCurrency.GBP];
      const mockPrice = {
        priceUsd: new BN(100000000),
        timestamp: new BN(Math.floor(Date.now() / 1000)),
        confidence: 95,
        source: 'oracle',
        bump: 255,
      };

      mockPrograms.price.account.currencyPrice.fetch.mockResolvedValue(mockPrice);

      const results = await accountFetcher.fetchMultipleCurrencyPrices(currencies);

      expect(results.size).toBe(3);
      
      for (const [address, result] of results) {
        expect(result.success).toBe(true);
        expect(result.data?.priceUsd.toNumber()).toBe(100000000);
      }
    });
  });

  describe('Offer Program Accounts', () => {
    test('should fetch offer by ID', async () => {
      const offerId = new BN(1);
      const mockOffer = {
        id: offerId,
        maker: Keypair.generate().publicKey,
        offerType: { buy: {} },
        fiatCurrency: { usd: {} },
        rate: new BN(1050000), // 1.05 rate
        minAmount: new BN(1000000000), // 1 token
        maxAmount: new BN(10000000000), // 10 tokens
        description: 'Test offer',
        state: { active: {} },
        createdAt: new BN(Math.floor(Date.now() / 1000)),
        updatedAt: new BN(Math.floor(Date.now() / 1000)),
        bump: 255,
      };

      mockPrograms.offer.account.offer.fetch.mockResolvedValueOnce(mockOffer);

      const result = await accountFetcher.fetchOffer(offerId);

      expect(result.success).toBe(true);
      expect(result.data?.id.toNumber()).toBe(1);
      expect(result.data?.rate.toNumber()).toBe(1050000);
    });

    test('should search offers with filters', async () => {
      const makerKey = Keypair.generate().publicKey;
      const mockOffers = [
        {
          account: {
            id: new BN(1),
            maker: makerKey,
            offerType: { buy: {} },
            fiatCurrency: { usd: {} },
            rate: new BN(1050000),
            minAmount: new BN(1000000000),
            maxAmount: new BN(10000000000),
            state: { active: {} },
            description: 'Buy offer',
          },
        },
        {
          account: {
            id: new BN(2),
            maker: Keypair.generate().publicKey,
            offerType: { sell: {} },
            fiatCurrency: { eur: {} },
            rate: new BN(950000),
            minAmount: new BN(2000000000),
            maxAmount: new BN(20000000000),
            state: { paused: {} },
            description: 'Sell offer',
          },
        },
      ];

      mockPrograms.offer.account.offer.all.mockResolvedValueOnce(mockOffers);

      const result = await accountFetcher.searchOffers({
        offerType: 'Buy',
        fiatCurrency: FiatCurrency.USD,
        state: OfferState.Active,
      });

      expect(result.offers).toHaveLength(1);
      expect(result.offers[0].offerType).toBe('Buy');
      expect(result.offers[0].fiatCurrency).toBe(FiatCurrency.USD);
    });
  });

  describe('Trade Program Accounts', () => {
    test('should fetch trade by ID', async () => {
      const tradeId = new BN(1);
      const mockTrade = {
        id: tradeId,
        offerId: new BN(1),
        maker: Keypair.generate().publicKey,
        taker: Keypair.generate().publicKey,
        amount: new BN(5000000000), // 5 tokens
        state: { requestCreated: {} },
        encryptedContactInfo: 'encrypted_contact',
        createdAt: new BN(Math.floor(Date.now() / 1000)),
        updatedAt: new BN(Math.floor(Date.now() / 1000)),
        bump: 255,
      };

      mockPrograms.trade.account.trade.fetch.mockResolvedValueOnce(mockTrade);

      const result = await accountFetcher.fetchTrade(tradeId);

      expect(result.success).toBe(true);
      expect(result.data?.id.toNumber()).toBe(1);
      expect(result.data?.amount.toNumber()).toBe(5000000000);
    });

    test('should search trades with filters', async () => {
      const makerKey = Keypair.generate().publicKey;
      const takerKey = Keypair.generate().publicKey;
      const mockTrades = [
        {
          account: {
            id: new BN(1),
            maker: makerKey,
            taker: takerKey,
            state: { requestCreated: {} },
            amount: new BN(5000000000),
            offerId: new BN(1),
          },
        },
        {
          account: {
            id: new BN(2),
            maker: Keypair.generate().publicKey,
            taker: makerKey,
            state: { escrowReleased: {} },
            amount: new BN(3000000000),
            offerId: new BN(2),
          },
        },
      ];

      mockPrograms.trade.account.trade.all.mockResolvedValueOnce(mockTrades);

      const result = await accountFetcher.searchTrades({
        maker: makerKey,
        state: TradeState.RequestCreated,
      });

      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].maker.equals(makerKey)).toBe(true);
      expect(result.trades[0].state).toBe(TradeState.RequestCreated);
    });
  });

  describe('Arbitration Program Accounts', () => {
    test('should fetch arbitrator', async () => {
      const authorityKey = Keypair.generate().publicKey;
      const mockArbitrator = {
        id: new BN(1),
        authority: authorityKey,
        status: { active: {} },
        feePercentage: 250, // 2.5%
        languages: ['en', 'es'],
        specializations: ['crypto', 'defi'],
        contactInfo: 'arbitrator@example.com',
        reputationScore: new BN(850),
        totalDisputes: 50,
        resolvedDisputes: 48,
        activeDisputes: 2,
        lastActivity: new BN(Math.floor(Date.now() / 1000)),
        createdAt: new BN(Math.floor(Date.now() / 1000) - 86400 * 30),
        bump: 255,
      };

      mockPrograms.arbitration.account.arbitrator.fetch.mockResolvedValueOnce(mockArbitrator);

      const result = await accountFetcher.fetchArbitrator(authorityKey);

      expect(result.success).toBe(true);
      expect(result.data?.authority.equals(authorityKey)).toBe(true);
      expect(result.data?.feePercentage).toBe(250);
      expect(result.data?.languages).toEqual(['en', 'es']);
    });

    test('should fetch all arbitrators with filters', async () => {
      const mockArbitrators = [
        {
          account: {
            id: new BN(1),
            authority: Keypair.generate().publicKey,
            status: { active: {} },
            reputationScore: new BN(900),
            activeDisputes: 1,
            feePercentage: 200,
          },
        },
        {
          account: {
            id: new BN(2),
            authority: Keypair.generate().publicKey,
            status: { inactive: {} },
            reputationScore: new BN(600),
            activeDisputes: 0,
            feePercentage: 300,
          },
        },
        {
          account: {
            id: new BN(3),
            authority: Keypair.generate().publicKey,
            status: { active: {} },
            reputationScore: new BN(400),
            activeDisputes: 8,
            feePercentage: 150,
          },
        },
      ];

      mockPrograms.arbitration.account.arbitrator.all.mockResolvedValueOnce(mockArbitrators);

      const result = await accountFetcher.fetchAllArbitrators({
        status: ArbitratorStatus.Active,
        minReputationScore: 500,
        maxActiveDisputes: 5,
      });

      expect(result.arbitrators).toHaveLength(1);
      expect(result.arbitrators[0].reputationScore.toNumber()).toBe(900);
      expect(result.arbitrators[0].activeDisputes).toBe(1);
    });
  });

  describe('Caching Functionality', () => {
    beforeEach(() => {
      accountFetcher = new AccountFetcher(
        connection,
        mockPrograms,
        programAddresses,
        { useCache: true, cacheTtl: 5000 } // 5 second TTL
      );
    });

    test('should cache fetched accounts', async () => {
      const mockConfig = {
        authority: new PublicKey('EU54goz6N45zceUGXEhVBbH9KHLcdA6RXxahyr7B6Gap'),
        activeOffersLimit: 5,
        bump: 255,
      };

      mockPrograms.hub.account.globalConfig.fetch.mockResolvedValue(mockConfig);

      // First fetch
      const result1 = await accountFetcher.fetchGlobalConfig();
      expect(result1.success).toBe(true);
      expect(result1.fromCache).toBeUndefined();

      // Second fetch should come from cache
      const result2 = await accountFetcher.fetchGlobalConfig();
      expect(result2.success).toBe(true);
      expect(result2.fromCache).toBe(true);

      // Should only call the mock once
      expect(mockPrograms.hub.account.globalConfig.fetch).toHaveBeenCalledTimes(1);
    });

    test('should clear cache by pattern', () => {
      // Add some mock cache entries
      accountFetcher['cache'].set('hub:globalConfig:test', {
        data: {},
        timestamp: Date.now(),
        ttl: 5000,
      });
      accountFetcher['cache'].set('profile:profile:test', {
        data: {},
        timestamp: Date.now(),
        ttl: 5000,
      });

      // Clear hub entries only
      accountFetcher.clearCache('hub');

      expect(accountFetcher['cache'].has('hub:globalConfig:test')).toBe(false);
      expect(accountFetcher['cache'].has('profile:profile:test')).toBe(true);
    });

    test('should provide cache statistics', () => {
      // Add some mock cache entries
      accountFetcher['cache'].set('test1', {
        data: {},
        timestamp: Date.now(),
        ttl: 5000,
      });
      accountFetcher['cache'].set('test2', {
        data: {},
        timestamp: Date.now(),
        ttl: 5000,
      });

      const stats = accountFetcher.getCacheStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      mockPrograms.hub.account.globalConfig.fetch.mockRejectedValue(
        new Error('Network error')
      );

      const result = await accountFetcher.fetchGlobalConfig({
        maxRetries: 1,
        retryDelay: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    test('should handle account not found errors', async () => {
      mockPrograms.profile.account.profile.fetch.mockRejectedValue(
        new Error('Account does not exist')
      );

      const userKey = Keypair.generate().publicKey;
      const result = await accountFetcher.fetchProfile(userKey);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account does not exist');
    });

    test('should handle program not available errors', async () => {
      const accountFetcherWithoutPrograms = new AccountFetcher(
        connection,
        {}, // No programs provided
        programAddresses
      );

      const result = await accountFetcherWithoutPrograms.fetchGlobalConfig();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Program hub not available');
    });
  });

  describe('Factory Function', () => {
    test('should create AccountFetcher instance using factory', () => {
      const fetcher = createAccountFetcher(
        connection,
        mockPrograms,
        programAddresses,
        { useCache: true }
      );

      expect(fetcher).toBeInstanceOf(AccountFetcher);
    });
  });

  describe('Performance and Pagination', () => {
    test('should handle large batch sizes efficiently', async () => {
      const userKeys = Array.from({ length: 100 }, () => Keypair.generate().publicKey);
      const mockProfileData = {
        owner: userKeys[0],
        totalTrades: new BN(10),
        reputationScore: new BN(500),
        bump: 255,
      };

      mockPrograms.profile.account.profile.fetch.mockResolvedValue(mockProfileData);

      const start = Date.now();
      const results = await accountFetcher.fetchMultipleProfiles(userKeys, {
        batchSize: 10,
        parallelLimit: 5,
        useCache: false,
      });
      const duration = Date.now() - start;

      expect(results.size).toBe(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should support pagination in search results', async () => {
      const mockOffers = Array.from({ length: 25 }, (_, i) => ({
        account: {
          id: new BN(i + 1),
          maker: Keypair.generate().publicKey,
          offerType: { buy: {} },
          fiatCurrency: { usd: {} },
          rate: new BN(1000000 + i * 1000),
          minAmount: new BN(1000000000),
          maxAmount: new BN(10000000000),
          state: { active: {} },
        },
      }));

      mockPrograms.offer.account.offer.all.mockResolvedValue(mockOffers);

      const result = await accountFetcher.searchOffers({}, {
        limit: 10,
        offset: 5,
        sortBy: 'rate',
        sortOrder: 'desc',
      });

      expect(result.offers).toHaveLength(10);
      expect(result.total).toBe(25);
      
      // Check sorting (highest rates first due to desc order)
      for (let i = 1; i < result.offers.length; i++) {
        expect(result.offers[i-1].rate.gte(result.offers[i].rate)).toBe(true);
      }
    });
  });
});