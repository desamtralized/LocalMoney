// Increase timeout for all tests
jest.setTimeout(30000);

// Mock console.warn to reduce noise in tests
console.warn = jest.fn();

// Set up environment variables
process.env.SOLANA_NETWORK = 'localhost';
process.env.SOLANA_RPC_URL = 'http://localhost:8899'; 