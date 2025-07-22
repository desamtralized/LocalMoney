import { PublicKey, Connection, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import {
  GlobalConfig,
  InitializeHubParams,
  TransactionResult,
  ProgramAddresses
} from '../types';
import { PDAGenerator, Utils } from '../utils';

/**
 * SDK for interacting with the LocalMoney Hub Program
 */
export class HubSDK {
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
   * Initialize the Hub program with global configuration
   */
  async initialize(params: InitializeHubParams): Promise<TransactionResult> {
    try {
      // Validate parameters
      this.validateInitializationParams(params);

      const [globalConfigPDA] = this.pdaGenerator.getGlobalConfigPDA();

      const tx = await this.program.methods
        .initialize({
          offerProgram: params.offerProgram,
          tradeProgram: params.tradeProgram,
          profileProgram: params.profileProgram,
          priceProgram: params.priceProgram,
          priceProvider: params.priceProvider,
          localMint: params.localMint,
          chainFeeCollector: params.chainFeeCollector,
          warchest: params.warchest,
          activeOffersLimit: params.activeOffersLimit,
          activeTradesLimit: params.activeTradesLimit,
          arbitrationFeeBps: params.arbitrationFeeBps,
          burnFeeBps: params.burnFeeBps,
          chainFeeBps: params.chainFeeBps,
          warchestFeeBps: params.warchestFeeBps,
          tradeExpirationTimer: params.tradeExpirationTimer,
          tradeDisputeTimer: params.tradeDisputeTimer,
          tradeLimitMin: params.tradeLimitMin,
          tradeLimitMax: params.tradeLimitMax,
        })
        .accounts({
          config: globalConfigPDA,
          authority: this.provider.wallet.publicKey,
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
   * Update hub configuration (admin only)
   */
  async updateConfig(params: Partial<InitializeHubParams>): Promise<TransactionResult> {
    try {
      const [globalConfigPDA] = this.pdaGenerator.getGlobalConfigPDA();

      const tx = await this.program.methods
        .updateConfig({
          chainFeeCollector: params.chainFeeCollector || null,
          warchest: params.warchest || null,
          priceProvider: params.priceProvider || null,
          activeOffersLimit: params.activeOffersLimit || 0,
          activeTradesLimit: params.activeTradesLimit || 0,
          arbitrationFeeBps: params.arbitrationFeeBps || 0,
          burnFeeBps: params.burnFeeBps || 0,
          chainFeeBps: params.chainFeeBps || 0,
          warchestFeeBps: params.warchestFeeBps || 0,
          tradeExpirationTimer: params.tradeExpirationTimer || new BN(0),
          tradeDisputeTimer: params.tradeDisputeTimer || new BN(0),
          tradeLimitMin: params.tradeLimitMin || new BN(0),
          tradeLimitMax: params.tradeLimitMax || new BN(0),
        })
        .accounts({
          config: globalConfigPDA,
          authority: this.provider.wallet.publicKey,
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
   * Transfer hub authority to a new authority (admin only)
   */
  async updateAuthority(newAuthority: PublicKey): Promise<TransactionResult> {
    try {
      const [globalConfigPDA] = this.pdaGenerator.getGlobalConfigPDA();

      const tx = await this.program.methods
        .updateAuthority(newAuthority)
        .accounts({
          config: globalConfigPDA,
          authority: this.provider.wallet.publicKey,
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
   * Get the current global configuration
   */
  async getGlobalConfig(): Promise<GlobalConfig | null> {
    try {
      const [globalConfigPDA] = this.pdaGenerator.getGlobalConfigPDA();
      const config = await this.program.account.globalConfig.fetch(globalConfigPDA);
      return this.mapGlobalConfig(config);
    } catch (error) {
      console.error('Error fetching global config:', error);
      return null;
    }
  }

  /**
   * Get global configuration PDA address
   */
  getGlobalConfigAddress(): PublicKey {
    const [globalConfigPDA] = this.pdaGenerator.getGlobalConfigPDA();
    return globalConfigPDA;
  }

  /**
   * Check if hub is initialized
   */
  async isInitialized(): Promise<boolean> {
    const config = await this.getGlobalConfig();
    return config !== null;
  }

  /**
   * Validate user activity limits
   */
  async validateUserActivityLimits(
    user: PublicKey,
    offersCount: number,
    tradesCount: number
  ): Promise<{ valid: boolean; reason?: string }> {
    const config = await this.getGlobalConfig();
    if (!config) {
      return { valid: false, reason: 'Hub not initialized' };
    }

    if (offersCount >= config.activeOffersLimit) {
      return { valid: false, reason: `Exceeds active offers limit (${config.activeOffersLimit})` };
    }

    if (tradesCount >= config.activeTradesLimit) {
      return { valid: false, reason: `Exceeds active trades limit (${config.activeTradesLimit})` };
    }

    return { valid: true };
  }

  /**
   * Validate trade amount against configured limits
   */
  async validateTradeAmount(amount: BN): Promise<{ valid: boolean; reason?: string }> {
    const config = await this.getGlobalConfig();
    if (!config) {
      return { valid: false, reason: 'Hub not initialized' };
    }

    if (amount.lt(config.tradeLimitMin)) {
      return { 
        valid: false, 
        reason: `Amount below minimum (${Utils.formatAmount(config.tradeLimitMin)})` 
      };
    }

    if (amount.gt(config.tradeLimitMax)) {
      return { 
        valid: false, 
        reason: `Amount above maximum (${Utils.formatAmount(config.tradeLimitMax)})` 
      };
    }

    return { valid: true };
  }

  /**
   * Get fee configuration
   */
  async getFeeConfiguration(): Promise<{
    chainFeeBps: number;
    burnFeeBps: number;
    warchestFeeBps: number;
    arbitrationFeeBps: number;
    totalFeeBps: number;
  } | null> {
    const config = await this.getGlobalConfig();
    if (!config) {
      return null;
    }

    return {
      chainFeeBps: config.chainFeeBps,
      burnFeeBps: config.burnFeeBps,
      warchestFeeBps: config.warchestFeeBps,
      arbitrationFeeBps: config.arbitrationFeeBps,
      totalFeeBps: config.chainFeeBps + config.burnFeeBps + config.warchestFeeBps + config.arbitrationFeeBps,
    };
  }

  /**
   * Calculate fees for a given amount
   */
  async calculateFees(amount: BN): Promise<{
    chainFee: BN;
    burnFee: BN;
    warchestFee: BN;
    arbitrationFee: BN;
    totalFees: BN;
    netAmount: BN;
  } | null> {
    const config = await this.getGlobalConfig();
    if (!config) {
      return null;
    }

    const chainFee = Utils.calculateFee(amount, config.chainFeeBps);
    const burnFee = Utils.calculateFee(amount, config.burnFeeBps);
    const warchestFee = Utils.calculateFee(amount, config.warchestFeeBps);
    const arbitrationFee = Utils.calculateFee(amount, config.arbitrationFeeBps);
    const totalFees = chainFee.add(burnFee).add(warchestFee).add(arbitrationFee);
    const netAmount = amount.sub(totalFees);

    return {
      chainFee,
      burnFee,
      warchestFee,
      arbitrationFee,
      totalFees,
      netAmount,
    };
  }

  /**
   * Get program addresses from configuration
   */
  async getProgramAddresses(): Promise<{
    offer: PublicKey;
    trade: PublicKey;
    profile: PublicKey;
    price: PublicKey;
  } | null> {
    const config = await this.getGlobalConfig();
    if (!config) {
      return null;
    }

    return {
      offer: config.offerProgram,
      trade: config.tradeProgram,
      profile: config.profileProgram,
      price: config.priceProgram,
    };
  }

  // Private helper methods

  private validateInitializationParams(params: InitializeHubParams): void {
    // Validate fee percentages
    if (!Utils.validateFeeBps(params.chainFeeBps)) {
      throw new Error(`Invalid chain fee: ${params.chainFeeBps} BPS`);
    }
    if (!Utils.validateFeeBps(params.burnFeeBps)) {
      throw new Error(`Invalid burn fee: ${params.burnFeeBps} BPS`);
    }
    if (!Utils.validateFeeBps(params.warchestFeeBps)) {
      throw new Error(`Invalid warchest fee: ${params.warchestFeeBps} BPS`);
    }
    if (!Utils.validateFeeBps(params.arbitrationFeeBps)) {
      throw new Error(`Invalid arbitration fee: ${params.arbitrationFeeBps} BPS`);
    }

    // Validate total fees
    if (!Utils.validateTotalFees(
      params.chainFeeBps,
      params.burnFeeBps,
      params.warchestFeeBps,
      params.arbitrationFeeBps
    )) {
      const total = params.chainFeeBps + params.burnFeeBps + params.warchestFeeBps + params.arbitrationFeeBps;
      throw new Error(`Total fees exceed maximum: ${total} BPS (max: 1000 BPS)`);
    }

    // Validate limits
    if (params.activeOffersLimit < 1 || params.activeOffersLimit > 100) {
      throw new Error(`Invalid active offers limit: ${params.activeOffersLimit}`);
    }
    if (params.activeTradesLimit < 1 || params.activeTradesLimit > 100) {
      throw new Error(`Invalid active trades limit: ${params.activeTradesLimit}`);
    }

    // Validate amount limits
    if (params.tradeLimitMin.gte(params.tradeLimitMax)) {
      throw new Error('Trade limit min must be less than max');
    }
  }

  private mapGlobalConfig(config: any): GlobalConfig {
    return {
      authority: config.authority,
      offerProgram: config.offerProgram,
      tradeProgram: config.tradeProgram,
      profileProgram: config.profileProgram,
      priceProgram: config.priceProgram,
      priceProvider: config.priceProvider,
      localMint: config.localMint,
      chainFeeCollector: config.chainFeeCollector,
      warchest: config.warchest,
      activeOffersLimit: config.activeOffersLimit,
      activeTradesLimit: config.activeTradesLimit,
      arbitrationFeeBps: config.arbitrationFeeBps,
      burnFeeBps: config.burnFeeBps,
      chainFeeBps: config.chainFeeBps,
      warchestFeeBps: config.warchestFeeBps,
      tradeExpirationTimer: config.tradeExpirationTimer,
      tradeDisputeTimer: config.tradeDisputeTimer,
      tradeLimitMin: config.tradeLimitMin,
      tradeLimitMax: config.tradeLimitMax,
      bump: config.bump,
    };
  }
}