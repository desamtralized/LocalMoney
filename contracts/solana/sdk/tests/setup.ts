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

// Mock program IDs for testing - Updated with deployed program IDs
export const mockProgramIds = {
  hub: new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2'),
  profile: new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC'),
  price: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
  offer: new PublicKey('DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj'), // NEW: Updated offer program ID
  trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM')
};

// Global test timeout
jest.setTimeout(60000);

// Mock console.error to avoid noise in tests
global.console = {
  ...console,
  error: jest.fn()
};
