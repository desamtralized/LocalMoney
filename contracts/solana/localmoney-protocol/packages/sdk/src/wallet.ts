import { 
  Connection, 
  PublicKey, 
  Transaction, 
  VersionedTransaction, 
  SendOptions,
  Commitment,
  Keypair 
} from '@solana/web3.js';
import { Wallet as AnchorWallet } from '@coral-xyz/anchor';

/**
 * Supported wallet types
 */
export enum WalletType {
  PHANTOM = 'phantom',
  SOLFLARE = 'solflare',
  COINBASE = 'coinbaseWalletSolana',
  TORUS = 'torus',
  LEDGER = 'ledger',
  SOLLET = 'sollet',
  KEYPAIR = 'keypair',
  UNKNOWN = 'unknown'
}

/**
 * Wallet connection state
 */
export enum WalletConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

/**
 * Wallet info interface
 */
export interface WalletInfo {
  name: string;
  type: WalletType;
  icon?: string;
  url?: string;
  installed: boolean;
  available: boolean;
}

/**
 * Wallet connection options
 */
export interface WalletConnectionOptions {
  autoConnect?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  onlyIfTrusted?: boolean;
}

/**
 * Wallet state
 */
export interface WalletState {
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  publicKey: PublicKey | null;
  walletType: WalletType;
  connectionState: WalletConnectionState;
  error: string | null;
  balance?: number;
  lastConnected?: Date;
}

/**
 * Transaction signing result
 */
export interface SigningResult {
  success: boolean;
  signature?: string;
  error?: string;
  cancelled?: boolean;
}

/**
 * Wallet event listeners
 */
export interface WalletEvents {
  connect: (publicKey: PublicKey) => void;
  disconnect: () => void;
  error: (error: Error) => void;
  accountChanged: (publicKey: PublicKey | null) => void;
  ready: (wallet: LocalMoneyWallet) => void;
}

/**
 * Enhanced wallet adapter interface
 */
interface WalletAdapter {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnect(): Promise<void>;
  connect(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Enhanced LocalMoney Wallet implementation
 */
export class LocalMoneyWallet implements AnchorWallet {
  private adapter: WalletAdapter | null = null;
  private connection: Connection;
  private state: WalletState;
  private listeners: Partial<WalletEvents> = {};
  private reconnectTimer?: NodeJS.Timeout;
  private options: WalletConnectionOptions;

  constructor(
    connection: Connection,
    options: WalletConnectionOptions = {}
  ) {
    this.connection = connection;
    this.options = {
      autoConnect: false,
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      onlyIfTrusted: false,
      ...options
    };

    this.state = {
      connected: false,
      connecting: false,
      disconnecting: false,
      publicKey: null,
      walletType: WalletType.UNKNOWN,
      connectionState: WalletConnectionState.DISCONNECTED,
      error: null,
    };

    this.setupEventListeners();
  }

  /**
   * Get current wallet public key
   */
  get publicKey(): PublicKey | null {
    return this.state.publicKey;
  }

  /**
   * Get current wallet state
   */
  getState(): WalletState {
    return { ...this.state };
  }

  /**
   * Check if wallet is connected
   */
  get connected(): boolean {
    return this.state.connected;
  }

  /**
   * Get available wallets
   */
  static getAvailableWallets(): WalletInfo[] {
    const wallets: WalletInfo[] = [];
    
    // Check for Phantom
    if (typeof window !== 'undefined' && (window as any).phantom?.solana) {
      wallets.push({
        name: 'Phantom',
        type: WalletType.PHANTOM,
        icon: 'https://phantom.app/img/phantom-icon.svg',
        url: 'https://phantom.app',
        installed: true,
        available: (window as any).phantom.solana.isPhantom
      });
    } else {
      wallets.push({
        name: 'Phantom',
        type: WalletType.PHANTOM,
        icon: 'https://phantom.app/img/phantom-icon.svg',
        url: 'https://phantom.app',
        installed: false,
        available: false
      });
    }

    // Check for Solflare
    if (typeof window !== 'undefined' && (window as any).solflare?.isSolflare) {
      wallets.push({
        name: 'Solflare',
        type: WalletType.SOLFLARE,
        icon: 'https://solflare.com/img/logo.svg',
        url: 'https://solflare.com',
        installed: true,
        available: true
      });
    } else {
      wallets.push({
        name: 'Solflare',
        type: WalletType.SOLFLARE,
        icon: 'https://solflare.com/img/logo.svg',
        url: 'https://solflare.com',
        installed: false,
        available: false
      });
    }

    // Check for Coinbase
    if (typeof window !== 'undefined' && (window as any).coinbaseSolana) {
      wallets.push({
        name: 'Coinbase Wallet',
        type: WalletType.COINBASE,
        url: 'https://www.coinbase.com/wallet',
        installed: true,
        available: true
      });
    } else {
      wallets.push({
        name: 'Coinbase Wallet',
        type: WalletType.COINBASE,
        url: 'https://www.coinbase.com/wallet',
        installed: false,
        available: false
      });
    }

    return wallets;
  }

  /**
   * Connect to a specific wallet type
   */
  async connectWallet(walletType: WalletType): Promise<boolean> {
    if (this.state.connecting) {
      throw new Error('Wallet connection already in progress');
    }

    this.updateState({
      connecting: true,
      connectionState: WalletConnectionState.CONNECTING,
      error: null
    });

    try {
      this.adapter = await this.createWalletAdapter(walletType);
      
      if (!this.adapter) {
        throw new Error(`Wallet ${walletType} not available`);
      }

      await this.adapter.connect();
      
      this.updateState({
        connected: true,
        connecting: false,
        publicKey: this.adapter.publicKey,
        walletType,
        connectionState: WalletConnectionState.CONNECTED,
        error: null,
        lastConnected: new Date()
      });

      // Update balance
      await this.updateBalance();

      // Emit connect event
      this.emit('connect', this.adapter.publicKey!);
      this.emit('ready', this);

      return true;

    } catch (error: any) {
      this.updateState({
        connecting: false,
        connectionState: WalletConnectionState.ERROR,
        error: error.message
      });

      this.emit('error', error);
      return false;
    }
  }

  /**
   * Connect with keypair (for development/testing)
   */
  async connectWithKeypair(keypair: Keypair): Promise<boolean> {
    this.adapter = {
      publicKey: keypair.publicKey,
      connected: true,
      connecting: false,
      async connect() {},
      async disconnect() {},
      async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
        if (transaction instanceof Transaction) {
          transaction.partialSign(keypair);
        }
        // Note: VersionedTransaction signing would need different handling
        return transaction;
      },
      async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
        return transactions.map(tx => {
          if (tx instanceof Transaction) {
            tx.partialSign(keypair);
          }
          return tx;
        });
      }
    };

    this.updateState({
      connected: true,
      connecting: false,
      publicKey: keypair.publicKey,
      walletType: WalletType.KEYPAIR,
      connectionState: WalletConnectionState.CONNECTED,
      error: null,
      lastConnected: new Date()
    });

    await this.updateBalance();
    this.emit('connect', keypair.publicKey);
    this.emit('ready', this);

    return true;
  }

  /**
   * Disconnect wallet
   */
  async disconnect(): Promise<void> {
    if (!this.adapter || this.state.disconnecting) {
      return;
    }

    this.updateState({ disconnecting: true });

    try {
      await this.adapter.disconnect();
    } catch (error) {
      console.warn('Error during wallet disconnection:', error);
    }

    this.adapter = null;
    this.clearReconnectTimer();

    this.updateState({
      connected: false,
      connecting: false,
      disconnecting: false,
      publicKey: null,
      walletType: WalletType.UNKNOWN,
      connectionState: WalletConnectionState.DISCONNECTED,
      error: null,
      balance: undefined
    });

    this.emit('disconnect');
  }

  /**
   * Auto-reconnect to last connected wallet
   */
  async autoReconnect(): Promise<boolean> {
    const lastWalletType = this.getLastConnectedWalletType();
    if (lastWalletType && lastWalletType !== WalletType.UNKNOWN) {
      return this.connectWallet(lastWalletType);
    }
    return false;
  }

  /**
   * Sign a transaction
   */
  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (!this.adapter || !this.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      return await this.adapter.signTransaction(transaction);
    } catch (error: any) {
      if (error.code === 4001 || error.message.includes('User rejected')) {
        throw new Error('Transaction rejected by user');
      }
      throw error;
    }
  }

  /**
   * Sign multiple transactions
   */
  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    if (!this.adapter || !this.connected) {
      throw new Error('Wallet not connected');
    }

    return this.adapter.signAllTransactions(transactions);
  }

  /**
   * Sign a message (if supported)
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.adapter || !this.connected) {
      throw new Error('Wallet not connected');
    }

    if (!this.adapter.signMessage) {
      throw new Error('Message signing not supported by this wallet');
    }

    return this.adapter.signMessage(message);
  }

  /**
   * Send a transaction with enhanced options
   */
  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    options?: SendOptions
  ): Promise<SigningResult> {
    if (!this.adapter || !this.connected) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      // Sign the transaction
      const signedTransaction = await this.signTransaction(transaction);
      
      // Send the transaction
      const signature = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        options
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { success: true, signature };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message,
        cancelled: error.code === 4001 || error.message.includes('User rejected')
      };
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<number> {
    if (!this.publicKey) {
      return 0;
    }

    try {
      const balance = await this.connection.getBalance(this.publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch {
      return 0;
    }
  }

  /**
   * Update balance in state
   */
  async updateBalance(): Promise<void> {
    const balance = await this.getBalance();
    this.updateState({ balance });
  }

  /**
   * Add event listener
   */
  on<K extends keyof WalletEvents>(event: K, listener: WalletEvents[K]): void {
    this.listeners[event] = listener;
  }

  /**
   * Remove event listener
   */
  off<K extends keyof WalletEvents>(event: K): void {
    delete this.listeners[event];
  }

  // Private methods

  private updateState(updates: Partial<WalletState>): void {
    this.state = { ...this.state, ...updates };
  }

  private emit<K extends keyof WalletEvents>(event: K, ...args: Parameters<WalletEvents[K]>): void {
    const listener = this.listeners[event];
    if (listener) {
      (listener as any)(...args);
    }
  }

  private async createWalletAdapter(walletType: WalletType): Promise<WalletAdapter | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    switch (walletType) {
      case WalletType.PHANTOM:
        const phantom = (window as any).phantom?.solana;
        if (phantom?.isPhantom) {
          return phantom;
        }
        break;

      case WalletType.SOLFLARE:
        const solflare = (window as any).solflare;
        if (solflare?.isSolflare) {
          return solflare;
        }
        break;

      case WalletType.COINBASE:
        const coinbase = (window as any).coinbaseSolana;
        if (coinbase) {
          return coinbase;
        }
        break;

      default:
        return null;
    }

    return null;
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Account change listeners for different wallets
    if ((window as any).phantom?.solana) {
      (window as any).phantom.solana.on('accountChanged', (publicKey: PublicKey | null) => {
        this.handleAccountChanged(publicKey);
      });
    }

    if ((window as any).solflare) {
      (window as any).solflare.on('accountChanged', (publicKey: PublicKey | null) => {
        this.handleAccountChanged(publicKey);
      });
    }
  }

  private handleAccountChanged(publicKey: PublicKey | null): void {
    if (this.connected) {
      this.updateState({ publicKey });
      this.emit('accountChanged', publicKey);
      
      if (publicKey) {
        this.updateBalance();
      }
    }
  }

  private getLastConnectedWalletType(): WalletType {
    if (typeof window === 'undefined') return WalletType.UNKNOWN;
    
    const stored = localStorage.getItem('localmoney_wallet_type');
    return stored as WalletType || WalletType.UNKNOWN;
  }

  private saveWalletType(walletType: WalletType): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('localmoney_wallet_type', walletType);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}

/**
 * Wallet utilities
 */
export class WalletUtils {
  /**
   * Check if a wallet is installed
   */
  static isWalletInstalled(walletType: WalletType): boolean {
    if (typeof window === 'undefined') return false;

    switch (walletType) {
      case WalletType.PHANTOM:
        return !!(window as any).phantom?.solana?.isPhantom;
      case WalletType.SOLFLARE:
        return !!(window as any).solflare?.isSolflare;
      case WalletType.COINBASE:
        return !!(window as any).coinbaseSolana;
      default:
        return false;
    }
  }

  /**
   * Get wallet installation URL
   */
  static getWalletInstallUrl(walletType: WalletType): string {
    switch (walletType) {
      case WalletType.PHANTOM:
        return 'https://phantom.app/download';
      case WalletType.SOLFLARE:
        return 'https://solflare.com/download';
      case WalletType.COINBASE:
        return 'https://www.coinbase.com/wallet';
      default:
        return '';
    }
  }

  /**
   * Format wallet address for display
   */
  static formatAddress(address: PublicKey | string, length: number = 4): string {
    const addr = typeof address === 'string' ? address : address.toString();
    if (addr.length <= length * 2) return addr;
    return `${addr.slice(0, length)}...${addr.slice(-length)}`;
  }

  /**
   * Validate Solana address
   */
  static isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a LocalMoney wallet instance
 */
export function createLocalMoneyWallet(
  connection: Connection,
  options?: WalletConnectionOptions
): LocalMoneyWallet {
  return new LocalMoneyWallet(connection, options);
}