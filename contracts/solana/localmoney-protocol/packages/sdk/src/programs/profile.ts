import { PublicKey, Connection } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import {
  Profile,
  UpdateProfileParams,
  TransactionResult,
  ProgramAddresses
} from '../types';
import { PDAGenerator, Utils } from '../utils';

/**
 * SDK for interacting with the LocalMoney Profile Program
 */
export class ProfileSDK {
  private program: Program;
  private pdaGenerator: PDAGenerator;

  constructor(
    program: Program,
    programAddresses: ProgramAddresses
  ) {
    this.program = program;
    this.pdaGenerator = new PDAGenerator(programAddresses);
  }

  /**
   * Get the current provider
   */
  get provider(): AnchorProvider {
    return this.program.provider as AnchorProvider;
  }

  /**
   * Get the connection
   */
  get connection(): Connection {
    return this.provider.connection;
  }

  /**
   * Create a new user profile
   */
  async createProfile(
    owner: PublicKey = this.provider.wallet.publicKey,
    encryptedContactInfo?: string
  ): Promise<TransactionResult> {
    try {
      const [profilePDA] = this.pdaGenerator.getProfilePDA(owner);

      // Check if profile already exists
      const existingProfile = await this.getProfile(owner);
      if (existingProfile) {
        return {
          signature: '',
          success: false,
          error: 'Profile already exists for this user',
        };
      }

      const tx = await this.program.methods
        .createProfile({
          encryptedContactInfo: encryptedContactInfo || '',
        })
        .accounts({
          profile: profilePDA,
          owner: owner,
          payer: this.provider.wallet.publicKey,
          systemProgram: PublicKey.default,
        })
        .rpc();

      return {
        signature: tx,
        success: true,
      };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update profile contact information
   */
  async updateContact(
    owner: PublicKey = this.provider.wallet.publicKey,
    encryptedContactInfo: string
  ): Promise<TransactionResult> {
    try {
      // Validate contact info length (max 500 characters)
      if (!Utils.validateStringLength(encryptedContactInfo, 500)) {
        throw new Error('Contact information exceeds maximum length (500 characters)');
      }

      const [profilePDA] = this.pdaGenerator.getProfilePDA(owner);

      const tx = await this.program.methods
        .updateContact({
          encryptedContactInfo,
        })
        .accounts({
          profile: profilePDA,
          owner: owner,
        })
        .rpc();

      return {
        signature: tx,
        success: true,
      };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get profile for a specific user
   */
  async getProfile(owner: PublicKey): Promise<Profile | null> {
    try {
      const [profilePDA] = this.pdaGenerator.getProfilePDA(owner);
      const profileData = await this.program.account.profile.fetch(profilePDA);
      return this.mapProfile(profileData);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get profile PDA address for a user
   */
  getProfileAddress(owner: PublicKey): PublicKey {
    const [profilePDA] = this.pdaGenerator.getProfilePDA(owner);
    return profilePDA;
  }

  /**
   * Check if a profile exists for a user
   */
  async profileExists(owner: PublicKey): Promise<boolean> {
    const profile = await this.getProfile(owner);
    return profile !== null;
  }

  /**
   * Get multiple profiles by owners
   */
  async getMultipleProfiles(owners: PublicKey[]): Promise<(Profile | null)[]> {
    const profiles = await Promise.all(
      owners.map(owner => this.getProfile(owner))
    );
    return profiles;
  }

  /**
   * Get profile statistics and reputation info
   */
  async getProfileStats(owner: PublicKey): Promise<{
    totalTrades: number;
    successfulTrades: number;
    successRate: number;
    reputationScore: number;
    totalVolume: string;
    activeOffersCount: number;
    activeTradesCount: number;
    lastActivity: Date | null;
  } | null> {
    const profile = await this.getProfile(owner);
    if (!profile) {
      return null;
    }

    const successRate = profile.totalTrades.gt(new BN(0))
      ? (profile.successfulTrades.toNumber() / profile.totalTrades.toNumber()) * 100
      : 0;

    return {
      totalTrades: profile.totalTrades.toNumber(),
      successfulTrades: profile.successfulTrades.toNumber(),
      successRate: Math.round(successRate * 100) / 100,
      reputationScore: profile.reputationScore.toNumber(),
      totalVolume: Utils.formatAmount(profile.totalTradeVolume),
      activeOffersCount: profile.activeOffersCount,
      activeTradesCount: profile.activeTradesCount,
      lastActivity: profile.lastActivityTimestamp.gt(new BN(0))
        ? Utils.timestampToDate(profile.lastActivityTimestamp)
        : null,
    };
  }

  /**
   * Check if user can create a new offer based on their limits
   */
  async canCreateOffer(
    owner: PublicKey,
    activeOffersLimit: number
  ): Promise<{ canCreate: boolean; reason?: string }> {
    const profile = await this.getProfile(owner);
    if (!profile) {
      return { canCreate: false, reason: 'Profile not found' };
    }

    if (profile.activeOffersCount >= activeOffersLimit) {
      return {
        canCreate: false,
        reason: `Active offers limit reached (${activeOffersLimit})`,
      };
    }

    return { canCreate: true };
  }

  /**
   * Check if user can create a new trade based on their limits
   */
  async canCreateTrade(
    owner: PublicKey,
    activeTradesLimit: number
  ): Promise<{ canCreate: boolean; reason?: string }> {
    const profile = await this.getProfile(owner);
    if (!profile) {
      return { canCreate: false, reason: 'Profile not found' };
    }

    if (profile.activeTradesCount >= activeTradesLimit) {
      return {
        canCreate: false,
        reason: `Active trades limit reached (${activeTradesLimit})`,
      };
    }

    return { canCreate: true };
  }

  /**
   * Get user reputation level based on reputation score
   */
  getReputationLevel(reputationScore: number): {
    level: string;
    description: string;
    minScore: number;
    maxScore: number;
  } {
    if (reputationScore >= 1000) {
      return {
        level: 'Diamond',
        description: 'Elite trader with exceptional reputation',
        minScore: 1000,
        maxScore: Infinity,
      };
    } else if (reputationScore >= 500) {
      return {
        level: 'Gold',
        description: 'Highly trusted trader',
        minScore: 500,
        maxScore: 999,
      };
    } else if (reputationScore >= 250) {
      return {
        level: 'Silver',
        description: 'Reliable trader',
        minScore: 250,
        maxScore: 499,
      };
    } else if (reputationScore >= 100) {
      return {
        level: 'Bronze',
        description: 'Established trader',
        minScore: 100,
        maxScore: 249,
      };
    } else if (reputationScore >= 0) {
      return {
        level: 'Newcomer',
        description: 'New to the platform',
        minScore: 0,
        maxScore: 99,
      };
    } else {
      return {
        level: 'Restricted',
        description: 'Account under review',
        minScore: -Infinity,
        maxScore: -1,
      };
    }
  }

  /**
   * Validate profile for trading eligibility
   */
  async validateProfileForTrading(owner: PublicKey): Promise<{
    eligible: boolean;
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    const profile = await this.getProfile(owner);
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    if (!profile) {
      issues.push('No profile found');
      return {
        eligible: false,
        score: 0,
        issues,
        recommendations: ['Create a profile first'],
      };
    }

    // Check profile age (minimum 7 days)
    const now = new BN(Math.floor(Date.now() / 1000));
    const profileAge = now.sub(profile.lastActivityTimestamp);
    const minAge = new BN(7 * 24 * 60 * 60); // 7 days in seconds

    if (profileAge.gte(minAge)) {
      score += 20;
    } else {
      issues.push('Profile too new (minimum 7 days required)');
      recommendations.push('Wait until profile is at least 7 days old');
    }

    // Check reputation score
    const reputationScore = profile.reputationScore.toNumber();
    if (reputationScore >= 100) {
      score += 25;
    } else if (reputationScore >= 50) {
      score += 15;
    } else if (reputationScore >= 0) {
      score += 5;
    } else {
      issues.push('Negative reputation score');
      recommendations.push('Improve reputation through successful trades');
    }

    // Check trading history
    const totalTrades = profile.totalTrades.toNumber();
    if (totalTrades >= 10) {
      score += 30;
    } else if (totalTrades >= 5) {
      score += 20;
    } else if (totalTrades >= 1) {
      score += 10;
    } else {
      recommendations.push('Complete at least 1 trade to improve score');
    }

    // Check contact information
    if (profile.encryptedContactInfo && profile.encryptedContactInfo.length > 0) {
      score += 15;
    } else {
      issues.push('No contact information provided');
      recommendations.push('Add contact information to your profile');
    }

    // Check recent activity
    const recentActivityThreshold = new BN(90 * 24 * 60 * 60); // 90 days
    const timeSinceActivity = now.sub(profile.lastActivityTimestamp);
    if (timeSinceActivity.lte(recentActivityThreshold)) {
      score += 10;
    } else {
      recommendations.push('Stay active to maintain good standing');
    }

    const eligible = score >= 70 && issues.length === 0;

    return {
      eligible,
      score,
      issues,
      recommendations,
    };
  }

  /**
   * Search profiles with pagination
   */
  async searchProfiles(filters: {
    minReputationScore?: number;
    minTotalTrades?: number;
    hasContactInfo?: boolean;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    profiles: Profile[];
    total: number;
  }> {
    try {
      // Get all profiles (this is a simplified implementation)
      // In practice, you'd want to implement proper indexing and filtering on-chain
      const allProfiles = await this.program.account.profile.all();
      
      let filtered = allProfiles
        .map(account => this.mapProfile(account.account))
        .filter(profile => {
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

      const total = filtered.length;
      const offset = filters.offset || 0;
      const limit = filters.limit || 50;
      
      filtered = filtered.slice(offset, offset + limit);

      return {
        profiles: filtered,
        total,
      };
    } catch (error) {
      console.error('Error searching profiles:', error);
      return { profiles: [], total: 0 };
    }
  }

  // Private helper methods

  private mapProfile(profileData: any): Profile {
    return {
      owner: profileData.owner,
      encryptedContactInfo: profileData.encryptedContactInfo || '',
      totalTrades: profileData.totalTrades,
      successfulTrades: profileData.successfulTrades,
      reputationScore: profileData.reputationScore,
      totalTradeVolume: profileData.totalTradeVolume,
      activeOffersCount: profileData.activeOffersCount,
      activeTradesCount: profileData.activeTradesCount,
      totalOffersCount: profileData.totalOffersCount,
      lastActivityTimestamp: profileData.lastActivityTimestamp,
      bump: profileData.bump,
    };
  }
}