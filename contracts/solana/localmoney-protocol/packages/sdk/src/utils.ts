import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import type { BN } from 'bn.js';
import BN from 'bn.js';
import {
  GLOBAL_CONFIG_SEED,
  PROFILE_SEED,
  PRICE_CONFIG_SEED,
  CURRENCY_PRICE_SEED,
  OFFER_COUNTER_SEED,
  OFFER_SEED,
  TRADE_COUNTER_SEED,
  TRADE_SEED,
  ARBITRATOR_COUNTER_SEED,
  ARBITRATOR_SEED,
  FiatCurrency,
  ProgramAddresses
} from './types';

/**
 * Generates Program Derived Addresses (PDAs) for LocalMoney protocol accounts
 */
export class PDAGenerator {
  constructor(private programAddresses: ProgramAddresses) {}

  // Hub Program PDAs
  getGlobalConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(GLOBAL_CONFIG_SEED)],
      this.programAddresses.hub
    );
  }

  // Profile Program PDAs
  getProfilePDA(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(PROFILE_SEED), owner.toBuffer()],
      this.programAddresses.profile
    );
  }

  // Price Program PDAs
  getPriceConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(PRICE_CONFIG_SEED)],
      this.programAddresses.price
    );
  }

  getCurrencyPricePDA(currency: FiatCurrency): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(CURRENCY_PRICE_SEED), Buffer.from(currency)],
      this.programAddresses.price
    );
  }

  // Offer Program PDAs
  getOfferCounterPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(OFFER_COUNTER_SEED)],
      this.programAddresses.offer
    );
  }

  getOfferPDA(offerId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(OFFER_SEED), offerId.toArrayLike(Buffer, 'le', 8)],
      this.programAddresses.offer
    );
  }

  // Trade Program PDAs
  getTradeCounterPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(TRADE_COUNTER_SEED)],
      this.programAddresses.trade
    );
  }

  getTradePDA(tradeId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(TRADE_SEED), tradeId.toArrayLike(Buffer, 'le', 8)],
      this.programAddresses.trade
    );
  }

  // Arbitration Program PDAs
  getArbitratorCounterPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(ARBITRATOR_COUNTER_SEED)],
      this.programAddresses.arbitration
    );
  }

  getArbitratorPDA(authority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(ARBITRATOR_SEED), authority.toBuffer()],
      this.programAddresses.arbitration
    );
  }
}

/**
 * Utility functions for data conversion and validation
 */
export class Utils {
  /**
   * Convert basis points to percentage
   */
  static bpsToPercentage(bps: number): number {
    return bps / 100;
  }

  /**
   * Convert percentage to basis points
   */
  static percentageToBps(percentage: number): number {
    return Math.round(percentage * 100);
  }

  /**
   * Convert BN to number safely
   */
  static bnToNumber(bn: BN): number {
    return bn.toNumber();
  }

  /**
   * Convert number to BN safely
   */
  static numberToBN(num: number): BN {
    return new BN(num);
  }

  /**
   * Convert Unix timestamp to Date
   */
  static timestampToDate(timestamp: BN): Date {
    return new Date(timestamp.toNumber() * 1000);
  }

  /**
   * Convert Date to Unix timestamp
   */
  static dateToTimestamp(date: Date): BN {
    return new BN(Math.floor(date.getTime() / 1000));
  }

  /**
   * Validate fee percentage (max 10%)
   */
  static validateFeeBps(feeBps: number): boolean {
    return feeBps >= 0 && feeBps <= 1000; // 10% = 1000 BPS
  }

  /**
   * Validate total fees don't exceed maximum
   */
  static validateTotalFees(
    chainFeeBps: number,
    burnFeeBps: number,
    warchestFeeBps: number,
    arbitrationFeeBps: number
  ): boolean {
    const totalFees = chainFeeBps + burnFeeBps + warchestFeeBps + arbitrationFeeBps;
    return totalFees <= 1000; // 10% total maximum
  }

  /**
   * Format amount with proper decimal places
   */
  static formatAmount(amount: BN, decimals: number = 9): string {
    const divisor = new BN(10).pow(new BN(decimals));
    const wholePart = amount.div(divisor);
    const fractionalPart = amount.mod(divisor);
    
    if (fractionalPart.isZero()) {
      return wholePart.toString();
    }
    
    return `${wholePart.toString()}.${fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
  }

  /**
   * Parse formatted amount string to BN
   */
  static parseAmount(amountStr: string, decimals: number = 9): BN {
    const [wholePart, fractionalPart = ''] = amountStr.split('.');
    const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
    const wholePartBN = new BN(wholePart || '0');
    const fractionalPartBN = new BN(paddedFractional || '0');
    const multiplier = new BN(10).pow(new BN(decimals));
    
    return wholePartBN.mul(multiplier).add(fractionalPartBN);
  }

  /**
   * Calculate fee amount from total amount and fee BPS
   */
  static calculateFee(amount: BN, feeBps: number): BN {
    return amount.mul(new BN(feeBps)).div(new BN(10000));
  }

  /**
   * Validate amount range
   */
  static validateAmountRange(amount: BN, minAmount: BN, maxAmount: BN): boolean {
    return amount.gte(minAmount) && amount.lte(maxAmount);
  }

  /**
   * Check if timestamp is expired
   */
  static isExpired(expirationTimestamp: BN): boolean {
    const now = new BN(Math.floor(Date.now() / 1000));
    return now.gt(expirationTimestamp);
  }

  /**
   * Get time remaining until expiration
   */
  static getTimeRemaining(expirationTimestamp: BN): number {
    const now = new BN(Math.floor(Date.now() / 1000));
    const remaining = expirationTimestamp.sub(now);
    return remaining.gt(new BN(0)) ? remaining.toNumber() : 0;
  }

  /**
   * Validate string length
   */
  static validateStringLength(str: string, maxLength: number): boolean {
    return str.length <= maxLength;
  }

  /**
   * Sleep for specified milliseconds (useful for testing)
   */
  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry async operation with exponential backoff
   */
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Convert enum value to string
   */
  static enumToString<T extends Record<string, string>>(
    enumObj: T,
    value: T[keyof T]
  ): string {
    return value;
  }

  /**
   * Convert string to enum value
   */
  static stringToEnum<T extends Record<string, string>>(
    enumObj: T,
    value: string
  ): T[keyof T] | undefined {
    return Object.values(enumObj).find(v => v === value) as T[keyof T] | undefined;
  }
}

/**
 * Error handling utilities
 */
export class ErrorHandler {
  /**
   * Parse Anchor error to human-readable message
   */
  static parseAnchorError(error: any): string {
    if (error.error?.errorMessage) {
      return error.error.errorMessage;
    }
    
    if (error.message) {
      return error.message;
    }
    
    return 'Unknown error occurred';
  }

  /**
   * Check if error is a specific LocalMoney error code
   */
  static isLocalMoneyError(error: any, errorCode: string): boolean {
    return error.error?.errorCode?.code === errorCode;
  }

  /**
   * Get error code from error object
   */
  static getErrorCode(error: any): string | undefined {
    return error.error?.errorCode?.code;
  }
}

/**
 * Transaction building utilities for LocalMoney protocol operations
 */
export class TransactionBuilder {
  private programAddresses: ProgramAddresses;
  private pdaGenerator: PDAGenerator;

  constructor(programAddresses: ProgramAddresses) {
    this.programAddresses = programAddresses;
    this.pdaGenerator = new PDAGenerator(programAddresses);
  }

  /**
   * Calculate required compute units for transaction
   */
  static estimateComputeUnits(instructionCount: number): number {
    // Base estimate: 5000 units per instruction + 10000 base
    return 10000 + (instructionCount * 5000);
  }

  /**
   * Calculate priority fee based on network conditions
   */
  static calculatePriorityFee(urgency: 'low' | 'medium' | 'high' = 'medium'): number {
    const baseFees = {
      low: 1,
      medium: 5,
      high: 20
    };
    
    return baseFees[urgency] * 1000; // Convert to lamports
  }

  /**
   * Create a compute budget instruction
   */
  static createComputeBudgetInstruction(computeUnits: number): TransactionInstruction {
    return new TransactionInstruction({
      keys: [],
      programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
      data: Buffer.from([0, ...new BN(computeUnits).toArray('le', 4)]),
    });
  }

  /**
   * Create a priority fee instruction
   */
  static createPriorityFeeInstruction(microLamports: number): TransactionInstruction {
    return new TransactionInstruction({
      keys: [],
      programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
      data: Buffer.from([3, ...new BN(microLamports).toArray('le', 8)]),
    });
  }

  /**
   * Build Hub program initialization instruction
   */
  buildHubInitializeInstruction(params: {
    authority: PublicKey;
    offerProgram: PublicKey;
    tradeProgram: PublicKey;
    profileProgram: PublicKey;
    priceProgram: PublicKey;
    priceProvider: PublicKey;
    localMint: PublicKey;
    chainFeeCollector: PublicKey;
    warchest: PublicKey;
    activeOffersLimit: number;
    activeTradesLimit: number;
    arbitrationFeeBps: number;
    burnFeeBps: number;
    chainFeeBps: number;
    warchestFeeBps: number;
    tradeExpirationTimer: BN;
    tradeDisputeTimer: BN;
    tradeLimitMin: BN;
    tradeLimitMax: BN;
  }): { instruction: TransactionInstruction; accounts: PublicKey[] } {
    const [globalConfigPDA] = this.pdaGenerator.getGlobalConfigPDA();

    const accounts = [
      { pubkey: globalConfigPDA, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
    ];

    // Create instruction data
    const data = Buffer.alloc(1000); // Adjust size as needed
    let offset = 0;
    
    // Instruction discriminator (would need actual discriminator from IDL)
    data.writeUInt8(175, offset); // Placeholder discriminator
    offset += 8;

    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: this.programAddresses.hub,
      data: data.subarray(0, offset),
    });

    return {
      instruction,
      accounts: accounts.map(acc => acc.pubkey),
    };
  }

  /**
   * Build Profile creation instruction
   */
  buildCreateProfileInstruction(params: {
    owner: PublicKey;
    contactInfo: string;
  }): { instruction: TransactionInstruction; accounts: PublicKey[] } {
    const [profilePDA] = this.pdaGenerator.getProfilePDA(params.owner);

    const accounts = [
      { pubkey: profilePDA, isSigner: false, isWritable: true },
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: this.programAddresses.profile,
      data: Buffer.from([]), // Placeholder data
    });

    return {
      instruction,
      accounts: accounts.map(acc => acc.pubkey),
    };
  }

  /**
   * Build Offer creation instruction
   */
  buildCreateOfferInstruction(params: {
    maker: PublicKey;
    offerType: string; // 'Buy' | 'Sell'
    fiatCurrency: FiatCurrency;
    rate: BN;
    minAmount: BN;
    maxAmount: BN;
    description: string;
  }): { instruction: TransactionInstruction; accounts: PublicKey[] } {
    const [offerCounterPDA] = this.pdaGenerator.getOfferCounterPDA();

    const accounts = [
      { pubkey: offerCounterPDA, isSigner: false, isWritable: true },
      { pubkey: params.maker, isSigner: true, isWritable: true },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: this.programAddresses.offer,
      data: Buffer.from([]), // Placeholder data
    });

    return {
      instruction,
      accounts: accounts.map(acc => acc.pubkey),
    };
  }

  /**
   * Build Trade creation instruction
   */
  buildCreateTradeInstruction(params: {
    taker: PublicKey;
    offerId: BN;
    amount: BN;
    contactInfo: string;
  }): { instruction: TransactionInstruction; accounts: PublicKey[] } {
    const [tradeCounterPDA] = this.pdaGenerator.getTradeCounterPDA();
    const [offerPDA] = this.pdaGenerator.getOfferPDA(params.offerId);

    const accounts = [
      { pubkey: tradeCounterPDA, isSigner: false, isWritable: true },
      { pubkey: offerPDA, isSigner: false, isWritable: true },
      { pubkey: params.taker, isSigner: true, isWritable: true },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: this.programAddresses.trade,
      data: Buffer.from([]), // Placeholder data
    });

    return {
      instruction,
      accounts: accounts.map(acc => acc.pubkey),
    };
  }

  /**
   * Build Price update instruction
   */
  buildUpdatePricesInstruction(params: {
    priceProvider: PublicKey;
    currency: FiatCurrency;
    price: BN;
    confidence: number;
  }): { instruction: TransactionInstruction; accounts: PublicKey[] } {
    const [priceConfigPDA] = this.pdaGenerator.getPriceConfigPDA();
    const [currencyPricePDA] = this.pdaGenerator.getCurrencyPricePDA(params.currency);

    const accounts = [
      { pubkey: priceConfigPDA, isSigner: false, isWritable: false },
      { pubkey: currencyPricePDA, isSigner: false, isWritable: true },
      { pubkey: params.priceProvider, isSigner: true, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: this.programAddresses.price,
      data: Buffer.from([]), // Placeholder data
    });

    return {
      instruction,
      accounts: accounts.map(acc => acc.pubkey),
    };
  }

  /**
   * Build a batch transaction with multiple instructions
   */
  buildBatchTransaction(
    instructions: TransactionInstruction[],
    options: {
      computeUnits?: number;
      priorityFee?: number;
      urgency?: 'low' | 'medium' | 'high';
    } = {}
  ): Transaction {
    const transaction = new Transaction();
    
    // Add compute budget instruction if specified
    const computeUnits = options.computeUnits || TransactionBuilder.estimateComputeUnits(instructions.length);
    transaction.add(TransactionBuilder.createComputeBudgetInstruction(computeUnits));
    
    // Add priority fee instruction if specified
    const priorityFee = options.priorityFee || TransactionBuilder.calculatePriorityFee(options.urgency);
    transaction.add(TransactionBuilder.createPriorityFeeInstruction(priorityFee));
    
    // Add all provided instructions
    instructions.forEach(instruction => {
      transaction.add(instruction);
    });
    
    return transaction;
  }

  /**
   * Build a transaction for creating a complete offer (profile + offer)
   */
  buildCompleteOfferCreationTransaction(params: {
    maker: PublicKey;
    offerType: string;
    fiatCurrency: FiatCurrency;
    rate: BN;
    minAmount: BN;
    maxAmount: BN;
    description: string;
    contactInfo: string;
  }): Transaction {
    const instructions: TransactionInstruction[] = [];

    // Add profile creation instruction
    const profileInstruction = this.buildCreateProfileInstruction({
      owner: params.maker,
      contactInfo: params.contactInfo,
    });
    instructions.push(profileInstruction.instruction);

    // Add offer creation instruction
    const offerInstruction = this.buildCreateOfferInstruction({
      maker: params.maker,
      offerType: params.offerType,
      fiatCurrency: params.fiatCurrency,
      rate: params.rate,
      minAmount: params.minAmount,
      maxAmount: params.maxAmount,
      description: params.description,
    });
    instructions.push(offerInstruction.instruction);

    return this.buildBatchTransaction(instructions);
  }

  /**
   * Build a transaction for complete trade flow (trade + escrow)
   */
  buildCompleteTradeTransaction(params: {
    taker: PublicKey;
    offerId: BN;
    amount: BN;
    contactInfo: string;
  }): Transaction {
    const instructions: TransactionInstruction[] = [];

    // Add trade creation instruction
    const tradeInstruction = this.buildCreateTradeInstruction({
      taker: params.taker,
      offerId: params.offerId,
      amount: params.amount,
      contactInfo: params.contactInfo,
    });
    instructions.push(tradeInstruction.instruction);

    return this.buildBatchTransaction(instructions);
  }

  /**
   * Estimate transaction size in bytes
   */
  static estimateTransactionSize(instructionCount: number): number {
    // Base transaction size + instruction overhead
    const baseSize = 64; // signatures + recent blockhash
    const instructionOverhead = 32; // per instruction overhead
    const accountsOverhead = 32 * 10; // estimate for accounts
    
    return baseSize + (instructionCount * instructionOverhead) + accountsOverhead;
  }

  /**
   * Validate transaction size limits
   */
  static validateTransactionSize(transaction: Transaction): { valid: boolean; size: number; maxSize: number } {
    const maxSize = 1232; // Solana transaction size limit
    const estimatedSize = this.estimateTransactionSize(transaction.instructions.length);
    
    return {
      valid: estimatedSize <= maxSize,
      size: estimatedSize,
      maxSize,
    };
  }

  /**
   * Build account metas for cross-program invocations
   */
  buildCrossProgramAccountMetas(params: {
    hubProgram?: boolean;
    profileProgram?: boolean;
    priceProgram?: boolean;
    offerProgram?: boolean;
    tradeProgram?: boolean;
    arbitrationProgram?: boolean;
  }): Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> {
    const accounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = [];

    if (params.hubProgram) {
      accounts.push({ pubkey: this.programAddresses.hub, isSigner: false, isWritable: false });
    }
    if (params.profileProgram) {
      accounts.push({ pubkey: this.programAddresses.profile, isSigner: false, isWritable: false });
    }
    if (params.priceProgram) {
      accounts.push({ pubkey: this.programAddresses.price, isSigner: false, isWritable: false });
    }
    if (params.offerProgram) {
      accounts.push({ pubkey: this.programAddresses.offer, isSigner: false, isWritable: false });
    }
    if (params.tradeProgram) {
      accounts.push({ pubkey: this.programAddresses.trade, isSigner: false, isWritable: false });
    }
    if (params.arbitrationProgram) {
      accounts.push({ pubkey: this.programAddresses.arbitration, isSigner: false, isWritable: false });
    }

    return accounts;
  }

  /**
   * Get PDA generator for external use
   */
  getPDAGenerator(): PDAGenerator {
    return this.pdaGenerator;
  }

  /**
   * Create a transaction builder with program addresses
   */
  static create(programAddresses: ProgramAddresses): TransactionBuilder {
    return new TransactionBuilder(programAddresses);
  }
}