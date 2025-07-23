import { PublicKey, Connection } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import {
  Offer,
  OfferCounter,
  CreateOfferParams,
  UpdateOfferParams,
  TransactionResult,
  ProgramAddresses,
  FiatCurrency,
  OfferType,
  OfferState
} from '../types';
import { PDAGenerator, Utils } from '../utils';

/**
 * SDK for interacting with the LocalMoney Offer Program
 */
export class OfferSDK {
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
   * Create a new offer
   */
  async createOffer(params: CreateOfferParams): Promise<TransactionResult> {
    try {
      // Validate parameters
      this.validateCreateOfferParams(params);

      const [offerCounterPDA] = this.pdaGenerator.getOfferCounterPDA();
      
      // Get next offer ID
      const counter = await this.getOfferCounter();
      const nextOfferId = counter ? counter.count.add(new BN(1)) : new BN(1);
      const [offerPDA] = this.pdaGenerator.getOfferPDA(nextOfferId);

      const tx = await this.program.methods
        .createOffer({
          offerType: { [params.offerType.toLowerCase()]: {} },
          fiatCurrency: { [params.fiatCurrency.toLowerCase()]: {} },
          rate: params.rate,
          minAmount: params.minAmount,
          maxAmount: params.maxAmount,
          description: params.description,
        })
        .accounts({
          offer: offerPDA,
          offerCounter: offerCounterPDA,
          maker: params.maker || this.provider.wallet.publicKey,
          payer: this.provider.wallet.publicKey,
          systemProgram: PublicKey.default,
        })
        .rpc();

      return {
        signature: tx,
        success: true,
        data: { offerId: nextOfferId, address: offerPDA },
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
   * Update an existing offer
   */
  async updateOffer(
    offerId: BN,
    params: UpdateOfferParams,
    maker: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [offerPDA] = this.pdaGenerator.getOfferPDA(offerId);

      const tx = await this.program.methods
        .updateOffer({
          rate: params.rate || null,
          minAmount: params.minAmount || null,
          maxAmount: params.maxAmount || null,
          description: params.description || null,
        })
        .accounts({
          offer: offerPDA,
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
   * Close/archive an offer
   */
  async closeOffer(
    offerId: BN,
    maker: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [offerPDA] = this.pdaGenerator.getOfferPDA(offerId);

      const tx = await this.program.methods
        .closeOffer()
        .accounts({
          offer: offerPDA,
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
   * Pause an offer
   */
  async pauseOffer(
    offerId: BN,
    maker: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [offerPDA] = this.pdaGenerator.getOfferPDA(offerId);

      const tx = await this.program.methods
        .pauseOffer()
        .accounts({
          offer: offerPDA,
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
   * Activate a paused offer
   */
  async activateOffer(
    offerId: BN,
    maker: PublicKey = this.provider.wallet.publicKey
  ): Promise<TransactionResult> {
    try {
      const [offerPDA] = this.pdaGenerator.getOfferPDA(offerId);

      const tx = await this.program.methods
        .activateOffer()
        .accounts({
          offer: offerPDA,
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
   * Get an offer by ID
   */
  async getOffer(offerId: BN): Promise<Offer | null> {
    try {
      const [offerPDA] = this.pdaGenerator.getOfferPDA(offerId);
      const offerData = await this.program.account.offer.fetch(offerPDA);
      return this.mapOffer(offerData);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get offer PDA address
   */
  getOfferAddress(offerId: BN): PublicKey {
    const [offerPDA] = this.pdaGenerator.getOfferPDA(offerId);
    return offerPDA;
  }

  /**
   * Get offer counter
   */
  async getOfferCounter(): Promise<OfferCounter | null> {
    try {
      const [offerCounterPDA] = this.pdaGenerator.getOfferCounterPDA();
      const counterData = await this.program.account.offerCounter.fetch(offerCounterPDA);
      return {
        count: counterData.count,
        bump: counterData.bump,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get multiple offers by IDs
   */
  async getMultipleOffers(offerIds: BN[]): Promise<(Offer | null)[]> {
    const offers = await Promise.all(
      offerIds.map(id => this.getOffer(id))
    );
    return offers;
  }

  /**
   * Get all offers for a maker
   */
  async getOffersByMaker(
    maker: PublicKey,
    filters: {
      state?: OfferState;
      offerType?: OfferType;
      fiatCurrency?: FiatCurrency;
    } = {}
  ): Promise<Offer[]> {
    try {
      const allOffers = await this.program.account.offer.all([
        {
          memcmp: {
            offset: 8, // Skip discriminator
            bytes: maker.toBase58(),
          },
        },
      ]);

      let offers = allOffers.map(account => this.mapOffer(account.account));

      // Apply filters
      if (filters.state) {
        offers = offers.filter(offer => offer.state === filters.state);
      }
      if (filters.offerType) {
        offers = offers.filter(offer => offer.offerType === filters.offerType);
      }
      if (filters.fiatCurrency) {
        offers = offers.filter(offer => offer.fiatCurrency === filters.fiatCurrency);
      }

      return offers;
    } catch (error) {
      console.error('Error fetching offers by maker:', error);
      return [];
    }
  }

  /**
   * Search offers with advanced filters
   */
  async searchOffers(filters: {
    offerType?: OfferType;
    fiatCurrency?: FiatCurrency;
    state?: OfferState;
    minRate?: BN;
    maxRate?: BN;
    minAmount?: BN;
    maxAmount?: BN;
    maker?: PublicKey;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    offers: Offer[];
    total: number;
  }> {
    try {
      const allOffers = await this.program.account.offer.all();
      
      let filteredOffers = allOffers
        .map(account => this.mapOffer(account.account))
        .filter(offer => {
          if (filters.offerType && offer.offerType !== filters.offerType) {
            return false;
          }
          if (filters.fiatCurrency && offer.fiatCurrency !== filters.fiatCurrency) {
            return false;
          }
          if (filters.state && offer.state !== filters.state) {
            return false;
          }
          if (filters.minRate && offer.rate.lt(filters.minRate)) {
            return false;
          }
          if (filters.maxRate && offer.rate.gt(filters.maxRate)) {
            return false;
          }
          if (filters.minAmount && offer.maxAmount.lt(filters.minAmount)) {
            return false;
          }
          if (filters.maxAmount && offer.minAmount.gt(filters.maxAmount)) {
            return false;
          }
          if (filters.maker && !offer.maker.equals(filters.maker)) {
            return false;
          }
          return true;
        });

      const total = filteredOffers.length;
      const offset = filters.offset || 0;
      const limit = filters.limit || filteredOffers.length;
      
      filteredOffers = filteredOffers.slice(offset, offset + limit);

      return {
        offers: filteredOffers,
        total,
      };
    } catch (error) {
      console.error('Error searching offers:', error);
      return { offers: [], total: 0 };
    }
  }

  /**
   * Get active offers for trading
   */
  async getActiveOffers(
    fiatCurrency?: FiatCurrency,
    offerType?: OfferType,
    limit: number = 50
  ): Promise<Offer[]> {
    const filters: any = {
      state: OfferState.Active,
      limit,
    };

    if (fiatCurrency) {
      filters.fiatCurrency = fiatCurrency;
    }
    if (offerType) {
      filters.offerType = offerType;
    }

    const result = await this.searchOffers(filters);
    return result.offers;
  }

  /**
   * Calculate offer statistics
   */
  async getOfferStats(maker?: PublicKey): Promise<{
    totalOffers: number;
    activeOffers: number;
    pausedOffers: number;
    archivedOffers: number;
    averageRate: number;
    totalVolume: string;
  }> {
    try {
      let offers: Offer[];
      
      if (maker) {
        offers = await this.getOffersByMaker(maker);
      } else {
        const result = await this.searchOffers();
        offers = result.offers;
      }

      const stats = {
        totalOffers: offers.length,
        activeOffers: offers.filter(o => o.state === OfferState.Active).length,
        pausedOffers: offers.filter(o => o.state === OfferState.Paused).length,
        archivedOffers: offers.filter(o => o.state === OfferState.Archive).length,
        averageRate: 0,
        totalVolume: '0',
      };

      if (offers.length > 0) {
        const totalRate = offers.reduce((sum, offer) => sum + offer.rate.toNumber(), 0);
        stats.averageRate = totalRate / offers.length;

        const totalVolume = offers.reduce((sum, offer) => 
          sum.add(offer.maxAmount), new BN(0)
        );
        stats.totalVolume = Utils.formatAmount(totalVolume);
      }

      return stats;
    } catch (error) {
      return {
        totalOffers: 0,
        activeOffers: 0,
        pausedOffers: 0,
        archivedOffers: 0,
        averageRate: 0,
        totalVolume: '0',
      };
    }
  }

  /**
   * Validate offer parameters
   */
  validateOffer(offer: Offer, amount: BN): {
    valid: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    if (offer.state !== OfferState.Active) {
      reasons.push('Offer is not active');
    }

    if (amount.lt(offer.minAmount)) {
      reasons.push(`Amount below minimum (${Utils.formatAmount(offer.minAmount)})`);
    }

    if (amount.gt(offer.maxAmount)) {
      reasons.push(`Amount above maximum (${Utils.formatAmount(offer.maxAmount)})`);
    }

    // Check if offer has expired (if expiration is implemented)
    const now = new BN(Math.floor(Date.now() / 1000));
    if (offer.expirationTimestamp && now.gt(offer.expirationTimestamp)) {
      reasons.push('Offer has expired');
    }

    return {
      valid: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Get offer expiration status
   */
  getOfferExpirationStatus(offer: Offer): {
    isExpired: boolean;
    timeRemaining: number;
    timeRemainingString: string;
  } {
    if (!offer.expirationTimestamp) {
      return {
        isExpired: false,
        timeRemaining: Infinity,
        timeRemainingString: 'No expiration',
      };
    }

    const now = new BN(Math.floor(Date.now() / 1000));
    const isExpired = now.gt(offer.expirationTimestamp);
    const timeRemaining = isExpired ? 0 : offer.expirationTimestamp.sub(now).toNumber();

    let timeRemainingString = '';
    if (isExpired) {
      timeRemainingString = 'Expired';
    } else if (timeRemaining > 86400) {
      timeRemainingString = `${Math.floor(timeRemaining / 86400)} days`;
    } else if (timeRemaining > 3600) {
      timeRemainingString = `${Math.floor(timeRemaining / 3600)} hours`;
    } else if (timeRemaining > 60) {
      timeRemainingString = `${Math.floor(timeRemaining / 60)} minutes`;
    } else {
      timeRemainingString = `${timeRemaining} seconds`;
    }

    return {
      isExpired,
      timeRemaining,
      timeRemainingString,
    };
  }

  // Private helper methods

  private validateCreateOfferParams(params: CreateOfferParams): void {
    if (params.minAmount.gte(params.maxAmount)) {
      throw new Error('Minimum amount must be less than maximum amount');
    }

    if (params.rate.lte(new BN(0))) {
      throw new Error('Rate must be greater than zero');
    }

    if (!Utils.validateStringLength(params.description, 140)) {
      throw new Error('Description exceeds maximum length (140 characters)');
    }

    if (!Object.values(OfferType).includes(params.offerType)) {
      throw new Error(`Invalid offer type: ${params.offerType}`);
    }

    if (!Object.values(FiatCurrency).includes(params.fiatCurrency)) {
      throw new Error(`Invalid fiat currency: ${params.fiatCurrency}`);
    }
  }

  private mapOffer(offerData: any): Offer {
    return {
      id: offerData.id,
      maker: offerData.maker,
      offerType: this.mapOfferType(offerData.offerType),
      fiatCurrency: this.mapFiatCurrency(offerData.fiatCurrency),
      rate: offerData.rate,
      minAmount: offerData.minAmount,
      maxAmount: offerData.maxAmount,
      description: offerData.description || '',
      state: this.mapOfferState(offerData.state),
      createdAt: offerData.createdAt,
      updatedAt: offerData.updatedAt,
      expirationTimestamp: offerData.expirationTimestamp,
      bump: offerData.bump,
    };
  }

  private mapOfferType(offerType: any): OfferType {
    if (offerType.buy) return OfferType.Buy;
    if (offerType.sell) return OfferType.Sell;
    throw new Error('Unknown offer type');
  }

  private mapFiatCurrency(currency: any): FiatCurrency {
    const currencyName = Object.keys(currency)[0];
    return currencyName.toUpperCase() as FiatCurrency;
  }

  private mapOfferState(state: any): OfferState {
    if (state.active) return OfferState.Active;
    if (state.paused) return OfferState.Paused;
    if (state.archive) return OfferState.Archive;
    throw new Error('Unknown offer state');
  }
}