import { Connection, PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import * as bs58 from 'bs58';

export interface ProtocolMetrics {
  totalTrades: number;
  activeTrades: number;
  completedTrades: number;
  disputedTrades: number;
  totalVolume: bigint;
  averageTradeSize: number;
  stateDistribution: Map<string, number>;
  userMetrics: Map<string, UserMetrics>;
}

export interface UserMetrics {
  userId: string;
  totalTrades: number;
  completedTrades: number;
  disputedTrades: number;
  totalVolume: bigint;
  reputation: number;
  lastActive: number;
}

export interface HistoricalData {
  period: { start: number; end: number };
  trades: TradeSnapshot[];
  volumeOverTime: Map<number, bigint>;
}

export interface TradeSnapshot {
  id: string;
  createdAt: number;
  amount: bigint;
  state: string;
}

export interface AccountHealth {
  program: string;
  address: PublicKey;
  dataSize: number;
  lamports: number;
  rentExempt: number;
  isHealthy: boolean;
  utilizationRatio: number;
}

export class AnalyticsSDK {
  constructor(
    private connection: Connection,
    private programs: Map<string, Program>
  ) {}
  
  async getProtocolMetrics(): Promise<ProtocolMetrics> {
    const tradeProgram = this.programs.get('trade');
    if (!tradeProgram) throw new Error('Trade program not found');
    
    const trades = await tradeProgram.account.trade.all();
    
    const metrics: ProtocolMetrics = {
      totalTrades: trades.length,
      activeTrades: 0,
      completedTrades: 0,
      disputedTrades: 0,
      totalVolume: BigInt(0),
      averageTradeSize: 0,
      stateDistribution: new Map<string, number>(),
      userMetrics: new Map<string, UserMetrics>(),
    };
    
    // Process each trade
    for (const trade of trades) {
      const account = trade.account as any;
      
      // Count by state
      if (!this.isTerminalState(account.state)) {
        metrics.activeTrades++;
      }
      
      if (account.state === 'EscrowReleased') {
        metrics.completedTrades++;
      }
      
      if (account.state === 'DisputeOpened' || account.state === 'DisputeResolved') {
        metrics.disputedTrades++;
      }
      
      // Calculate volume
      metrics.totalVolume += BigInt(account.amount.toString());
      
      // State distribution
      const stateStr = this.stateToString(account.state);
      metrics.stateDistribution.set(
        stateStr,
        (metrics.stateDistribution.get(stateStr) || 0) + 1
      );
      
      // Update user metrics
      this.updateUserMetrics(metrics.userMetrics, account);
    }
    
    // Calculate averages
    if (metrics.totalTrades > 0) {
      metrics.averageTradeSize = Number(metrics.totalVolume / BigInt(metrics.totalTrades));
    }
    
    return metrics;
  }
  
  async getHistoricalData(
    startTime: number,
    endTime: number
  ): Promise<HistoricalData> {
    const tradeProgram = this.programs.get('trade');
    if (!tradeProgram) throw new Error('Trade program not found');
    
    // Query trades within time range
    const trades = await tradeProgram.account.trade.all([
      {
        memcmp: {
          offset: 8 + 8 + 8 + 32 + 32 + 32 + 32 + 8 + 1 + 8 + 1, // created_at offset
          bytes: bs58.encode(Buffer.from([startTime])),
        },
      },
    ]);
    
    const snapshots: TradeSnapshot[] = [];
    const volumeOverTime = new Map<number, bigint>();
    
    for (const trade of trades) {
      const account = trade.account as any;
      const createdAt = Number(account.createdAt);
      
      if (createdAt >= startTime && createdAt <= endTime) {
        snapshots.push({
          id: account.id.toString(),
          createdAt,
          amount: BigInt(account.amount.toString()),
          state: this.stateToString(account.state),
        });
        
        // Aggregate volume by day
        const day = Math.floor(createdAt / 86400) * 86400;
        const currentVolume = volumeOverTime.get(day) || BigInt(0);
        volumeOverTime.set(day, currentVolume + BigInt(account.amount.toString()));
      }
    }
    
    return {
      period: { start: startTime, end: endTime },
      trades: snapshots,
      volumeOverTime,
    };
  }
  
  async monitorAccountHealth(): Promise<AccountHealth[]> {
    const results: AccountHealth[] = [];
    
    for (const [name, program] of this.programs) {
      const accountType = this.getAccountType(name);
      if (!accountType) continue;
      
      const accounts = await (program.account as any)[accountType].all();
      
      for (const account of accounts) {
        const info = await this.connection.getAccountInfo(account.publicKey);
        
        if (!info) continue;
        
        const rentExempt = await this.connection.getMinimumBalanceForRentExemption(
          info.data.length
        );
        
        const health: AccountHealth = {
          program: name,
          address: account.publicKey,
          dataSize: info.data.length,
          lamports: info.lamports,
          rentExempt,
          isHealthy: info.lamports >= rentExempt,
          utilizationRatio: this.calculateUtilization(info.data),
        };
        
        results.push(health);
      }
    }
    
    return results;
  }
  
  async getActiveUserCount(timeWindow: number = 86400): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - timeWindow;
    
    const tradeProgram = this.programs.get('trade');
    if (!tradeProgram) return 0;
    
    const trades = await tradeProgram.account.trade.all();
    const activeUsers = new Set<string>();
    
    for (const trade of trades) {
      const account = trade.account as any;
      if (Number(account.createdAt) >= cutoff) {
        activeUsers.add(account.buyer.toString());
        activeUsers.add(account.seller.toString());
      }
    }
    
    return activeUsers.size;
  }
  
  async getTradeVelocity(): Promise<number> {
    // Calculate trades per hour over last 24 hours
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;
    
    const historical = await this.getHistoricalData(dayAgo, now);
    return historical.trades.length / 24;
  }
  
  async getAverageDisputeResolutionTime(): Promise<number | null> {
    const tradeProgram = this.programs.get('trade');
    if (!tradeProgram) return null;
    
    const trades = await tradeProgram.account.trade.all();
    const resolutionTimes: number[] = [];
    
    for (const trade of trades) {
      const account = trade.account as any;
      
      if (account.state === 'DisputeResolved' && account.stateHistory) {
        // Find dispute opened and resolved timestamps
        const history = account.stateHistory.items || [];
        let disputeOpenedTime: number | null = null;
        let disputeResolvedTime: number | null = null;
        
        for (const item of history) {
          if (!item) continue;
          if (item.state === 'DisputeOpened') {
            disputeOpenedTime = Number(item.timestamp);
          }
          if (item.state === 'DisputeResolved') {
            disputeResolvedTime = Number(item.timestamp);
          }
        }
        
        if (disputeOpenedTime && disputeResolvedTime) {
          resolutionTimes.push(disputeResolvedTime - disputeOpenedTime);
        }
      }
    }
    
    if (resolutionTimes.length === 0) return null;
    
    const sum = resolutionTimes.reduce((a, b) => a + b, 0);
    return sum / resolutionTimes.length;
  }
  
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'critical';
    issues: string[];
    metrics: Map<string, any>;
  }> {
    const issues: string[] = [];
    const metrics = new Map<string, any>();
    
    // Check account health
    const accountHealth = await this.monitorAccountHealth();
    const unhealthyAccounts = accountHealth.filter(a => !a.isHealthy);
    
    if (unhealthyAccounts.length > 0) {
      issues.push(`${unhealthyAccounts.length} accounts below rent exemption`);
    }
    
    metrics.set('unhealthyAccounts', unhealthyAccounts.length);
    metrics.set('totalAccounts', accountHealth.length);
    
    // Check trade velocity
    const velocity = await this.getTradeVelocity();
    metrics.set('tradeVelocity', velocity);
    
    if (velocity < 1) {
      issues.push('Low trade velocity detected');
    }
    
    // Check active users
    const activeUsers = await this.getActiveUserCount();
    metrics.set('activeUsers24h', activeUsers);
    
    if (activeUsers < 10) {
      issues.push('Low user activity');
    }
    
    // Determine overall status
    let status: 'healthy' | 'degraded' | 'critical';
    if (issues.length === 0) {
      status = 'healthy';
    } else if (issues.length < 3) {
      status = 'degraded';
    } else {
      status = 'critical';
    }
    
    return { status, issues, metrics };
  }
  
  private updateUserMetrics(userMetrics: Map<string, UserMetrics>, trade: any): void {
    for (const userId of [trade.buyer.toString(), trade.seller.toString()]) {
      let metrics = userMetrics.get(userId);
      
      if (!metrics) {
        metrics = {
          userId,
          totalTrades: 0,
          completedTrades: 0,
          disputedTrades: 0,
          totalVolume: BigInt(0),
          reputation: 0,
          lastActive: 0,
        };
        userMetrics.set(userId, metrics);
      }
      
      metrics.totalTrades++;
      metrics.totalVolume += BigInt(trade.amount.toString());
      metrics.lastActive = Math.max(metrics.lastActive, Number(trade.createdAt));
      
      if (trade.state === 'EscrowReleased') {
        metrics.completedTrades++;
      }
      
      if (trade.state === 'DisputeOpened' || trade.state === 'DisputeResolved') {
        metrics.disputedTrades++;
      }
    }
  }
  
  private isTerminalState(state: any): boolean {
    const terminalStates = ['EscrowReleased', 'EscrowRefunded', 'RequestCancelled'];
    const stateStr = this.stateToString(state);
    return terminalStates.includes(stateStr);
  }
  
  private stateToString(state: any): string {
    if (typeof state === 'string') return state;
    if (state.escrowReleased) return 'EscrowReleased';
    if (state.escrowRefunded) return 'EscrowRefunded';
    if (state.requestCancelled) return 'RequestCancelled';
    if (state.requestCreated) return 'RequestCreated';
    if (state.requestAccepted) return 'RequestAccepted';
    if (state.escrowFunded) return 'EscrowFunded';
    if (state.fiatDeposited) return 'FiatDeposited';
    if (state.disputeOpened) return 'DisputeOpened';
    if (state.disputeResolved) return 'DisputeResolved';
    return 'Unknown';
  }
  
  private getAccountType(programName: string): string | null {
    const mapping: Record<string, string> = {
      trade: 'trade',
      offer: 'offer',
      profile: 'profile',
      price: 'priceData',
      hub: 'config',
    };
    return mapping[programName] || null;
  }
  
  private calculateUtilization(data: Buffer): number {
    // Calculate how much of the account data is actually used
    let lastNonZero = data.length - 1;
    
    while (lastNonZero >= 0 && data[lastNonZero] === 0) {
      lastNonZero--;
    }
    
    if (lastNonZero < 0) return 0;
    return (lastNonZero + 1) / data.length;
  }
}

// Export event listener for real-time monitoring
export class EventMonitor {
  constructor(
    private connection: Connection,
    private programId: PublicKey
  ) {}
  
  onTradeCreated(callback: (event: any) => void): number {
    return this.connection.onLogs(
      this.programId,
      (logs) => {
        if (logs.logs.some(log => log.includes('TradeCreatedEvent'))) {
          // Parse event data from logs
          const eventData = this.parseEventFromLogs(logs.logs);
          if (eventData) callback(eventData);
        }
      },
      'confirmed'
    );
  }
  
  onTradeCompleted(callback: (event: any) => void): number {
    return this.connection.onLogs(
      this.programId,
      (logs) => {
        if (logs.logs.some(log => log.includes('TradeCompletedEvent'))) {
          const eventData = this.parseEventFromLogs(logs.logs);
          if (eventData) callback(eventData);
        }
      },
      'confirmed'
    );
  }
  
  onDisputeOpened(callback: (event: any) => void): number {
    return this.connection.onLogs(
      this.programId,
      (logs) => {
        if (logs.logs.some(log => log.includes('DisputeOpened'))) {
          const eventData = this.parseEventFromLogs(logs.logs);
          if (eventData) callback(eventData);
        }
      },
      'confirmed'
    );
  }
  
  removeListener(listenerId: number): void {
    this.connection.removeOnLogsListener(listenerId);
  }
  
  private parseEventFromLogs(logs: string[]): any | null {
    // Parse Anchor event data from logs
    for (const log of logs) {
      if (log.includes('Program data:')) {
        try {
          const dataStr = log.split('Program data: ')[1];
          const data = bs58.decode(dataStr);
          // Parse event data based on discriminator
          return this.parseEventData(data);
        } catch (e) {
          console.error('Failed to parse event:', e);
        }
      }
    }
    return null;
  }
  
  private parseEventData(data: Buffer): any {
    // Simplified event parsing - in production would use proper IDL parsing
    return {
      timestamp: Date.now(),
      data: data.toString('hex'),
    };
  }
}