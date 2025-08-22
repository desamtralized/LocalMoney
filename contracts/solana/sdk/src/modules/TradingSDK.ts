import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program, BN } from '@coral-xyz/anchor';
import * as instructions from '../instructions/trade';
import * as transactions from '../transactions/trading-flow';
import { LocalMoneyRPC } from '../rpc';
import { deriveTradeAddress, deriveEscrowAddress, deriveAllTradePDAs } from '../pdas';
import { Trade } from '../types/trade';
import { PROGRAM_IDS } from '../generated';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const TradeIDL = require('../types/trade.json');

export interface CreateTradeParams {
  offerId: number;
  amount: number;
  buyerContact: string;
  expiryDuration?: number;
  arbitrator?: PublicKey;
}

export interface TradeInfo {
  id: BN;
  buyer: PublicKey;
  seller: PublicKey;
  offerId: BN;
  amount: BN;
  lockedPrice: BN;
  state: string;
  createdAt: BN;
  expiresAt: BN;
  arbitrator?: PublicKey;
}

export class TradingSDK {
  private program: Program<Trade>;
  private rpc: LocalMoneyRPC;
  
  constructor(
    private connection: Connection,
    private wallet: Wallet,
    private programId: PublicKey = new PublicKey(PROGRAM_IDS.trade)
  ) {
    const provider = new AnchorProvider(connection, wallet, {});
    this.program = new Program<Trade>(TradeIDL, programId, provider);
    this.rpc = new LocalMoneyRPC(connection, wallet);
  }
  
  // Create a new trade
  async createTrade(params: CreateTradeParams): Promise<{
    signature: string;
    tradeId: BN;
    tradeAddress: PublicKey;
  }> {
    return await this.rpc.createTrade({
      offerId: params.offerId,
      amount: params.amount,
      buyerContact: params.buyerContact,
      expiryDuration: params.expiryDuration,
      arbitrator: params.arbitrator,
    });
  }
  
  // Accept a trade request
  async acceptTrade(tradeId: BN): Promise<string> {
    return await this.rpc.acceptTrade({ tradeId });
  }
  
  // Fund the escrow
  async fundEscrow(tradeId: BN, amount: BN, tokenMint: PublicKey): Promise<string> {
    return await this.rpc.fundEscrow({ tradeId, amount, tokenMint });
  }
  
  // Mark fiat as deposited
  async markFiatDeposited(tradeId: BN): Promise<string> {
    const [tradeAddress] = deriveTradeAddress(tradeId);
    
    const provider = new AnchorProvider(this.connection, this.wallet, {});
    const program = new Program<Trade>(TradeIDL, this.programId, provider);
    
    const tx = await program.methods
      .markFiatDeposited(tradeId)
      .accounts({
        trade: tradeAddress,
        buyer: this.wallet.publicKey,
      })
      .rpc();
    
    return tx;
  }
  
  // Release funds from escrow
  async releaseFunds(
    tradeId: BN,
    buyer: PublicKey,
    tokenMint: PublicKey,
    hubConfig: PublicKey,
    hubFeeAccount: PublicKey
  ): Promise<string> {
    return await this.rpc.releaseEscrow({
      tradeId,
      buyer,
      tokenMint,
      hubConfig,
      hubFeeAccount,
    });
  }
  
  // Refund escrow (in case of dispute)
  async refundEscrow(tradeId: BN, tokenMint: PublicKey): Promise<string> {
    const [tradeAddress] = deriveTradeAddress(tradeId);
    const [escrowAddress] = deriveEscrowAddress(tradeId);
    const sellerTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      this.wallet.publicKey
    );
    
    const provider = new AnchorProvider(this.connection, this.wallet, {});
    const program = new Program<Trade>(TradeIDL, this.programId, provider);
    
    // Fetch trade to get buyer
    const trade = await program.account.trade.fetch(tradeAddress);
    
    const tx = await program.methods
      .refundEscrow(tradeId)
      .accounts({
        trade: tradeAddress,
        escrow: escrowAddress,
        seller: this.wallet.publicKey,
        sellerTokenAccount,
        buyer: trade.buyer,
        tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      })
      .rpc();
    
    return tx;
  }
  
  // Cancel a trade request
  async cancelRequest(tradeId: BN): Promise<string> {
    const [tradeAddress] = deriveTradeAddress(tradeId);
    
    const provider = new AnchorProvider(this.connection, this.wallet, {});
    const program = new Program<Trade>(TradeIDL, this.programId, provider);
    
    const tx = await program.methods
      .cancelRequest(tradeId)
      .accounts({
        trade: tradeAddress,
        buyer: this.wallet.publicKey,
      })
      .rpc();
    
    return tx;
  }
  
  // Fetch a single trade
  async getTrade(tradeId: BN): Promise<TradeInfo> {
    const [tradeAddress] = deriveTradeAddress(tradeId);
    const trade = await this.program.account.trade.fetch(tradeAddress);
    
    return {
      id: trade.id,
      buyer: trade.buyer,
      seller: trade.seller,
      offerId: trade.offerId,
      amount: trade.amount,
      lockedPrice: trade.lockedPrice,
      state: Object.keys(trade.state)[0],
      createdAt: trade.createdAt,
      expiresAt: trade.expiresAt,
      arbitrator: trade.arbitrator,
    };
  }
  
  // Get all trades by buyer
  async getTradesByBuyer(buyer: PublicKey): Promise<TradeInfo[]> {
    const trades = await this.program.account.trade.all([
      {
        memcmp: {
          offset: 8 + 8, // After discriminator and id
          bytes: buyer.toBase58(),
        },
      },
    ]);
    
    return trades.map(t => ({
      id: t.account.id,
      buyer: t.account.buyer,
      seller: t.account.seller,
      offerId: t.account.offerId,
      amount: t.account.amount,
      lockedPrice: t.account.lockedPrice,
      state: Object.keys(t.account.state)[0],
      createdAt: t.account.createdAt,
      expiresAt: t.account.expiresAt,
      arbitrator: t.account.arbitrator,
    }));
  }
  
  // Get all trades by seller
  async getTradesBySeller(seller: PublicKey): Promise<TradeInfo[]> {
    const trades = await this.program.account.trade.all([
      {
        memcmp: {
          offset: 8 + 8 + 32, // After discriminator, id, and buyer
          bytes: seller.toBase58(),
        },
      },
    ]);
    
    return trades.map(t => ({
      id: t.account.id,
      buyer: t.account.buyer,
      seller: t.account.seller,
      offerId: t.account.offerId,
      amount: t.account.amount,
      lockedPrice: t.account.lockedPrice,
      state: Object.keys(t.account.state)[0],
      createdAt: t.account.createdAt,
      expiresAt: t.account.expiresAt,
      arbitrator: t.account.arbitrator,
    }));
  }
  
  // Get active trades (not completed/cancelled)
  async getActiveTrades(): Promise<TradeInfo[]> {
    const trades = await this.program.account.trade.all();
    
    return trades
      .filter(t => {
        const state = Object.keys(t.account.state)[0];
        return state !== 'escrowReleased' &&
               state !== 'escrowRefunded' &&
               state !== 'requestCancelled';
      })
      .map(t => ({
        id: t.account.id,
        buyer: t.account.buyer,
        seller: t.account.seller,
        offerId: t.account.offerId,
        amount: t.account.amount,
        lockedPrice: t.account.lockedPrice,
        state: Object.keys(t.account.state)[0],
        createdAt: t.account.createdAt,
        expiresAt: t.account.expiresAt,
        arbitrator: t.account.arbitrator,
      }));
  }
  
  // Get expired trades
  async getExpiredTrades(): Promise<TradeInfo[]> {
    const now = new BN(Date.now() / 1000);
    const trades = await this.program.account.trade.all();
    
    return trades
      .filter(t => t.account.expiresAt.lt(now))
      .map(t => ({
        id: t.account.id,
        buyer: t.account.buyer,
        seller: t.account.seller,
        offerId: t.account.offerId,
        amount: t.account.amount,
        lockedPrice: t.account.lockedPrice,
        state: Object.keys(t.account.state)[0],
        createdAt: t.account.createdAt,
        expiresAt: t.account.expiresAt,
        arbitrator: t.account.arbitrator,
      }));
  }
  
  // Check if a trade can be cancelled
  async canCancelTrade(tradeId: BN): Promise<boolean> {
    try {
      const trade = await this.getTrade(tradeId);
      const state = trade.state;
      
      // Can only cancel if in RequestCreated state and caller is buyer
      return state === 'requestCreated' && 
             trade.buyer.equals(this.wallet.publicKey);
    } catch {
      return false;
    }
  }
  
  // Check if a trade can be accepted
  async canAcceptTrade(tradeId: BN): Promise<boolean> {
    try {
      const trade = await this.getTrade(tradeId);
      const state = trade.state;
      
      // Can only accept if in RequestCreated state and caller is seller
      return state === 'requestCreated' && 
             trade.seller.equals(this.wallet.publicKey);
    } catch {
      return false;
    }
  }
  
  // Get all PDAs for a trade
  getAllTradePDAs(tradeId: BN, includeVrf: boolean = false) {
    return deriveAllTradePDAs(tradeId, includeVrf, this.programId);
  }
}