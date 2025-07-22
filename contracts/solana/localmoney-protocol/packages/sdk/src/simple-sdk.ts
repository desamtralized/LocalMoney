import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';

/**
 * Simple LocalMoney SDK for basic operations
 * This is a simplified version that focuses on core functionality
 */
export class LocalMoneySDK {
  private connection: Connection;
  private provider: AnchorProvider;
  
  // Program addresses
  public programAddresses: {
    hub: PublicKey;
    profile: PublicKey;
    price: PublicKey;
    offer: PublicKey;
    trade: PublicKey;
    arbitration: PublicKey;
  };

  constructor(
    connection: Connection,
    wallet: Wallet,
    programAddresses: {
      hub: PublicKey;
      profile: PublicKey;
      price: PublicKey;
      offer: PublicKey;
      trade: PublicKey;
      arbitration: PublicKey;
    }
  ) {
    this.connection = connection;
    this.programAddresses = programAddresses;
    
    const opts = {
      commitment: 'confirmed' as const,
      preflightCommitment: 'confirmed' as const,
    };
    
    this.provider = new AnchorProvider(connection, wallet, opts);
  }

  /**
   * Create SDK instance with localnet addresses
   */
  static createLocal(wallet: Wallet): LocalMoneySDK {
    const connection = new Connection('http://localhost:8899', 'confirmed');
    
    const programAddresses = {
      hub: new PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
      profile: new PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
      price: new PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
      offer: new PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
      trade: new PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
      arbitration: new PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
    };

    return new LocalMoneySDK(connection, wallet, programAddresses);
  }

  /**
   * Generate PDA for global config
   */
  getGlobalConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      this.programAddresses.hub
    );
  }

  /**
   * Generate PDA for profile
   */
  getProfilePDA(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('profile'), owner.toBuffer()],
      this.programAddresses.profile
    );
  }

  /**
   * Generate PDA for price config
   */
  getPriceConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('price_config')],
      this.programAddresses.price
    );
  }

  /**
   * Generate PDA for currency price
   */
  getCurrencyPricePDA(currency: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('currency_price'), Buffer.from(currency)],
      this.programAddresses.price
    );
  }

  /**
   * Generate PDA for offer
   */
  getOfferPDA(offerId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('offer'), offerId.toArrayLike(Buffer, 'le', 8)],
      this.programAddresses.offer
    );
  }

  /**
   * Generate PDA for trade
   */
  getTradePDA(tradeId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('trade'), tradeId.toArrayLike(Buffer, 'le', 8)],
      this.programAddresses.trade
    );
  }

  /**
   * Get connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get provider
   */
  getProvider(): AnchorProvider {
    return this.provider;
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
}

/**
 * Create a wallet from keypair
 */
export function createWallet(keypair: Keypair): Wallet {
  return new Wallet(keypair);
}

/**
 * Create connection with standard configuration
 */
export function createConnection(
  endpoint: string = 'http://localhost:8899',
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
): Connection {
  return new Connection(endpoint, commitment);
}

/**
 * Common endpoints
 */
export const ENDPOINTS = {
  MAINNET: 'https://api.mainnet-beta.solana.com',
  DEVNET: 'https://api.devnet.solana.com',
  TESTNET: 'https://api.testnet.solana.com',
  LOCALHOST: 'http://localhost:8899',
} as const;

/**
 * Protocol constants
 */
export const CONSTANTS = {
  MAX_PLATFORM_FEE_BPS: 1000, // 10%
  MAX_TRADE_EXPIRATION_SECONDS: 2 * 24 * 60 * 60, // 2 days
  MAX_DISPUTE_TIMER_SECONDS: 24 * 60 * 60, // 1 day
  PRICE_PRECISION: 100000000, // 1e8
  AMOUNT_PRECISION: 1000000000, // 1e9
} as const;

export default LocalMoneySDK;