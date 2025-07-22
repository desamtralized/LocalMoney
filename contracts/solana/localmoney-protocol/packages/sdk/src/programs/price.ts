import { PublicKey, Connection } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import {
  CurrencyPrice,
  UpdatePriceParams,
  TransactionResult,
  ProgramAddresses,
  FiatCurrency
} from '../types';
import { PDAGenerator, Utils } from '../utils';

/**
 * SDK for interacting with the LocalMoney Price Program
 */
export class PriceSDK {
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
   * Initialize the Price program configuration
   */
  async initializePriceConfig(
    hubProgram: PublicKey,
    maxStalenessSeconds: BN = new BN(3600) // 1 hour default
  ): Promise<TransactionResult> {
    try {
      const [priceConfigPDA] = this.pdaGenerator.getPriceConfigPDA();

      const tx = await this.program.methods
        .initialize({
          hubProgram,
          maxStalenessSeconds,
        })
        .accounts({
          priceConfig: priceConfigPDA,
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
   * Update price for a specific currency
   */
  async updatePrice(params: UpdatePriceParams): Promise<TransactionResult> {
    try {
      // Validate price data
      this.validatePriceParams(params);

      const [priceConfigPDA] = this.pdaGenerator.getPriceConfigPDA();
      const [currencyPricePDA] = this.pdaGenerator.getCurrencyPricePDA(params.currency);

      const tx = await this.program.methods
        .updatePrices({
          currency: { [params.currency.toLowerCase()]: {} },
          priceUsd: params.priceUsd,
          confidence: params.confidence,
        })
        .accounts({
          priceConfig: priceConfigPDA,
          currencyPrice: currencyPricePDA,
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
   * Get price for a specific currency
   */
  async getPrice(currency: FiatCurrency): Promise<CurrencyPrice | null> {
    try {
      const [currencyPricePDA] = this.pdaGenerator.getCurrencyPricePDA(currency);
      const priceData = await this.program.account.currencyPrice.fetch(currencyPricePDA);
      return this.mapCurrencyPrice(priceData, currency);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get multiple prices for different currencies
   */
  async getMultiplePrices(currencies: FiatCurrency[]): Promise<Map<FiatCurrency, CurrencyPrice | null>> {
    const priceMap = new Map<FiatCurrency, CurrencyPrice | null>();
    
    const prices = await Promise.all(
      currencies.map(currency => this.getPrice(currency))
    );

    currencies.forEach((currency, index) => {
      priceMap.set(currency, prices[index]);
    });

    return priceMap;
  }

  /**
   * Get all available currency prices
   */
  async getAllPrices(): Promise<CurrencyPrice[]> {
    try {
      const allPriceAccounts = await this.program.account.currencyPrice.all();
      return allPriceAccounts.map(account => {
        // Extract currency from account data
        const currency = this.extractCurrencyFromAccountData(account.account);
        return this.mapCurrencyPrice(account.account, currency);
      });
    } catch (error) {
      console.error('Error fetching all prices:', error);
      return [];
    }
  }

  /**
   * Check if price data is fresh (not stale)
   */
  async isPriceFresh(
    currency: FiatCurrency,
    maxStalenessSeconds: number = 3600
  ): Promise<boolean> {
    const price = await this.getPrice(currency);
    if (!price) {
      return false;
    }

    const now = new BN(Math.floor(Date.now() / 1000));
    const priceAge = now.sub(price.timestamp);
    return priceAge.lte(new BN(maxStalenessSeconds));
  }

  /**
   * Get price age in seconds
   */
  async getPriceAge(currency: FiatCurrency): Promise<number | null> {
    const price = await this.getPrice(currency);
    if (!price) {
      return null;
    }

    const now = new BN(Math.floor(Date.now() / 1000));
    const priceAge = now.sub(price.timestamp);
    return priceAge.toNumber();
  }

  /**
   * Convert amount from one currency to USD
   */
  async convertToUSD(
    amount: BN,
    fromCurrency: FiatCurrency
  ): Promise<{ usdAmount: BN; exchangeRate: BN } | null> {
    const price = await this.getPrice(fromCurrency);
    if (!price) {
      return null;
    }

    // USD amount = amount * (price_usd / 1e8)
    // We use 1e8 as the price precision
    const precision = new BN(100000000); // 1e8
    const usdAmount = amount.mul(price.priceUsd).div(precision);

    return {
      usdAmount,
      exchangeRate: price.priceUsd,
    };
  }

  /**
   * Convert amount from USD to a specific currency
   */
  async convertFromUSD(
    usdAmount: BN,
    toCurrency: FiatCurrency
  ): Promise<{ amount: BN; exchangeRate: BN } | null> {
    const price = await this.getPrice(toCurrency);
    if (!price) {
      return null;
    }

    // Amount = usd_amount * (1e8 / price_usd)
    const precision = new BN(100000000); // 1e8
    const amount = usdAmount.mul(precision).div(price.priceUsd);

    return {
      amount,
      exchangeRate: price.priceUsd,
    };
  }

  /**
   * Convert amount between two currencies via USD
   */
  async convertCurrency(
    amount: BN,
    fromCurrency: FiatCurrency,
    toCurrency: FiatCurrency
  ): Promise<{ convertedAmount: BN; fromRate: BN; toRate: BN } | null> {
    if (fromCurrency === toCurrency) {
      return {
        convertedAmount: amount,
        fromRate: new BN(100000000), // 1.0 in 1e8 precision
        toRate: new BN(100000000),
      };
    }

    // Convert to USD first
    const usdConversion = await this.convertToUSD(amount, fromCurrency);
    if (!usdConversion) {
      return null;
    }

    // Convert from USD to target currency
    const targetConversion = await this.convertFromUSD(usdConversion.usdAmount, toCurrency);
    if (!targetConversion) {
      return null;
    }

    return {
      convertedAmount: targetConversion.amount,
      fromRate: usdConversion.exchangeRate,
      toRate: targetConversion.exchangeRate,
    };
  }

  /**
   * Get price history for analysis (if supported)
   */
  async getPriceHistory(
    currency: FiatCurrency,
    limit: number = 50
  ): Promise<{
    currency: FiatCurrency;
    entries: Array<{
      timestamp: Date;
      priceUsd: string;
      confidence: number;
    }>;
  } | null> {
    try {
      // This would call a price history instruction if implemented
      // For now, we return the current price as a single entry
      const currentPrice = await this.getPrice(currency);
      if (!currentPrice) {
        return null;
      }

      return {
        currency,
        entries: [{
          timestamp: Utils.timestampToDate(currentPrice.timestamp),
          priceUsd: Utils.formatAmount(currentPrice.priceUsd, 8),
          confidence: currentPrice.confidence,
        }],
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate price lock for trading operations
   */
  async validatePriceLock(
    currency: FiatCurrency,
    lockedPriceUsd: BN,
    lockedTimestamp: BN,
    maxDeviationPercent: number = 10,
    maxAgeSeconds: number = 1800 // 30 minutes
  ): Promise<{
    valid: boolean;
    currentPrice: BN | null;
    deviation: number;
    age: number;
    reasons: string[];
  }> {
    const reasons: string[] = [];
    let valid = true;

    // Check price lock age
    const now = new BN(Math.floor(Date.now() / 1000));
    const age = now.sub(lockedTimestamp).toNumber();
    
    if (age > maxAgeSeconds) {
      valid = false;
      reasons.push(`Price lock expired (${age}s > ${maxAgeSeconds}s)`);
    }

    // Get current price and calculate deviation
    const currentPriceData = await this.getPrice(currency);
    const currentPrice = currentPriceData?.priceUsd || null;
    let deviation = 0;

    if (currentPrice && lockedPriceUsd.gt(new BN(0))) {
      // Calculate percentage deviation
      const priceDiff = currentPrice.sub(lockedPriceUsd).abs();
      deviation = priceDiff.mul(new BN(10000)).div(lockedPriceUsd).toNumber() / 100; // Convert to percentage

      if (deviation > maxDeviationPercent) {
        valid = false;
        reasons.push(`Price deviation too high (${deviation.toFixed(2)}% > ${maxDeviationPercent}%)`);
      }
    } else if (!currentPrice) {
      valid = false;
      reasons.push('Current price not available');
    }

    return {
      valid,
      currentPrice,
      deviation,
      age,
      reasons,
    };
  }

  /**
   * Get price configuration
   */
  async getPriceConfig(): Promise<{
    authority: PublicKey;
    hubProgram: PublicKey;
    maxStalenessSeconds: BN;
  } | null> {
    try {
      const [priceConfigPDA] = this.pdaGenerator.getPriceConfigPDA();
      const config = await this.program.account.priceConfig.fetch(priceConfigPDA);
      return {
        authority: config.authority,
        hubProgram: config.hubProgram,
        maxStalenessSeconds: config.maxStalenessSeconds,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Update price provider authority
   */
  async updatePriceProvider(newProvider: PublicKey): Promise<TransactionResult> {
    try {
      const [priceConfigPDA] = this.pdaGenerator.getPriceConfigPDA();

      const tx = await this.program.methods
        .updatePriceProvider({
          newProvider,
        })
        .accounts({
          priceConfig: priceConfigPDA,
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
   * Batch update multiple currency prices
   */
  async batchUpdatePrices(updates: UpdatePriceParams[]): Promise<TransactionResult[]> {
    const results: TransactionResult[] = [];

    for (const update of updates) {
      const result = await this.updatePrice(update);
      results.push(result);
      
      // Add small delay to avoid overwhelming the network
      await Utils.sleep(100);
    }

    return results;
  }

  /**
   * Get market summary for all currencies
   */
  async getMarketSummary(): Promise<{
    totalCurrencies: number;
    freshPrices: number;
    stalePrices: number;
    averageConfidence: number;
    lastUpdateTime: Date | null;
  }> {
    const allPrices = await this.getAllPrices();
    const now = Math.floor(Date.now() / 1000);
    const maxStaleSeconds = 3600; // 1 hour

    let freshCount = 0;
    let totalConfidence = 0;
    let latestTimestamp = 0;

    for (const price of allPrices) {
      const age = now - price.timestamp.toNumber();
      if (age <= maxStaleSeconds) {
        freshCount++;
      }
      
      totalConfidence += price.confidence;
      latestTimestamp = Math.max(latestTimestamp, price.timestamp.toNumber());
    }

    return {
      totalCurrencies: allPrices.length,
      freshPrices: freshCount,
      stalePrices: allPrices.length - freshCount,
      averageConfidence: allPrices.length > 0 ? totalConfidence / allPrices.length : 0,
      lastUpdateTime: latestTimestamp > 0 ? new Date(latestTimestamp * 1000) : null,
    };
  }

  // Private helper methods

  private validatePriceParams(params: UpdatePriceParams): void {
    if (params.priceUsd.lte(new BN(0))) {
      throw new Error('Price must be greater than zero');
    }

    if (params.confidence < 0 || params.confidence > 100) {
      throw new Error('Confidence must be between 0 and 100');
    }

    if (!Object.values(FiatCurrency).includes(params.currency)) {
      throw new Error(`Unsupported currency: ${params.currency}`);
    }
  }

  private mapCurrencyPrice(priceData: any, currency: FiatCurrency): CurrencyPrice {
    return {
      currency,
      priceUsd: priceData.priceUsd,
      timestamp: priceData.timestamp,
      confidence: priceData.confidence,
      source: priceData.source,
      bump: priceData.bump,
    };
  }

  private extractCurrencyFromAccountData(accountData: any): FiatCurrency {
    // This would extract the currency from the account data
    // Implementation depends on how currency is stored in the account
    return accountData.currency || FiatCurrency.USD;
  }
}