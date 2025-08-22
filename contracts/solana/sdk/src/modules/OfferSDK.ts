import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program, BN } from '@coral-xyz/anchor';
import { LocalMoneyRPC } from '../rpc';
import { deriveOfferAddress, deriveOfferWithProfilePDAs } from '../pdas';
import { Offer } from '../types/offer';
import { PROGRAM_IDS } from '../generated';

const OfferIDL = require('../types/offer.json');

export interface CreateOfferParams {
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
}

export interface UpdateOfferParams {
  offerId: BN;
  rate?: number;
  minAmount?: number;
  maxAmount?: number;
  terms?: string;
  description?: string;
}

export interface OfferInfo {
  id: BN;
  owner: PublicKey;
  offerType: string;
  fiatCurrency: string;
  tokenMint: PublicKey;
  rate: BN;
  minAmount?: BN;
  maxAmount?: BN;
  fiatAmount?: BN;
  isActive: boolean;
  totalVolume: BN;
  completedTrades: number;
  terms?: string;
  description?: string;
  createdAt: BN;
  updatedAt: BN;
}

export class OfferSDK {
  private program: Program<Offer>;
  private rpc: LocalMoneyRPC;
  
  constructor(
    private connection: Connection,
    private wallet: Wallet,
    private programId: PublicKey = new PublicKey(PROGRAM_IDS.offer)
  ) {
    const provider = new AnchorProvider(connection, wallet, {});
    this.program = new Program<Offer>(OfferIDL, programId, provider);
    this.rpc = new LocalMoneyRPC(connection, wallet);
  }
  
  // Create a new offer
  async createOffer(params: CreateOfferParams): Promise<{
    signature: string;
    offerId: BN;
    offerAddress: PublicKey;
  }> {
    return await this.rpc.createOffer(params);
  }
  
  // Update an existing offer
  async updateOffer(params: UpdateOfferParams): Promise<string> {
    return await this.rpc.updateOffer(params);
  }
  
  // Activate an offer
  async activateOffer(offerId: BN): Promise<string> {
    return await this.rpc.toggleOffer({ offerId, activate: true });
  }
  
  // Deactivate an offer
  async deactivateOffer(offerId: BN): Promise<string> {
    return await this.rpc.toggleOffer({ offerId, activate: false });
  }
  
  // Close an offer permanently
  async closeOffer(offerId: BN): Promise<string> {
    return await this.rpc.closeOffer({ offerId });
  }
  
  // Fetch a single offer
  async getOffer(offerId: BN): Promise<OfferInfo> {
    const [offerAddress] = deriveOfferAddress(offerId, this.programId);
    const offer = await this.program.account.offer.fetch(offerAddress);
    
    return {
      id: offer.id,
      owner: offer.owner,
      offerType: Object.keys(offer.offerType)[0],
      fiatCurrency: Object.keys(offer.fiatCurrency)[0],
      tokenMint: offer.tokenMint,
      rate: offer.rate,
      minAmount: offer.minAmount,
      maxAmount: offer.maxAmount,
      fiatAmount: offer.fiatAmount,
      isActive: offer.isActive,
      totalVolume: offer.totalVolume,
      completedTrades: offer.completedTrades,
      terms: offer.terms,
      description: offer.description,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }
  
  // Get all offers by owner
  async getOffersByOwner(owner: PublicKey): Promise<OfferInfo[]> {
    const offers = await this.program.account.offer.all([
      {
        memcmp: {
          offset: 8 + 8, // After discriminator and id
          bytes: owner.toBase58(),
        },
      },
    ]);
    
    return offers.map(o => ({
      id: o.account.id,
      owner: o.account.owner,
      offerType: Object.keys(o.account.offerType)[0],
      fiatCurrency: Object.keys(o.account.fiatCurrency)[0],
      tokenMint: o.account.tokenMint,
      rate: o.account.rate,
      minAmount: o.account.minAmount,
      maxAmount: o.account.maxAmount,
      fiatAmount: o.account.fiatAmount,
      isActive: o.account.isActive,
      totalVolume: o.account.totalVolume,
      completedTrades: o.account.completedTrades,
      terms: o.account.terms,
      description: o.account.description,
      createdAt: o.account.createdAt,
      updatedAt: o.account.updatedAt,
    }));
  }
  
  // Get all active offers
  async getActiveOffers(): Promise<OfferInfo[]> {
    const offers = await this.program.account.offer.all();
    
    return offers
      .filter(o => o.account.isActive)
      .map(o => ({
        id: o.account.id,
        owner: o.account.owner,
        offerType: Object.keys(o.account.offerType)[0],
        fiatCurrency: Object.keys(o.account.fiatCurrency)[0],
        tokenMint: o.account.tokenMint,
        rate: o.account.rate,
        minAmount: o.account.minAmount,
        maxAmount: o.account.maxAmount,
        fiatAmount: o.account.fiatAmount,
        isActive: o.account.isActive,
        totalVolume: o.account.totalVolume,
        completedTrades: o.account.completedTrades,
        terms: o.account.terms,
        description: o.account.description,
        createdAt: o.account.createdAt,
        updatedAt: o.account.updatedAt,
      }));
  }
  
  // Get offers by type (buy/sell)
  async getOffersByType(offerType: 'buy' | 'sell'): Promise<OfferInfo[]> {
    const offers = await this.program.account.offer.all();
    
    return offers
      .filter(o => {
        const type = Object.keys(o.account.offerType)[0];
        return type === offerType;
      })
      .map(o => ({
        id: o.account.id,
        owner: o.account.owner,
        offerType: Object.keys(o.account.offerType)[0],
        fiatCurrency: Object.keys(o.account.fiatCurrency)[0],
        tokenMint: o.account.tokenMint,
        rate: o.account.rate,
        minAmount: o.account.minAmount,
        maxAmount: o.account.maxAmount,
        fiatAmount: o.account.fiatAmount,
        isActive: o.account.isActive,
        totalVolume: o.account.totalVolume,
        completedTrades: o.account.completedTrades,
        terms: o.account.terms,
        description: o.account.description,
        createdAt: o.account.createdAt,
        updatedAt: o.account.updatedAt,
      }));
  }
  
  // Get offers by fiat currency
  async getOffersByFiatCurrency(fiatCurrency: string): Promise<OfferInfo[]> {
    const offers = await this.program.account.offer.all();
    
    return offers
      .filter(o => {
        const currency = Object.keys(o.account.fiatCurrency)[0];
        return currency.toLowerCase() === fiatCurrency.toLowerCase();
      })
      .map(o => ({
        id: o.account.id,
        owner: o.account.owner,
        offerType: Object.keys(o.account.offerType)[0],
        fiatCurrency: Object.keys(o.account.fiatCurrency)[0],
        tokenMint: o.account.tokenMint,
        rate: o.account.rate,
        minAmount: o.account.minAmount,
        maxAmount: o.account.maxAmount,
        fiatAmount: o.account.fiatAmount,
        isActive: o.account.isActive,
        totalVolume: o.account.totalVolume,
        completedTrades: o.account.completedTrades,
        terms: o.account.terms,
        description: o.account.description,
        createdAt: o.account.createdAt,
        updatedAt: o.account.updatedAt,
      }));
  }
  
  // Get offers by token mint
  async getOffersByTokenMint(tokenMint: PublicKey): Promise<OfferInfo[]> {
    const offers = await this.program.account.offer.all([
      {
        memcmp: {
          offset: 8 + 8 + 32 + 1 + 1, // After discriminator, id, owner, offerType, fiatCurrency
          bytes: tokenMint.toBase58(),
        },
      },
    ]);
    
    return offers.map(o => ({
      id: o.account.id,
      owner: o.account.owner,
      offerType: Object.keys(o.account.offerType)[0],
      fiatCurrency: Object.keys(o.account.fiatCurrency)[0],
      tokenMint: o.account.tokenMint,
      rate: o.account.rate,
      minAmount: o.account.minAmount,
      maxAmount: o.account.maxAmount,
      fiatAmount: o.account.fiatAmount,
      isActive: o.account.isActive,
      totalVolume: o.account.totalVolume,
      completedTrades: o.account.completedTrades,
      terms: o.account.terms,
      description: o.account.description,
      createdAt: o.account.createdAt,
      updatedAt: o.account.updatedAt,
    }));
  }
  
  // Search offers with filters
  async searchOffers(filters: {
    offerType?: 'buy' | 'sell';
    fiatCurrency?: string;
    tokenMint?: PublicKey;
    minRate?: number;
    maxRate?: number;
    activeOnly?: boolean;
  }): Promise<OfferInfo[]> {
    let offers = await this.program.account.offer.all();
    
    // Apply filters
    if (filters.offerType) {
      offers = offers.filter(o => 
        Object.keys(o.account.offerType)[0] === filters.offerType
      );
    }
    
    if (filters.fiatCurrency) {
      offers = offers.filter(o => 
        Object.keys(o.account.fiatCurrency)[0].toLowerCase() === 
        filters.fiatCurrency!.toLowerCase()
      );
    }
    
    if (filters.tokenMint) {
      offers = offers.filter(o => 
        o.account.tokenMint.equals(filters.tokenMint!)
      );
    }
    
    if (filters.minRate) {
      offers = offers.filter(o => 
        o.account.rate.gte(new BN(filters.minRate!))
      );
    }
    
    if (filters.maxRate) {
      offers = offers.filter(o => 
        o.account.rate.lte(new BN(filters.maxRate!))
      );
    }
    
    if (filters.activeOnly) {
      offers = offers.filter(o => o.account.isActive);
    }
    
    return offers.map(o => ({
      id: o.account.id,
      owner: o.account.owner,
      offerType: Object.keys(o.account.offerType)[0],
      fiatCurrency: Object.keys(o.account.fiatCurrency)[0],
      tokenMint: o.account.tokenMint,
      rate: o.account.rate,
      minAmount: o.account.minAmount,
      maxAmount: o.account.maxAmount,
      fiatAmount: o.account.fiatAmount,
      isActive: o.account.isActive,
      totalVolume: o.account.totalVolume,
      completedTrades: o.account.completedTrades,
      terms: o.account.terms,
      description: o.account.description,
      createdAt: o.account.createdAt,
      updatedAt: o.account.updatedAt,
    }));
  }
  
  // Check if user can modify offer
  async canModifyOffer(offerId: BN): Promise<boolean> {
    try {
      const offer = await this.getOffer(offerId);
      return offer.owner.equals(this.wallet.publicKey);
    } catch {
      return false;
    }
  }
  
  // Get all PDAs for an offer
  getOfferWithProfilePDAs(offerId: BN, owner: PublicKey) {
    return deriveOfferWithProfilePDAs(
      offerId,
      owner,
      this.programId,
      new PublicKey(PROGRAM_IDS.profile)
    );
  }
}