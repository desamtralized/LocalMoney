import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { HubSDK } from './programs/hub';
import { ProfileSDK } from './programs/profile';
import { PriceSDK } from './programs/price';
import { PDAGenerator } from './utils';
import { SDKConfig, ProgramAddresses } from './types';
import { 
  LocalMoneyWallet, 
  WalletType, 
  WalletInfo, 
  WalletState, 
  WalletConnectionOptions,
  WalletUtils,
  createLocalMoneyWallet
} from './wallet';

// Import IDL types (these would be generated from your Anchor programs)
// You would need to add the actual IDL imports here
// import { Hub } from '../idl/hub';
// import { Profile } from '../idl/profile';
// import { Price } from '../idl/price';

/**
 * Main LocalMoney SDK class that provides access to all program SDKs
 */
export class LocalMoneySDK {
  private connection: Connection;
  private provider: AnchorProvider;
  private programAddresses: ProgramAddresses;
  private localMoneyWallet?: LocalMoneyWallet;
  
  // Program SDKs
  public hub: HubSDK;
  public profile: ProfileSDK;
  public price: PriceSDK;
  
  // Utilities
  public pda: PDAGenerator;

  constructor(
    connection: Connection,
    wallet: Wallet,
    programAddresses: ProgramAddresses,
    config?: Partial<SDKConfig>
  ) {
    this.connection = connection;
    this.programAddresses = programAddresses;
    
    // Set up Anchor provider
    const opts = {
      commitment: config?.commitment || 'confirmed' as const,
      preflightCommitment: config?.commitment || 'confirmed' as const,
    };
    
    this.provider = new AnchorProvider(connection, wallet, opts);
    
    // Initialize utility classes
    this.pda = new PDAGenerator(programAddresses);
    
    // Initialize program SDKs
    this.initializeProgramSDKs();
  }

  /**
   * Create SDK instance with default program addresses
   * These would be the deployed program addresses on mainnet/devnet
   */
  static create(
    connection: Connection,
    wallet: Wallet,
    config?: Partial<SDKConfig>
  ): LocalMoneySDK {
    // Default program addresses - these should be updated with actual deployed addresses
    const defaultProgramAddresses: ProgramAddresses = {
      hub: new PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
      profile: new PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
      price: new PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
      offer: new PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
      trade: new PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
      arbitration: new PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
    };

    return new LocalMoneySDK(connection, wallet, defaultProgramAddresses, config);
  }

  /**
   * Create SDK instance for localhost/localnet development
   */
  static createLocal(
    wallet: Wallet,
    config?: Partial<SDKConfig>
  ): LocalMoneySDK {
    const connection = new Connection('http://localhost:8899', 'confirmed');
    
    // Use the deployed localnet addresses from the migration
    const localProgramAddresses: ProgramAddresses = {
      hub: new PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
      profile: new PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
      price: new PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
      offer: new PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
      trade: new PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
      arbitration: new PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
    };

    return new LocalMoneySDK(connection, wallet, localProgramAddresses, config);
  }

  /**
   * Create SDK with enhanced LocalMoney wallet
   */
  static createWithEnhancedWallet(
    connection: Connection,
    programAddresses: ProgramAddresses,
    walletOptions?: WalletConnectionOptions,
    config?: Partial<SDKConfig>
  ): { sdk: LocalMoneySDK, wallet: LocalMoneyWallet } {
    const localMoneyWallet = createLocalMoneyWallet(connection, walletOptions);
    
    // Create a mock Anchor wallet that delegates to LocalMoneyWallet
    const anchorWallet: Wallet = {
      get publicKey() { return localMoneyWallet.publicKey; },
      signTransaction: localMoneyWallet.signTransaction.bind(localMoneyWallet),
      signAllTransactions: localMoneyWallet.signAllTransactions.bind(localMoneyWallet)
    };

    const sdk = new LocalMoneySDK(connection, anchorWallet, programAddresses, config);
    sdk.localMoneyWallet = localMoneyWallet;
    
    return { sdk, wallet: localMoneyWallet };
  }

  /**
   * Create SDK with enhanced wallet for localhost development
   */
  static createLocalWithEnhancedWallet(
    walletOptions?: WalletConnectionOptions,
    config?: Partial<SDKConfig>
  ): { sdk: LocalMoneySDK, wallet: LocalMoneyWallet } {
    const connection = new Connection('http://localhost:8899', 'confirmed');
    
    const localProgramAddresses: ProgramAddresses = {
      hub: new PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
      profile: new PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
      price: new PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
      offer: new PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
      trade: new PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
      arbitration: new PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
    };

    return LocalMoneySDK.createWithEnhancedWallet(
      connection, 
      localProgramAddresses, 
      walletOptions, 
      config
    );
  }

  /**
   * Create SDK instance with a keypair wallet
   */
  static createWithKeypair(
    connection: Connection,
    keypair: Keypair,
    programAddresses: ProgramAddresses,
    config?: Partial<SDKConfig>
  ): LocalMoneySDK {
    const wallet = new Wallet(keypair);
    return new LocalMoneySDK(connection, wallet, programAddresses, config);
  }

  /**
   * Get the current provider
   */
  getProvider(): AnchorProvider {
    return this.provider;
  }

  /**
   * Get the connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get program addresses
   */
  getProgramAddresses(): ProgramAddresses {
    return this.programAddresses;
  }

  /**
   * Check if all programs are deployed and accessible
   */
  async validatePrograms(): Promise<{
    valid: boolean;
    results: Record<string, { exists: boolean; executable: boolean }>;
  }> {
    const results: Record<string, { exists: boolean; executable: boolean }> = {};
    let allValid = true;

    for (const [name, programId] of Object.entries(this.programAddresses)) {
      try {
        const accountInfo = await this.connection.getAccountInfo(programId);
        const exists = accountInfo !== null;
        const executable = accountInfo?.executable || false;
        
        results[name] = { exists, executable };
        
        if (!exists || !executable) {
          allValid = false;
        }
      } catch (error) {
        results[name] = { exists: false, executable: false };
        allValid = false;
      }
    }

    return { valid: allValid, results };
  }

  /**
   * Get protocol status summary
   */
  async getProtocolStatus(): Promise<{
    hubInitialized: boolean;
    priceConfigInitialized: boolean;
    programsValid: boolean;
    blockHeight: number;
    timestamp: number;
  }> {
    const [hubInitialized, priceConfigInitialized, validation, blockHeight] = await Promise.all([
      this.hub.isInitialized(),
      this.price.getPriceConfig().then(config => config !== null),
      this.validatePrograms(),
      this.connection.getBlockHeight(),
    ]);

    return {
      hubInitialized,
      priceConfigInitialized,
      programsValid: validation.valid,
      blockHeight,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Get protocol configuration summary
   */
  async getProtocolConfig(): Promise<{
    globalConfig: any;
    priceConfig: any;
    feeConfiguration: any;
    programAddresses: ProgramAddresses;
  } | null> {
    try {
      const [globalConfig, priceConfig, feeConfig] = await Promise.all([
        this.hub.getGlobalConfig(),
        this.price.getPriceConfig(),
        this.hub.getFeeConfiguration(),
      ]);

      return {
        globalConfig,
        priceConfig,
        feeConfiguration: feeConfig,
        programAddresses: this.programAddresses,
      };
    } catch (error) {
      console.error('Error fetching protocol configuration:', error);
      return null;
    }
  }

  /**
   * Wait for transaction confirmation with retry logic
   */
  async confirmTransaction(
    signature: string,
    maxRetries: number = 3
  ): Promise<{ confirmed: boolean; error?: string }> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
          return {
            confirmed: false,
            error: `Transaction failed: ${confirmation.value.err}`,
          };
        }
        
        return { confirmed: true };
      } catch (error: any) {
        if (attempt === maxRetries - 1) {
          return {
            confirmed: false,
            error: `Failed to confirm transaction after ${maxRetries} attempts: ${error.message}`,
          };
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    
    return { confirmed: false, error: 'Unexpected error in confirmation loop' };
  }

  /**
   * Update program addresses (useful for testing different deployments)
   */
  updateProgramAddresses(newAddresses: Partial<ProgramAddresses>): void {
    this.programAddresses = { ...this.programAddresses, ...newAddresses };
    
    // Reinitialize PDAs and program SDKs with new addresses
    this.pda = new PDAGenerator(this.programAddresses);
    this.initializeProgramSDKs();
  }

  // Enhanced wallet methods

  /**
   * Get available wallets
   */
  static getAvailableWallets(): WalletInfo[] {
    return LocalMoneyWallet.getAvailableWallets();
  }

  /**
   * Get LocalMoney wallet instance (if using enhanced wallet)
   */
  getWallet(): LocalMoneyWallet | undefined {
    return this.localMoneyWallet;
  }

  /**
   * Get wallet state (if using enhanced wallet)
   */
  getWalletState(): WalletState | null {
    return this.localMoneyWallet?.getState() || null;
  }

  /**
   * Connect to a specific wallet type (if using enhanced wallet)
   */
  async connectWallet(walletType: WalletType): Promise<boolean> {
    if (!this.localMoneyWallet) {
      throw new Error('Enhanced wallet not configured. Use createWithEnhancedWallet() method.');
    }
    return this.localMoneyWallet.connectWallet(walletType);
  }

  /**
   * Connect with keypair (if using enhanced wallet)
   */
  async connectWithKeypair(keypair: Keypair): Promise<boolean> {
    if (!this.localMoneyWallet) {
      throw new Error('Enhanced wallet not configured. Use createWithEnhancedWallet() method.');
    }
    return this.localMoneyWallet.connectWithKeypair(keypair);
  }

  /**
   * Disconnect wallet (if using enhanced wallet)
   */
  async disconnectWallet(): Promise<void> {
    if (this.localMoneyWallet) {
      await this.localMoneyWallet.disconnect();
    }
  }

  /**
   * Auto-reconnect to last wallet (if using enhanced wallet)
   */
  async autoReconnectWallet(): Promise<boolean> {
    if (!this.localMoneyWallet) {
      return false;
    }
    return this.localMoneyWallet.autoReconnect();
  }

  /**
   * Get wallet balance (if using enhanced wallet)
   */
  async getWalletBalance(): Promise<number> {
    if (!this.localMoneyWallet) {
      return 0;
    }
    return this.localMoneyWallet.getBalance();
  }

  /**
   * Send transaction with enhanced error handling
   */
  async sendTransaction(
    transaction: any,
    options?: any
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (this.localMoneyWallet) {
      return this.localMoneyWallet.sendTransaction(transaction, options);
    }
    
    // Fallback to standard Anchor provider
    try {
      const signature = await this.provider.sendAndConfirm(transaction, [], options);
      return { success: true, signature };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Private methods

  private initializeProgramSDKs(): void {
    // For now, we'll create mock programs since we don't have the actual IDLs
    // In a real implementation, you would initialize with actual Anchor programs:
    // const hubProgram = new Program(HubIDL, this.programAddresses.hub, this.provider);
    
    // Create mock program objects for now
    const createMockProgram = (programId: PublicKey) => ({
      programId,
      provider: this.provider,
      methods: {},
      account: {},
      rpc: {},
    });

    const hubProgram = createMockProgram(this.programAddresses.hub) as Program;
    const profileProgram = createMockProgram(this.programAddresses.profile) as Program;
    const priceProgram = createMockProgram(this.programAddresses.price) as Program;

    // Initialize program SDKs
    this.hub = new HubSDK(hubProgram, this.programAddresses);
    this.profile = new ProfileSDK(profileProgram, this.programAddresses);
    this.price = new PriceSDK(priceProgram, this.programAddresses);
  }
}

/**
 * Utility function to create a wallet from a keypair
 */
export function createWallet(keypair: Keypair): Wallet {
  return new Wallet(keypair);
}

/**
 * Utility function to create a connection with common configurations
 */
export function createConnection(
  endpoint: string,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
): Connection {
  return new Connection(endpoint, commitment);
}

/**
 * Common endpoint URLs
 */
export const ENDPOINTS = {
  MAINNET: 'https://api.mainnet-beta.solana.com',
  DEVNET: 'https://api.devnet.solana.com',
  TESTNET: 'https://api.testnet.solana.com',
  LOCALHOST: 'http://localhost:8899',
} as const;