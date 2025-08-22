import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program, BN } from '@coral-xyz/anchor';
import { LocalMoneyRPC } from '../rpc';
import { deriveProfileAddress } from '../pdas';
import { Profile } from '../types/profile';
import { PROGRAM_IDS } from '../generated';

const ProfileIDL = require('../types/profile.json');

export interface CreateProfileParams {
  username: string;
  region: string;
  contactInfo?: string;
}

export interface UpdateProfileParams {
  username?: string;
  region?: string;
  contactInfo?: string;
}

export interface ProfileInfo {
  user: PublicKey;
  username: string;
  region: string;
  contactInfo?: string;
  successfulTrades: number;
  totalVolume: BN;
  rating: number;
  verificationLevel: number;
  isActive: boolean;
  createdAt: BN;
  updatedAt: BN;
}

export class ProfileSDK {
  private program: Program<Profile>;
  private rpc: LocalMoneyRPC;
  
  constructor(
    private connection: Connection,
    private wallet: Wallet,
    private programId: PublicKey = new PublicKey(PROGRAM_IDS.profile)
  ) {
    const provider = new AnchorProvider(connection, wallet, {});
    this.program = new Program<Profile>(ProfileIDL, programId, provider);
    this.rpc = new LocalMoneyRPC(connection, wallet);
  }
  
  // Create a new profile
  async createProfile(params: CreateProfileParams): Promise<{
    signature: string;
    profileAddress: PublicKey;
  }> {
    return await this.rpc.createProfile(params);
  }
  
  // Update profile information
  async updateProfile(params: UpdateProfileParams): Promise<string> {
    return await this.rpc.updateProfile(params);
  }
  
  // Fetch a profile by user public key
  async getProfile(user: PublicKey): Promise<ProfileInfo | null> {
    try {
      const [profileAddress] = deriveProfileAddress(user, this.programId);
      const profile = await this.program.account.profile.fetch(profileAddress);
      
      return {
        user: profile.user,
        username: profile.username,
        region: profile.region,
        contactInfo: profile.contactInfo,
        successfulTrades: profile.successfulTrades,
        totalVolume: profile.totalVolume,
        rating: profile.rating,
        verificationLevel: profile.verificationLevel,
        isActive: profile.isActive,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      };
    } catch (error) {
      // Profile doesn't exist
      return null;
    }
  }
  
  // Get current wallet's profile
  async getMyProfile(): Promise<ProfileInfo | null> {
    return await this.getProfile(this.wallet.publicKey);
  }
  
  // Check if a profile exists
  async profileExists(user: PublicKey): Promise<boolean> {
    const profile = await this.getProfile(user);
    return profile !== null;
  }
  
  // Get all profiles
  async getAllProfiles(): Promise<ProfileInfo[]> {
    const profiles = await this.program.account.profile.all();
    
    return profiles.map(p => ({
      user: p.account.user,
      username: p.account.username,
      region: p.account.region,
      contactInfo: p.account.contactInfo,
      successfulTrades: p.account.successfulTrades,
      totalVolume: p.account.totalVolume,
      rating: p.account.rating,
      verificationLevel: p.account.verificationLevel,
      isActive: p.account.isActive,
      createdAt: p.account.createdAt,
      updatedAt: p.account.updatedAt,
    }));
  }
  
  // Get active profiles
  async getActiveProfiles(): Promise<ProfileInfo[]> {
    const profiles = await this.program.account.profile.all();
    
    return profiles
      .filter(p => p.account.isActive)
      .map(p => ({
        user: p.account.user,
        username: p.account.username,
        region: p.account.region,
        contactInfo: p.account.contactInfo,
        successfulTrades: p.account.successfulTrades,
        totalVolume: p.account.totalVolume,
        rating: p.account.rating,
        verificationLevel: p.account.verificationLevel,
        isActive: p.account.isActive,
        createdAt: p.account.createdAt,
        updatedAt: p.account.updatedAt,
      }));
  }
  
  // Get profiles by region
  async getProfilesByRegion(region: string): Promise<ProfileInfo[]> {
    const profiles = await this.program.account.profile.all();
    
    return profiles
      .filter(p => p.account.region.toLowerCase() === region.toLowerCase())
      .map(p => ({
        user: p.account.user,
        username: p.account.username,
        region: p.account.region,
        contactInfo: p.account.contactInfo,
        successfulTrades: p.account.successfulTrades,
        totalVolume: p.account.totalVolume,
        rating: p.account.rating,
        verificationLevel: p.account.verificationLevel,
        isActive: p.account.isActive,
        createdAt: p.account.createdAt,
        updatedAt: p.account.updatedAt,
      }));
  }
  
  // Get top rated profiles
  async getTopRatedProfiles(limit: number = 10): Promise<ProfileInfo[]> {
    const profiles = await this.getAllProfiles();
    
    // Sort by rating and successful trades
    profiles.sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return b.successfulTrades - a.successfulTrades;
    });
    
    return profiles.slice(0, limit);
  }
  
  // Get verified profiles
  async getVerifiedProfiles(minLevel: number = 1): Promise<ProfileInfo[]> {
    const profiles = await this.program.account.profile.all();
    
    return profiles
      .filter(p => p.account.verificationLevel >= minLevel)
      .map(p => ({
        user: p.account.user,
        username: p.account.username,
        region: p.account.region,
        contactInfo: p.account.contactInfo,
        successfulTrades: p.account.successfulTrades,
        totalVolume: p.account.totalVolume,
        rating: p.account.rating,
        verificationLevel: p.account.verificationLevel,
        isActive: p.account.isActive,
        createdAt: p.account.createdAt,
        updatedAt: p.account.updatedAt,
      }));
  }
  
  // Search profiles
  async searchProfiles(filters: {
    username?: string;
    region?: string;
    minRating?: number;
    minTrades?: number;
    verifiedOnly?: boolean;
    activeOnly?: boolean;
  }): Promise<ProfileInfo[]> {
    let profiles = await this.program.account.profile.all();
    
    // Apply filters
    if (filters.username) {
      profiles = profiles.filter(p => 
        p.account.username.toLowerCase().includes(filters.username!.toLowerCase())
      );
    }
    
    if (filters.region) {
      profiles = profiles.filter(p => 
        p.account.region.toLowerCase() === filters.region!.toLowerCase()
      );
    }
    
    if (filters.minRating !== undefined) {
      profiles = profiles.filter(p => 
        p.account.rating >= filters.minRating!
      );
    }
    
    if (filters.minTrades !== undefined) {
      profiles = profiles.filter(p => 
        p.account.successfulTrades >= filters.minTrades!
      );
    }
    
    if (filters.verifiedOnly) {
      profiles = profiles.filter(p => 
        p.account.verificationLevel > 0
      );
    }
    
    if (filters.activeOnly) {
      profiles = profiles.filter(p => p.account.isActive);
    }
    
    return profiles.map(p => ({
      user: p.account.user,
      username: p.account.username,
      region: p.account.region,
      contactInfo: p.account.contactInfo,
      successfulTrades: p.account.successfulTrades,
      totalVolume: p.account.totalVolume,
      rating: p.account.rating,
      verificationLevel: p.account.verificationLevel,
      isActive: p.account.isActive,
      createdAt: p.account.createdAt,
      updatedAt: p.account.updatedAt,
    }));
  }
  
  // Calculate trust score
  calculateTrustScore(profile: ProfileInfo): number {
    const tradeScore = Math.min(profile.successfulTrades / 100, 1) * 30;
    const ratingScore = (profile.rating / 5) * 40;
    const verificationScore = (profile.verificationLevel / 3) * 20;
    const volumeScore = Math.min(profile.totalVolume.toNumber() / 1000000, 1) * 10;
    
    return Math.round(tradeScore + ratingScore + verificationScore + volumeScore);
  }
  
  // Get profile statistics
  async getProfileStats(user: PublicKey): Promise<{
    profile: ProfileInfo | null;
    trustScore: number;
    averageRating: number;
    completionRate: number;
  } | null> {
    const profile = await this.getProfile(user);
    
    if (!profile) {
      return null;
    }
    
    const trustScore = this.calculateTrustScore(profile);
    const averageRating = profile.rating;
    const completionRate = profile.successfulTrades > 0 ? 100 : 0; // Would need total trades to calculate properly
    
    return {
      profile,
      trustScore,
      averageRating,
      completionRate,
    };
  }
  
  // Get profile PDA
  getProfileAddress(user: PublicKey): PublicKey {
    const [address] = deriveProfileAddress(user, this.programId);
    return address;
  }
}