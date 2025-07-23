import { PublicKey, Connection } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import {
  Arbitrator,
  ArbitratorCounter,
  RegisterArbitratorParams,
  TransactionResult,
  ProgramAddresses,
  ArbitratorStatus,
  DisputeResolution
} from '../types';
import { PDAGenerator, Utils } from '../utils';

/**
 * SDK for interacting with the LocalMoney Arbitration Program
 */
export class ArbitrationSDK {
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
   * Register as an arbitrator
   */
  async registerArbitrator(params: RegisterArbitratorParams): Promise<TransactionResult> {
    try {
      // Validate parameters
      this.validateRegisterArbitratorParams(params);

      const [arbitratorCounterPDA] = this.pdaGenerator.getArbitratorCounterPDA();
      const [arbitratorPDA] = this.pdaGenerator.getArbitratorPDA(
        params.authority || this.provider.wallet.publicKey
      );

      const tx = await this.program.methods
        .registerArbitrator({
          feePercentage: params.feePercentage,
          languages: params.languages,
          specializations: params.specializations,
          contactInfo: params.contactInfo || '',
        })
        .accounts({
          arbitrator: arbitratorPDA,
          arbitratorCounter: arbitratorCounterPDA,
          authority: params.authority || this.provider.wallet.publicKey,
          payer: this.provider.wallet.publicKey,
          systemProgram: PublicKey.default,
        })
        .rpc();

      return {
        signature: tx,
        success: true,
        data: { address: arbitratorPDA },
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
   * Update arbitrator information
   */
  async updateArbitrator(
    params: Partial<RegisterArbitratorParams>,
    authority: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [arbitratorPDA] = this.pdaGenerator.getArbitratorPDA(authority);

      const tx = await this.program.methods
        .updateArbitrator({
          feePercentage: params.feePercentage || null,
          languages: params.languages || null,
          specializations: params.specializations || null,
          contactInfo: params.contactInfo || null,
        })
        .accounts({
          arbitrator: arbitratorPDA,
          authority: authority,
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
   * Remove arbitrator (admin only)
   */
  async removeArbitrator(
    arbitratorAuthority: PublicKey,
    admin: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [arbitratorPDA] = this.pdaGenerator.getArbitratorPDA(arbitratorAuthority);

      const tx = await this.program.methods
        .removeArbitrator()
        .accounts({
          arbitrator: arbitratorPDA,
          authority: admin,
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
   * Settle a dispute
   */
  async settleDispute(
    tradeId: BN,
    resolution: DisputeResolution,
    reason: string,
    arbitrator: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      if (!Utils.validateStringLength(reason, 500)) {
        throw new Error('Settlement reason exceeds maximum length (500 characters)');
      }

      const tx = await this.program.methods
        .settleDispute({
          tradeId,
          resolution: { [resolution.toLowerCase()]: {} },
          reason,
        })
        .accounts({
          arbitrator: arbitrator,
          // Additional accounts would be added based on actual implementation
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
   * Get arbitrator by authority
   */
  async getArbitrator(authority: PublicKey): Promise<Arbitrator | null> {
    try {
      const [arbitratorPDA] = this.pdaGenerator.getArbitratorPDA(authority);
      const arbitratorData = await this.program.account.arbitrator.fetch(arbitratorPDA);
      return this.mapArbitrator(arbitratorData);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get arbitrator PDA address
   */
  getArbitratorAddress(authority: PublicKey): PublicKey {
    const [arbitratorPDA] = this.pdaGenerator.getArbitratorPDA(authority);
    return arbitratorPDA;
  }

  /**
   * Get arbitrator counter
   */
  async getArbitratorCounter(): Promise<ArbitratorCounter | null> {
    try {
      const [arbitratorCounterPDA] = this.pdaGenerator.getArbitratorCounterPDA();
      const counterData = await this.program.account.arbitratorCounter.fetch(arbitratorCounterPDA);
      return {
        count: counterData.count,
        bump: counterData.bump,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all arbitrators
   */
  async getAllArbitrators(
    filters: {
      status?: ArbitratorStatus;
      minReputationScore?: number;
      maxActiveDisputes?: number;
      languages?: string[];
      specializations?: string[];
    } = {}
  ): Promise<Arbitrator[]> {
    try {
      const allArbitrators = await this.program.account.arbitrator.all();
      
      let arbitrators = allArbitrators.map(account => this.mapArbitrator(account.account));

      // Apply filters
      if (filters.status) {
        arbitrators = arbitrators.filter(arb => arb.status === filters.status);
      }
      
      if (filters.minReputationScore) {
        arbitrators = arbitrators.filter(arb => 
          arb.reputationScore.toNumber() >= filters.minReputationScore!
        );
      }
      
      if (filters.maxActiveDisputes) {
        arbitrators = arbitrators.filter(arb => 
          arb.activeDisputes <= filters.maxActiveDisputes!
        );
      }
      
      if (filters.languages && filters.languages.length > 0) {
        arbitrators = arbitrators.filter(arb =>
          filters.languages!.some(lang => arb.languages.includes(lang))
        );
      }
      
      if (filters.specializations && filters.specializations.length > 0) {
        arbitrators = arbitrators.filter(arb =>
          filters.specializations!.some(spec => arb.specializations.includes(spec))
        );
      }

      return arbitrators;
    } catch (error) {
      console.error('Error fetching arbitrators:', error);
      return [];
    }
  }

  /**
   * Get active arbitrators available for dispute assignment
   */
  async getAvailableArbitrators(
    maxActiveDisputes: number = 10,
    requiredLanguages: string[] = [],
    requiredSpecializations: string[] = []
  ): Promise<Arbitrator[]> {
    const filters: any = {
      status: ArbitratorStatus.Active,
      maxActiveDisputes,
    };

    if (requiredLanguages.length > 0) {
      filters.languages = requiredLanguages;
    }
    
    if (requiredSpecializations.length > 0) {
      filters.specializations = requiredSpecializations;
    }

    return this.getAllArbitrators(filters);
  }

  /**
   * Select best arbitrator for a dispute using algorithm
   */
  async selectArbitratorForDispute(
    tradeId: BN,
    criteria: {
      requiredLanguages?: string[];
      requiredSpecializations?: string[];
      preferHighReputation?: boolean;
      preferLowWorkload?: boolean;
    } = {}
  ): Promise<Arbitrator | null> {
    const availableArbitrators = await this.getAvailableArbitrators(
      10,
      criteria.requiredLanguages,
      criteria.requiredSpecializations
    );

    if (availableArbitrators.length === 0) {
      return null;
    }

    // Calculate selection score for each arbitrator
    const scoredArbitrators = availableArbitrators.map(arbitrator => {
      let score = 0;

      // Reputation component (0-100 points)
      if (criteria.preferHighReputation) {
        score += Math.min(arbitrator.reputationScore.toNumber() / 10, 100);
      }

      // Workload component (0-50 points, inverted)
      if (criteria.preferLowWorkload) {
        const workloadScore = Math.max(0, 50 - (arbitrator.activeDisputes * 5));
        score += workloadScore;
      }

      // Experience bonus (0-30 points)
      const experienceBonus = Math.min(arbitrator.totalDisputes * 2, 30);
      score += experienceBonus;

      // Activity bonus (0-20 points)
      const now = new BN(Math.floor(Date.now() / 1000));
      const timeSinceActivity = now.sub(arbitrator.lastActivity);
      const oneWeekInSeconds = new BN(7 * 24 * 60 * 60);
      
      if (timeSinceActivity.lte(oneWeekInSeconds)) {
        score += 20;
      } else if (timeSinceActivity.lte(oneWeekInSeconds.mul(new BN(2)))) {
        score += 10;
      }

      return { arbitrator, score };
    });

    // Sort by score (highest first) and return the best arbitrator
    scoredArbitrators.sort((a, b) => b.score - a.score);
    return scoredArbitrators[0].arbitrator;
  }

  /**
   * Get arbitrator statistics
   */
  async getArbitratorStats(authority: PublicKey): Promise<{
    totalDisputes: number;
    resolvedDisputes: number;
    activeDisputes: number;
    successRate: number;
    averageResolutionTime: number;
    reputationScore: number;
    totalEarnings: string;
  } | null> {
    const arbitrator = await this.getArbitrator(authority);
    if (!arbitrator) {
      return null;
    }

    const successRate = arbitrator.totalDisputes > 0 
      ? (arbitrator.resolvedDisputes / arbitrator.totalDisputes) * 100 
      : 0;

    return {
      totalDisputes: arbitrator.totalDisputes,
      resolvedDisputes: arbitrator.resolvedDisputes,
      activeDisputes: arbitrator.activeDisputes,
      successRate: Math.round(successRate * 100) / 100,
      averageResolutionTime: 0, // Would be calculated from actual resolution data
      reputationScore: arbitrator.reputationScore.toNumber(),
      totalEarnings: '0', // Would be calculated from actual earnings data
    };
  }

  /**
   * Get arbitrator ranking
   */
  async getArbitratorRanking(authority: PublicKey): Promise<{
    rank: number;
    totalArbitrators: number;
    percentile: number;
  } | null> {
    const allArbitrators = await this.getAllArbitrators({ status: ArbitratorStatus.Active });
    const targetArbitrator = allArbitrators.find(arb => arb.authority.equals(authority));
    
    if (!targetArbitrator) {
      return null;
    }

    // Sort by reputation score (highest first)
    const sortedArbitrators = allArbitrators.sort((a, b) => 
      b.reputationScore.toNumber() - a.reputationScore.toNumber()
    );

    const rank = sortedArbitrators.findIndex(arb => arb.authority.equals(authority)) + 1;
    const percentile = (rank / allArbitrators.length) * 100;

    return {
      rank,
      totalArbitrators: allArbitrators.length,
      percentile: Math.round(percentile * 100) / 100,
    };
  }

  /**
   * Validate arbitrator eligibility
   */
  validateArbitratorEligibility(arbitrator: Arbitrator): {
    eligible: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (arbitrator.status !== ArbitratorStatus.Active) {
      issues.push('Arbitrator is not active');
    }

    if (arbitrator.activeDisputes >= 10) {
      issues.push('Too many active disputes (max 10)');
      recommendations.push('Complete current disputes before taking new ones');
    }

    if (arbitrator.reputationScore.toNumber() < 100) {
      recommendations.push('Build reputation through successful dispute resolutions');
    }

    if (arbitrator.languages.length === 0) {
      issues.push('No languages specified');
      recommendations.push('Add supported languages to your profile');
    }

    if (arbitrator.specializations.length === 0) {
      recommendations.push('Add specializations to attract relevant disputes');
    }

    const now = new BN(Math.floor(Date.now() / 1000));
    const oneMonthAgo = now.sub(new BN(30 * 24 * 60 * 60));
    
    if (arbitrator.lastActivity.lt(oneMonthAgo)) {
      issues.push('Inactive for more than 30 days');
      recommendations.push('Stay active to maintain good standing');
    }

    return {
      eligible: issues.length === 0,
      issues,
      recommendations,
    };
  }

  /**
   * Get dispute resolution history for an arbitrator
   */
  async getArbitratorDisputeHistory(
    authority: PublicKey,
    limit: number = 50
  ): Promise<Array<{
    tradeId: BN;
    resolution: DisputeResolution;
    timestamp: Date;
    reason: string;
  }>> {
    // This would fetch from a dispute history account or event logs
    // For now, returning empty array as placeholder
    return [];
  }

  /**
   * Calculate arbitrator performance metrics
   */
  async getArbitratorPerformance(authority: PublicKey): Promise<{
    responseTime: number; // Average time to first response
    resolutionTime: number; // Average time to resolution
    disputantSatisfaction: number; // Based on feedback
    fairnessScore: number; // Based on appeal rates
    activityScore: number; // Based on recent activity
  } | null> {
    const arbitrator = await this.getArbitrator(authority);
    if (!arbitrator) {
      return null;
    }

    // This would calculate based on actual performance data
    // For now, returning placeholder values
    return {
      responseTime: 4, // 4 hours average
      resolutionTime: 24, // 24 hours average
      disputantSatisfaction: 85, // 85% satisfaction
      fairnessScore: 90, // 90% fairness score
      activityScore: 75, // 75% activity score
    };
  }

  // Private helper methods

  private validateRegisterArbitratorParams(params: RegisterArbitratorParams): void {
    if (params.feePercentage < 0 || params.feePercentage > 500) {
      throw new Error('Fee percentage must be between 0 and 5% (500 BPS)');
    }

    if (params.languages.length === 0 || params.languages.length > 5) {
      throw new Error('Must specify 1-5 languages');
    }

    if (params.specializations.length === 0 || params.specializations.length > 10) {
      throw new Error('Must specify 1-10 specializations');
    }

    if (params.contactInfo && !Utils.validateStringLength(params.contactInfo, 500)) {
      throw new Error('Contact information exceeds maximum length (500 characters)');
    }

    // Validate language codes (basic validation)
    const validLanguages = ['en', 'es', 'fr', 'de', 'pt', 'ru', 'zh', 'ja', 'ko', 'ar'];
    for (const lang of params.languages) {
      if (!validLanguages.includes(lang.toLowerCase())) {
        throw new Error(`Invalid language code: ${lang}`);
      }
    }
  }

  private mapArbitrator(arbitratorData: any): Arbitrator {
    return {
      id: arbitratorData.id,
      authority: arbitratorData.authority,
      status: this.mapArbitratorStatus(arbitratorData.status),
      feePercentage: arbitratorData.feePercentage,
      languages: arbitratorData.languages || [],
      specializations: arbitratorData.specializations || [],
      contactInfo: arbitratorData.contactInfo || '',
      reputationScore: arbitratorData.reputationScore,
      totalDisputes: arbitratorData.totalDisputes,
      resolvedDisputes: arbitratorData.resolvedDisputes,
      activeDisputes: arbitratorData.activeDisputes,
      lastActivity: arbitratorData.lastActivity,
      createdAt: arbitratorData.createdAt,
      bump: arbitratorData.bump,
    };
  }

  private mapArbitratorStatus(status: any): ArbitratorStatus {
    if (status.active) return ArbitratorStatus.Active;
    if (status.inactive) return ArbitratorStatus.Inactive;
    throw new Error('Unknown arbitrator status');
  }
}