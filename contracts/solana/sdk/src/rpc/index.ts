// Layer 3: RPC Execution
// Export RPC methods for executing signed transactions

export * from './methods';
export * from './confirmations';

// Re-export main RPC class
export { LocalMoneyRPC } from './methods';

// Re-export error handling utilities
export { 
  TransactionError,
  confirmTransaction,
  confirmTransactionWithLogs,
  getTransactionLogs,
  waitForNewBlock,
  parseTransactionError
} from './confirmations';