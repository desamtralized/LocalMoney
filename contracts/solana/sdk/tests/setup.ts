import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';

// Mock wallet implementation for testing
class MockWallet implements Wallet {
  constructor(public payer: Keypair) {}
  
  get publicKey() {
    return this.payer.publicKey;
  }
  
  async signTransaction(tx: any) {
    tx.partialSign(this.payer);
    return tx;
  }
  
  async signAllTransactions(txs: any[]) {
    return txs.map(tx => {
      tx.partialSign(this.payer);
      return tx;
    });
  }
}

// Mock wallet for testing
export const mockWallet = new MockWallet(Keypair.generate());

// Mock connection for unit tests
export const mockConnection = new Connection('http://localhost:8899', 'confirmed');

// Mock program IDs for testing
export const mockProgramIds = {
  hub: new PublicKey('Gr8Kfgo4KvghW2c1rSUNtTLGhJkNkfcvgP9hm4hmRLTB'),
  profile: new PublicKey('2rVGr7xLg8KMfNZQ5EjAcL5vtpRX9KvZKP3hQ6f8W2c4'),
  price: new PublicKey('3sVGr7xLg8KMfNZQ5EjAcL5vtpRX9KvZKP3hQ6f8W2c5'),
  offer: new PublicKey('4tVGr7xLg8KMfNZQ5EjAcL5vtpRX9KvZKP3hQ6f8W2c6'),
  trade: new PublicKey('5uVGr7xLg8KMfNZQ5EjAcL5vtpRX9KvZKP3hQ6f8W2c7')
};

// Global test timeout
jest.setTimeout(60000);

// Mock console.error to avoid noise in tests
global.console = {
  ...console,
  error: jest.fn()
};