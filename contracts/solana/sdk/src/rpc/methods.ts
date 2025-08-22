import { 
  Connection, 
  PublicKey, 
  Transaction,
  TransactionSignature,
  sendAndConfirmTransaction,
  Commitment,
  SendOptions,
  Keypair
} from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as transactions from '../transactions';
import { confirmTransaction, TransactionError } from './confirmations';
import { deriveOfferAddress, deriveTradeAddress, deriveProfileAddress, deriveEscrowAddress } from '../pdas';
import { getAssociatedTokenAddress } from '@solana/spl-token';

export interface RpcOptions {
  commitment?: Commitment;
  skipPreflight?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export class LocalMoneyRPC {
  constructor(
    private connection: Connection,
    private wallet: Wallet,
    private options: RpcOptions = {}
  ) {
    this.options = {
      commitment: options.commitment || 'confirmed',
      skipPreflight: options.skipPreflight || false,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
    };
  }
  
  // Trade Methods
  async createTrade(params: {
    offerId: number;
    amount: number;
    buyerContact: string;
    expiryDuration?: number;
    arbitrator?: PublicKey;
  }): Promise<{
    signature: string;
    tradeId: BN;
    tradeAddress: PublicKey;
  }> {
    const tradeId = new BN(Date.now());
    const [tradeAddress] = deriveTradeAddress(tradeId);
    const [offerAddress] = deriveOfferAddress(new BN(params.offerId));
    
    // TODO: Fetch offer details to get seller and token mint
    // For now, we'll assume these are provided or fetched elsewhere
    const seller = PublicKey.default; // This should be fetched from offer
    const tokenMint = PublicKey.default; // This should be fetched from offer
    const hubConfig = PublicKey.default; // This should be the hub config PDA
    
    const tx = await transactions.buildCreateTradeTransaction(
      this.connection,
      this.wallet,
      {
        tradeId,
        offerId: new BN(params.offerId),
        amount: new BN(params.amount),
        buyer: this.wallet.publicKey,
        seller,
        offer: offerAddress,
        tokenMint,
        hubConfig,
        buyerContact: params.buyerContact,
        lockedPrice: new BN(0), // Should be fetched from price oracle
        expiryDuration: new BN(params.expiryDuration || 86400),
        arbitrator: params.arbitrator || PublicKey.default,
      }
    );
    
    const signature = await this.sendAndConfirmTransaction(tx);
    
    return { signature, tradeId, tradeAddress };
  }
  
  async acceptTrade(params: {
    tradeId: BN;
  }): Promise<string> {
    const [tradeAddress] = deriveTradeAddress(params.tradeId);
    const [sellerProfile] = deriveProfileAddress(this.wallet.publicKey);
    
    const tx = await transactions.buildAcceptTradeTransaction(
      this.connection,
      this.wallet,
      {
        tradeId: params.tradeId,
        trade: tradeAddress,
        seller: this.wallet.publicKey,
        sellerProfile,
      }
    );
    
    return await this.sendAndConfirmTransaction(tx);
  }
  
  async fundEscrow(params: {
    tradeId: BN;
    amount: BN;
    tokenMint: PublicKey;
  }): Promise<string> {
    const [tradeAddress] = deriveTradeAddress(params.tradeId);
    const [escrowAddress] = deriveEscrowAddress(params.tradeId);
    const sellerTokenAccount = await getAssociatedTokenAddress(
      params.tokenMint,
      this.wallet.publicKey
    );
    
    const tx = await transactions.buildFundEscrowTransaction(
      this.connection,
      this.wallet,
      {
        tradeId: params.tradeId,
        trade: tradeAddress,
        escrow: escrowAddress,
        seller: this.wallet.publicKey,
        sellerTokenAccount,
        amount: params.amount,
      }
    );
    
    return await this.sendAndConfirmTransaction(tx);
  }
  
  async releaseEscrow(params: {
    tradeId: BN;
    buyer: PublicKey;
    tokenMint: PublicKey;
    hubConfig: PublicKey;
    hubFeeAccount: PublicKey;
  }): Promise<string> {
    const [tradeAddress] = deriveTradeAddress(params.tradeId);
    const [escrowAddress] = deriveEscrowAddress(params.tradeId);
    const buyerTokenAccount = await getAssociatedTokenAddress(
      params.tokenMint,
      params.buyer
    );
    
    const tx = await transactions.buildReleaseEscrowTransaction(
      this.connection,
      this.wallet,
      {
        tradeId: params.tradeId,
        trade: tradeAddress,
        escrow: escrowAddress,
        seller: this.wallet.publicKey,
        buyer: params.buyer,
        buyerTokenAccount,
        hubConfig: params.hubConfig,
        hubFeeAccount: params.hubFeeAccount,
      }
    );
    
    return await this.sendAndConfirmTransaction(tx);
  }
  
  // Offer Methods
  async createOffer(params: {
    offerType: 'buy' | 'sell';
    fiatCurrency: string;
    rate: number;
    minAmount?: number;
    maxAmount?: number;
    fiatAmount?: number;
    tokenMint: PublicKey;
    terms?: string;
    description?: string;
    hubConfig: PublicKey;
  }): Promise<{
    signature: string;
    offerId: BN;
    offerAddress: PublicKey;
  }> {
    const offerId = new BN(Date.now());
    const [offerAddress] = deriveOfferAddress(offerId);
    
    // Convert string enums to proper format
    const offerType = { [params.offerType]: {} };
    const fiatCurrency = { [params.fiatCurrency.toLowerCase()]: {} };
    
    const tx = await transactions.buildCreateOfferTransaction(
      this.connection,
      this.wallet,
      {
        offerId,
        owner: this.wallet.publicKey,
        tokenMint: params.tokenMint,
        hubConfig: params.hubConfig,
        offerType,
        fiatCurrency,
        rate: new BN(params.rate),
        minAmount: params.minAmount ? new BN(params.minAmount) : undefined,
        maxAmount: params.maxAmount ? new BN(params.maxAmount) : undefined,
        fiatAmount: params.fiatAmount ? new BN(params.fiatAmount) : undefined,
        terms: params.terms,
        description: params.description,
      }
    );
    
    const signature = await this.sendAndConfirmTransaction(tx);
    
    return { signature, offerId, offerAddress };
  }
  
  async updateOffer(params: {
    offerId: BN;
    rate?: number;
    minAmount?: number;
    maxAmount?: number;
    terms?: string;
    description?: string;
  }): Promise<string> {
    const tx = await transactions.buildUpdateOfferTransaction(
      this.connection,
      this.wallet,
      {
        offerId: params.offerId,
        owner: this.wallet.publicKey,
        rate: params.rate ? new BN(params.rate) : undefined,
        minAmount: params.minAmount ? new BN(params.minAmount) : undefined,
        maxAmount: params.maxAmount ? new BN(params.maxAmount) : undefined,
        terms: params.terms,
        description: params.description,
      }
    );
    
    return await this.sendAndConfirmTransaction(tx);
  }
  
  async toggleOffer(params: {
    offerId: BN;
    activate: boolean;
  }): Promise<string> {
    const tx = await transactions.buildToggleOfferTransaction(
      this.connection,
      this.wallet,
      {
        offerId: params.offerId,
        owner: this.wallet.publicKey,
        activate: params.activate,
      }
    );
    
    return await this.sendAndConfirmTransaction(tx);
  }
  
  async closeOffer(params: {
    offerId: BN;
  }): Promise<string> {
    const tx = await transactions.buildCloseOfferTransaction(
      this.connection,
      this.wallet,
      {
        offerId: params.offerId,
        owner: this.wallet.publicKey,
      }
    );
    
    return await this.sendAndConfirmTransaction(tx);
  }
  
  // Profile Methods
  async createProfile(params: {
    username: string;
    region: string;
    contactInfo?: string;
  }): Promise<{
    signature: string;
    profileAddress: PublicKey;
  }> {
    const [profileAddress] = deriveProfileAddress(this.wallet.publicKey);
    
    const tx = await transactions.buildCreateProfileTransaction(
      this.connection,
      this.wallet,
      {
        user: this.wallet.publicKey,
        username: params.username,
        region: params.region,
        contactInfo: params.contactInfo,
      }
    );
    
    const signature = await this.sendAndConfirmTransaction(tx);
    
    return { signature, profileAddress };
  }
  
  async updateProfile(params: {
    username?: string;
    region?: string;
    contactInfo?: string;
  }): Promise<string> {
    const tx = await transactions.buildUpdateProfileTransaction(
      this.connection,
      this.wallet,
      {
        user: this.wallet.publicKey,
        username: params.username,
        region: params.region,
        contactInfo: params.contactInfo,
      }
    );
    
    return await this.sendAndConfirmTransaction(tx);
  }
  
  // Complex Flow Methods
  async executeTradingFlow(params: {
    offerId: number;
    amount: number;
    buyerContact: string;
    sellerProfile: PublicKey;
    tokenMint: PublicKey;
    hubConfig: PublicKey;
    hubFeeAccount: PublicKey;
  }): Promise<{
    signatures: string[];
    tradeId: BN;
    tradeAddress: PublicKey;
  }> {
    const tradeId = new BN(Date.now());
    const [tradeAddress] = deriveTradeAddress(tradeId);
    const [offerAddress] = deriveOfferAddress(new BN(params.offerId));
    const [escrowAddress] = deriveEscrowAddress(tradeId);
    
    // Get token accounts
    const sellerTokenAccount = await getAssociatedTokenAddress(
      params.tokenMint,
      this.wallet.publicKey
    );
    const buyerTokenAccount = await getAssociatedTokenAddress(
      params.tokenMint,
      this.wallet.publicKey
    );
    
    const txs = await transactions.buildCompleteTradingFlowTransactions(
      this.connection,
      this.wallet,
      {
        tradeId,
        offerId: new BN(params.offerId),
        amount: new BN(params.amount),
        buyer: this.wallet.publicKey,
        seller: this.wallet.publicKey, // Should be fetched from offer
        offer: offerAddress,
        tokenMint: params.tokenMint,
        hubConfig: params.hubConfig,
        buyerContact: params.buyerContact,
        lockedPrice: new BN(0), // Should be fetched from price oracle
        expiryDuration: new BN(86400),
        arbitrator: PublicKey.default,
        sellerProfile: params.sellerProfile,
        sellerTokenAccount,
        buyerTokenAccount,
        hubFeeAccount: params.hubFeeAccount,
      }
    );
    
    const signatures: string[] = [];
    
    for (const tx of txs) {
      const sig = await this.sendAndConfirmTransaction(tx);
      signatures.push(sig);
      
      // Wait for confirmation before next transaction
      await this.confirmTransaction(sig);
    }
    
    return { signatures, tradeId, tradeAddress };
  }
  
  // Helper Methods
  private async sendAndConfirmTransaction(
    transaction: Transaction,
    signers: Keypair[] = []
  ): Promise<string> {
    let retries = 0;
    const maxRetries = this.options.maxRetries || 3;
    
    while (retries < maxRetries) {
      try {
        // Sign with wallet
        transaction.partialSign(this.wallet.payer);
        
        // Sign with additional signers if provided
        if (signers.length > 0) {
          transaction.partialSign(...signers);
        }
        
        // Send and confirm
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [this.wallet.payer, ...signers],
          {
            commitment: this.options.commitment,
            skipPreflight: this.options.skipPreflight,
          }
        );
        
        return signature;
      } catch (error: any) {
        retries++;
        if (retries >= maxRetries) {
          throw new TransactionError(
            `Failed to send transaction after ${maxRetries} retries`,
            error
          );
        }
        
        // Wait before retry with exponential backoff
        const delay = this.options.retryDelay || 1000;
        await new Promise(resolve => setTimeout(resolve, delay * retries));
      }
    }
    
    throw new TransactionError('Max retries exceeded');
  }
  
  async confirmTransaction(signature: string): Promise<void> {
    await confirmTransaction(
      this.connection,
      signature,
      this.options.commitment || 'confirmed'
    );
  }
  
  // Batch operations
  async sendBatch(transactions: Transaction[]): Promise<string[]> {
    const signatures: string[] = [];
    
    for (const tx of transactions) {
      const sig = await this.sendAndConfirmTransaction(tx);
      signatures.push(sig);
    }
    
    return signatures;
  }
}