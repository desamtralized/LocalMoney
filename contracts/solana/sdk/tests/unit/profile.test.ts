import { PublicKey } from '@solana/web3.js';
import { LocalMoneySDK, LocalMoneyError } from '../../src/index';
import { mockConnection, mockWallet, mockProgramIds } from '../setup';

// Mock the Anchor program methods
jest.mock('@coral-xyz/anchor', () => ({
  ...jest.requireActual('@coral-xyz/anchor'),
  Program: jest.fn().mockImplementation(() => ({
    methods: {
      createProfile: jest.fn().mockReturnValue({
        accountsPartial: jest.fn().mockReturnValue({
          rpc: jest.fn().mockResolvedValue('mock-signature-123')
        })
      })
    },
    account: {
      profile: {
        fetchNullable: jest.fn()
      }
    }
  }))
}));

describe('LocalMoneySDK - Profile Methods', () => {
  let sdk: LocalMoneySDK;

  beforeEach(() => {
    const config = {
      connection: mockConnection,
      wallet: mockWallet,
      programIds: mockProgramIds,
      enableCaching: true
    };
    sdk = new LocalMoneySDK(config);
    jest.clearAllMocks();
  });

  describe('createProfile', () => {
    test('should create profile successfully', async () => {
      const username = 'testuser123';
      const signature = await sdk.createProfile(username);
      
      expect(signature).toBe('mock-signature-123');
    });

    test('should handle createProfile errors', async () => {
      // Mock program to throw error
      const mockProgram = sdk['profileProgram'];
      mockProgram.methods.createProfile = jest.fn().mockReturnValue({
        accountsPartial: jest.fn().mockReturnValue({
          rpc: jest.fn().mockRejectedValue(new Error('Transaction failed'))
        })
      });

      await expect(sdk.createProfile('testuser')).rejects.toThrow(LocalMoneyError);
    });
  });

  describe('getProfile', () => {
    test('should fetch profile successfully', async () => {
      const user = new PublicKey('11111111111111111111111111111112');
      const mockProfile = {
        user: user,
        username: 'testuser',
        reputation: 100,
        tradesCompleted: 5
      };

      const mockProgram = sdk['profileProgram'];
      mockProgram.account.profile.fetchNullable = jest.fn().mockResolvedValue(mockProfile);

      const profile = await sdk.getProfile(user);
      expect(profile).toEqual(mockProfile);
    });

    test('should return null for non-existent profile', async () => {
      const user = new PublicKey('11111111111111111111111111111112');
      
      const mockProgram = sdk['profileProgram'];
      mockProgram.account.profile.fetchNullable = jest.fn().mockResolvedValue(null);

      const profile = await sdk.getProfile(user);
      expect(profile).toBeNull();
    });

    test('should use cache for repeated profile requests', async () => {
      const user = new PublicKey('11111111111111111111111111111112');
      const mockProfile = { user, username: 'cached-user' };

      const mockProgram = sdk['profileProgram'];
      const fetchSpy = jest.fn().mockResolvedValue(mockProfile);
      mockProgram.account.profile.fetchNullable = fetchSpy;

      // First call should fetch from program
      const profile1 = await sdk.getProfile(user);
      expect(profile1).toEqual(mockProfile);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const profile2 = await sdk.getProfile(user);
      expect(profile2).toEqual(mockProfile);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // No additional call
    });

    test('should handle getProfile errors', async () => {
      const user = new PublicKey('11111111111111111111111111111112');
      
      const mockProgram = sdk['profileProgram'];
      mockProgram.account.profile.fetchNullable = jest.fn().mockRejectedValue(
        new Error('Network error')
      );

      await expect(sdk.getProfile(user)).rejects.toThrow(LocalMoneyError);
    });
  });
});