import { PublicKey, Connection } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import {
  Trade,
  TradeCounter,
  Escrow,
  CreateTradeParams,
  TransactionResult,
  ProgramAddresses,
  TradeState,
  EscrowState
} from '../types';
import { PDAGenerator, Utils } from '../utils';

/**
 * SDK for interacting with the LocalMoney Trade Program
 */
export class TradeSDK {
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
   * Create a new trade request
   */
  async createTrade(params: CreateTradeParams): Promise<TransactionResult> {
    try {
      // Validate parameters
      this.validateCreateTradeParams(params);

      const [tradeCounterPDA] = this.pdaGenerator.getTradeCounterPDA();
      
      // Get next trade ID
      const counter = await this.getTradeCounter();
      const nextTradeId = counter ? counter.count.add(new BN(1)) : new BN(1);
      const [tradePDA] = this.pdaGenerator.getTradePDA(nextTradeId);

      const tx = await this.program.methods
        .createTrade({
          offerId: params.offerId,
          amount: params.amount,
          encryptedContactInfo: params.encryptedContactInfo || '',
        })
        .accounts({
          trade: tradePDA,
          tradeCounter: tradeCounterPDA,
          taker: params.taker || this.provider.wallet.publicKey,
          payer: this.provider.wallet.publicKey,
          systemProgram: PublicKey.default,
        })
        .rpc();

      return {
        signature: tx,
        success: true,
        data: { tradeId: nextTradeId, address: tradePDA },
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
   * Accept a trade request (maker accepts taker's request)
   */
  async acceptTrade(
    tradeId: BN,
    maker: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [tradePDA] = this.pdaGenerator.getTradePDA(tradeId);

      const tx = await this.program.methods
        .acceptTrade()
        .accounts({
          trade: tradePDA,
          maker: maker,
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
   * Fund escrow (seller deposits tokens)
   */
  async fundEscrow(
    tradeId: BN,
    tokenMint: PublicKey,
    sellerTokenAccount: PublicKey,
    seller: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [tradePDA] = this.pdaGenerator.getTradePDA(tradeId);
      const [escrowPDA] = this.getEscrowPDA(tradeId);

      const tx = await this.program.methods
        .fundEscrow()
        .accounts({
          trade: tradePDA,
          escrow: escrowPDA,
          tokenMint: tokenMint,
          sellerTokenAccount: sellerTokenAccount,
          seller: seller,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
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
   * Confirm fiat payment deposited (buyer confirms payment)
   */
  async confirmFiatDeposited(
    tradeId: BN,
    buyer: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [tradePDA] = this.pdaGenerator.getTradePDA(tradeId);

      const tx = await this.program.methods
        .confirmFiatDeposited()
        .accounts({
          trade: tradePDA,
          buyer: buyer,
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
   * Release escrow (seller confirms fiat received)
   */
  async releaseEscrow(
    tradeId: BN,
    tokenMint: PublicKey,
    buyerTokenAccount: PublicKey,
    seller: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [tradePDA] = this.pdaGenerator.getTradePDA(tradeId);
      const [escrowPDA] = this.getEscrowPDA(tradeId);

      const tx = await this.program.methods
        .releaseEscrow()
        .accounts({
          trade: tradePDA,
          escrow: escrowPDA,
          tokenMint: tokenMint,
          buyerTokenAccount: buyerTokenAccount,
          seller: seller,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
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
   * Cancel a trade
   */
  async cancelTrade(
    tradeId: BN,
    reason?: string,
    authority: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [tradePDA] = this.pdaGenerator.getTradePDA(tradeId);

      const tx = await this.program.methods
        .cancelTrade({
          reason: reason || '',
        })
        .accounts({
          trade: tradePDA,
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
   * Dispute a trade
   */
  async disputeTrade(
    tradeId: BN,
    reason: string,
    disputant: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      if (!Utils.validateStringLength(reason, 500)) {
        throw new Error('Dispute reason exceeds maximum length (500 characters)');
      }

      const [tradePDA] = this.pdaGenerator.getTradePDA(tradeId);

      const tx = await this.program.methods
        .disputeTrade({
          reason,
        })
        .accounts({
          trade: tradePDA,
          disputant: disputant,
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
   * Get a trade by ID
   */
  async getTrade(tradeId: BN): Promise<Trade | null> {
    try {
      const [tradePDA] = this.pdaGenerator.getTradePDA(tradeId);
      const tradeData = await this.program.account.trade.fetch(tradePDA);
      return this.mapTrade(tradeData);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get trade PDA address
   */
  getTradeAddress(tradeId: BN): PublicKey {
    const [tradePDA] = this.pdaGenerator.getTradePDA(tradeId);
    return tradePDA;
  }

  /**
   * Get escrow PDA for a trade
   */
  getEscrowPDA(tradeId: BN): [PublicKey, number] {
    // Assuming escrow uses trade_id as seed
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), tradeId.toArrayLike(Buffer, 'le', 8)],
      this.program.programId
    );
  }

  /**
   * Get escrow account for a trade
   */
  async getEscrow(tradeId: BN): Promise<Escrow | null> {
    try {
      const [escrowPDA] = this.getEscrowPDA(tradeId);
      const escrowData = await this.program.account.escrow.fetch(escrowPDA);
      return this.mapEscrow(escrowData);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get trade counter
   */
  async getTradeCounter(): Promise<TradeCounter | null> {
    try {
      const [tradeCounterPDA] = this.pdaGenerator.getTradeCounterPDA();
      const counterData = await this.program.account.tradeCounter.fetch(tradeCounterPDA);
      return {
        count: counterData.count,
        bump: counterData.bump,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get multiple trades by IDs
   */
  async getMultipleTrades(tradeIds: BN[]): Promise<(Trade | null)[]> {
    const trades = await Promise.all(
      tradeIds.map(id => this.getTrade(id))
    );
    return trades;
  }

  /**
   * Get all trades for a user (as maker or taker)
   */
  async getTradesForUser(
    user: PublicKey,
    filters: {
      role?: 'maker' | 'taker' | 'both';
      state?: TradeState;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Trade[]> {
    try {
      const allTrades = await this.program.account.trade.all();
      
      let userTrades = allTrades
        .map(account => this.mapTrade(account.account))
        .filter(trade => {
          const isMaker = trade.maker.equals(user);
          const isTaker = trade.taker.equals(user);
          
          if (filters.role === 'maker' && !isMaker) return false;
          if (filters.role === 'taker' && !isTaker) return false;
          if (filters.role !== 'both' && !isMaker && !isTaker) return false;
          
          if (filters.state && trade.state !== filters.state) return false;
          
          return true;
        });

      // Apply pagination
      const offset = filters.offset || 0;
      const limit = filters.limit || userTrades.length;
      userTrades = userTrades.slice(offset, offset + limit);

      return userTrades;
    } catch (error) {
      console.error('Error fetching trades for user:', error);
      return [];
    }
  }

  /**
   * Search trades with advanced filters
   */
  async searchTrades(filters: {
    maker?: PublicKey;
    taker?: PublicKey;
    offerId?: BN;
    state?: TradeState;
    minAmount?: BN;
    maxAmount?: BN;
    createdAfter?: BN;
    createdBefore?: BN;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    trades: Trade[];
    total: number;
  }> {
    try {
      const allTrades = await this.program.account.trade.all();
      
      let filteredTrades = allTrades
        .map(account => this.mapTrade(account.account))
        .filter(trade => {
          if (filters.maker && !trade.maker.equals(filters.maker)) {
            return false;
          }
          if (filters.taker && !trade.taker.equals(filters.taker)) {
            return false;
          }
          if (filters.offerId && !trade.offerId.eq(filters.offerId)) {
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
          if (filters.createdAfter && trade.createdAt.lt(filters.createdAfter)) {
            return false;
          }
          if (filters.createdBefore && trade.createdAt.gt(filters.createdBefore)) {
            return false;
          }
          return true;
        });

      const total = filteredTrades.length;
      const offset = filters.offset || 0;
      const limit = filters.limit || filteredTrades.length;
      
      filteredTrades = filteredTrades.slice(offset, offset + limit);

      return {
        trades: filteredTrades,
        total,
      };
    } catch (error) {
      console.error('Error searching trades:', error);
      return { trades: [], total: 0 };
    }
  }

  /**
   * Get active trades for a user
   */
  async getActiveTrades(user: PublicKey): Promise<Trade[]> {
    const activeStates = [
      TradeState.RequestCreated,
      TradeState.RequestAccepted,
      TradeState.EscrowFunded,
      TradeState.FiatDeposited,
      TradeState.EscrowDisputed
    ];

    const allActiveTrades: Trade[] = [];
    
    for (const state of activeStates) {
      const trades = await this.getTradesForUser(user, { state });
      allActiveTrades.push(...trades);
    }

    return allActiveTrades;
  }

  /**
   * Calculate trade statistics for a user
   */
  async getTradeStats(user: PublicKey): Promise<{
    totalTrades: number;
    completedTrades: number;
    canceledTrades: number;
    disputedTrades: number;
    activeTrades: number;
    successRate: number;
    totalVolume: string;
    averageTradeAmount: string;
  }> {
    try {
      const trades = await this.getTradesForUser(user);

      const stats = {
        totalTrades: trades.length,
        completedTrades: trades.filter(t => t.state === TradeState.EscrowReleased).length,
        canceledTrades: trades.filter(t => t.state === TradeState.RequestCanceled).length,
        disputedTrades: trades.filter(t => 
          t.state === TradeState.SettledForMaker || 
          t.state === TradeState.SettledForTaker
        ).length,
        activeTrades: 0,
        successRate: 0,
        totalVolume: '0',
        averageTradeAmount: '0',
      };

      const activeStates = [
        TradeState.RequestCreated,
        TradeState.RequestAccepted,
        TradeState.EscrowFunded,
        TradeState.FiatDeposited,
        TradeState.EscrowDisputed
      ];
      stats.activeTrades = trades.filter(t => activeStates.includes(t.state)).length;

      // Calculate success rate
      const totalCompleted = stats.completedTrades + stats.disputedTrades;
      if (totalCompleted > 0) {
        stats.successRate = (stats.completedTrades / totalCompleted) * 100;
      }

      // Calculate volume
      const totalVolume = trades.reduce((sum, trade) => sum.add(trade.amount), new BN(0));
      stats.totalVolume = Utils.formatAmount(totalVolume);

      // Calculate average trade amount
      if (trades.length > 0) {
        const averageAmount = totalVolume.div(new BN(trades.length));
        stats.averageTradeAmount = Utils.formatAmount(averageAmount);
      }

      return stats;
    } catch (error) {
      return {
        totalTrades: 0,
        completedTrades: 0,
        canceledTrades: 0,
        disputedTrades: 0,
        activeTrades: 0,
        successRate: 0,
        totalVolume: '0',
        averageTradeAmount: '0',
      };
    }
  }

  /**
   * Get trade state history
   */
  async getTradeStateHistory(tradeId: BN): Promise<Array<{
    state: TradeState;
    timestamp: Date;
    actor: PublicKey;
  }> | null> {
    const trade = await this.getTrade(tradeId);
    if (!trade || !trade.stateHistory) {
      return null;
    }

    return trade.stateHistory.map(item => ({
      state: item.state,
      timestamp: Utils.timestampToDate(item.timestamp),
      actor: item.actor,
    }));
  }

  /**
   * Check if trade is expired
   */
  isTradeExpired(trade: Trade): boolean {
    if (!trade.expirationTimestamp) {
      return false;
    }
    
    return Utils.isExpired(trade.expirationTimestamp);
  }

  /**
   * Get time remaining for a trade
   */
  getTradeTimeRemaining(trade: Trade): number {
    if (!trade.expirationTimestamp) {
      return Infinity;
    }
    
    return Utils.getTimeRemaining(trade.expirationTimestamp);
  }

  /**
   * Validate trade action
   */
  validateTradeAction(
    trade: Trade,
    action: string,
    user: PublicKey
  ): { valid: boolean; reason?: string } {
    // Check user authorization
    const isMaker = trade.maker.equals(user);
    const isTaker = trade.taker.equals(user);
    
    if (!isMaker && !isTaker) {
      return { valid: false, reason: 'User not authorized for this trade' };
    }

    // Check state-specific validations
    switch (action) {
      case 'accept':
        if (trade.state !== TradeState.RequestCreated) {
          return { valid: false, reason: 'Trade cannot be accepted in current state' };
        }
        if (!isMaker) {
          return { valid: false, reason: 'Only maker can accept trade' };
        }
        break;

      case 'fund_escrow':
        if (trade.state !== TradeState.RequestAccepted) {
          return { valid: false, reason: 'Escrow cannot be funded in current state' };
        }
        // Check if user is seller based on trade type
        break;

      case 'confirm_fiat':
        if (trade.state !== TradeState.EscrowFunded) {
          return { valid: false, reason: 'Fiat cannot be confirmed in current state' };
        }
        // Check if user is buyer based on trade type
        break;

      case 'release_escrow':
        if (trade.state !== TradeState.FiatDeposited) {
          return { valid: false, reason: 'Escrow cannot be released in current state' };
        }
        // Check if user is seller based on trade type
        break;

      case 'cancel':
        const cancelableStates = [
          TradeState.RequestCreated,
          TradeState.RequestAccepted
        ];
        if (!cancelableStates.includes(trade.state)) {
          return { valid: false, reason: 'Trade cannot be canceled in current state' };
        }
        break;

      case 'dispute':
        const disputeableStates = [
          TradeState.EscrowFunded,
          TradeState.FiatDeposited
        ];
        if (!disputeableStates.includes(trade.state)) {
          return { valid: false, reason: 'Trade cannot be disputed in current state' };
        }
        break;
    }

    // Check expiration
    if (this.isTradeExpired(trade)) {
      return { valid: false, reason: 'Trade has expired' };
    }

    return { valid: true };
  }

  // Private helper methods

  private validateCreateTradeParams(params: CreateTradeParams): void {
    if (params.amount.lte(new BN(0))) {
      throw new Error('Trade amount must be greater than zero');
    }

    if (params.offerId.lte(new BN(0))) {
      throw new Error('Invalid offer ID');
    }

    if (params.encryptedContactInfo && !Utils.validateStringLength(params.encryptedContactInfo, 500)) {
      throw new Error('Contact information exceeds maximum length (500 characters)');
    }
  }

  private mapTrade(tradeData: any): Trade {
    return {
      id: tradeData.id,
      offerId: tradeData.offerId,
      maker: tradeData.maker,
      taker: tradeData.taker,
      amount: tradeData.amount,
      state: this.mapTradeState(tradeData.state),
      encryptedContactInfo: tradeData.encryptedContactInfo || '',
      createdAt: tradeData.createdAt,
      updatedAt: tradeData.updatedAt,
      expirationTimestamp: tradeData.expirationTimestamp,
      stateHistory: tradeData.stateHistory,
      bump: tradeData.bump,
    };
  }

  private mapEscrow(escrowData: any): Escrow {
    return {
      tradeId: escrowData.tradeId,
      tokenMint: escrowData.tokenMint,
      amount: escrowData.amount,
      state: this.mapEscrowState(escrowData.state),
      createdAt: escrowData.createdAt,
      bump: escrowData.bump,
    };
  }

  private mapTradeState(state: any): TradeState {
    const stateKey = Object.keys(state)[0];
    switch (stateKey) {
      case 'requestCreated': return TradeState.RequestCreated;
      case 'requestAccepted': return TradeState.RequestAccepted;
      case 'escrowFunded': return TradeState.EscrowFunded;
      case 'fiatDeposited': return TradeState.FiatDeposited;
      case 'escrowReleased': return TradeState.EscrowReleased;
      case 'requestCanceled': return TradeState.RequestCanceled;
      case 'requestExpired': return TradeState.RequestExpired;
      case 'escrowDisputed': return TradeState.EscrowDisputed;
      case 'settledForMaker': return TradeState.SettledForMaker;
      case 'settledForTaker': return TradeState.SettledForTaker;
      default: throw new Error(`Unknown trade state: ${stateKey}`);
    }
  }

  private mapEscrowState(state: any): EscrowState {
    const stateKey = Object.keys(state)[0];
    switch (stateKey) {
      case 'created': return EscrowState.Created;
      case 'funded': return EscrowState.Funded;
      case 'released': return EscrowState.Released;
      case 'refunded': return EscrowState.Refunded;
      case 'disputed': return EscrowState.Disputed;
      default: throw new Error(`Unknown escrow state: ${stateKey}`);
    }
  }
}