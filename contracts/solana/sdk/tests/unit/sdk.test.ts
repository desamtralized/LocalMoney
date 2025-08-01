import { PublicKey } from '@solana/web3.js';
import { LocalMoneySDK, LocalMoneyConfig, LocalMoneyError } from '../../src/index';
import { mockConnection, mockWallet, mockProgramIds } from '../setup';

describe('LocalMoneySDK', () => {
  let sdk: LocalMoneySDK;
  let config: LocalMoneyConfig;

  beforeEach(() => {
    config = {
      connection: mockConnection,
      wallet: mockWallet,
      programIds: mockProgramIds,
      enableCaching: true,
      cacheTtl: 60000
    };
    sdk = new LocalMoneySDK(config);
  });

  describe('initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(sdk).toBeInstanceOf(LocalMoneySDK);
      expect(sdk.getCacheStats()).toEqual({
        size: 0,
        ttl: 60000,
        enabled: true
      });
    });

    test('should initialize with default cache settings', () => {
      const defaultConfig = {
        connection: mockConnection,
        wallet: mockWallet,
        programIds: mockProgramIds
      };
      const defaultSdk = new LocalMoneySDK(defaultConfig);
      
      expect(defaultSdk.getCacheStats()).toEqual({
        size: 0,
        ttl: 60000,
        enabled: true
      });
    });
  });

  describe('PDA derivation', () => {
    test('should derive profile PDA correctly', () => {
      const user = new PublicKey('11111111111111111111111111111112');
      const [pda, bump] = sdk.getProfilePDA(user);
      
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    test('should derive offer PDA correctly', () => {
      const offerId = 12345;
      const [pda, bump] = sdk.getOfferPDA(offerId);
      
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    test('should derive trade PDA correctly', () => {
      const tradeId = 67890;
      const [pda, bump] = sdk.getTradePDA(tradeId);
      
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    test('should derive escrow PDA correctly', () => {
      const tradeId = 67890;
      const [pda, bump] = sdk.getEscrowPDA(tradeId);
      
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });
  });

  describe('cache management', () => {
    test('should clear cache correctly', () => {
      // Simulate adding something to cache
      sdk['setCache']('test-key', 'test-value');
      expect(sdk.getCacheStats().size).toBe(1);
      
      sdk.clearCache();
      expect(sdk.getCacheStats().size).toBe(0);
    });

    test('should respect cache TTL', async () => {
      const shortTtlConfig = {
        ...config,
        cacheTtl: 1 // 1ms TTL
      };
      const shortTtlSdk = new LocalMoneySDK(shortTtlConfig);
      
      // Set cache entry
      shortTtlSdk['setCache']('test-key', 'test-value');
      
      // Should return cached value immediately
      expect(shortTtlSdk['getFromCache']('test-key')).toBe('test-value');
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should return null after TTL expires
      expect(shortTtlSdk['getFromCache']('test-key')).toBeNull();
    });

    test('should disable caching when configured', () => {
      const noCacheConfig = {
        ...config,
        enableCaching: false
      };
      const noCacheSdk = new LocalMoneySDK(noCacheConfig);
      
      expect(noCacheSdk.getCacheStats().enabled).toBe(false);
      
      // Setting cache should be ignored
      noCacheSdk['setCache']('test-key', 'test-value');
      expect(noCacheSdk['getFromCache']('test-key')).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should create LocalMoneyError correctly', () => {
      const error = new LocalMoneyError('Test error', 6000, 'TestError', ['log1', 'log2']);
      
      expect(error).toBeInstanceOf(LocalMoneyError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(6000);
      expect(error.programError).toBe('TestError');
      expect(error.logs).toEqual(['log1', 'log2']);
    });
  });

  describe('utility methods', () => {
    test('should get associated token account correctly', async () => {
      const mint = new PublicKey('11111111111111111111111111111112');
      const owner = new PublicKey('11111111111111111111111111111113');
      
      const ata = await sdk.getAssociatedTokenAccount(mint, owner);
      expect(ata).toBeInstanceOf(PublicKey);
    });

    test('should generate cache keys correctly', () => {
      const key1 = sdk['getCacheKey']('profile', 'user123');
      const key2 = sdk['getCacheKey']('offer', 123, 'extra');
      
      expect(key1).toBe('profile_user123');
      expect(key2).toBe('offer_123_extra');
    });
  });
});