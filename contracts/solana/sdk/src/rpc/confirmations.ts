import { 
  Connection, 
  TransactionSignature,
  Commitment,
  RpcResponseAndContext,
  SignatureResult
} from '@solana/web3.js';

export class TransactionError extends Error {
  constructor(
    message: string,
    public cause?: any,
    public logs?: string[]
  ) {
    super(message);
    this.name = 'TransactionError';
  }
}

export async function confirmTransaction(
  connection: Connection,
  signature: TransactionSignature,
  commitment: Commitment = 'confirmed',
  maxRetries: number = 30,
  retryDelay: number = 1000
): Promise<RpcResponseAndContext<SignatureResult>> {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const result = await connection.getSignatureStatus(signature);
      
      if (result.value === null) {
        // Transaction not found yet
        retries++;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      
      if (result.value.err) {
        throw new TransactionError(
          `Transaction failed: ${JSON.stringify(result.value.err)}`,
          result.value.err
        );
      }
      
      if (result.value.confirmationStatus === commitment || 
          result.value.confirmationStatus === 'finalized') {
        return {
          context: result.context,
          value: result.value
        };
      }
      
      retries++;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } catch (error: any) {
      if (error instanceof TransactionError) {
        throw error;
      }
      
      retries++;
      if (retries >= maxRetries) {
        throw new TransactionError(
          `Failed to confirm transaction after ${maxRetries} retries`,
          error
        );
      }
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new TransactionError(
    `Transaction confirmation timeout after ${maxRetries} retries`
  );
}

export async function getTransactionLogs(
  connection: Connection,
  signature: TransactionSignature
): Promise<string[] | null> {
  try {
    const transaction = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    return transaction?.meta?.logMessages || null;
  } catch (error) {
    console.error('Failed to fetch transaction logs:', error);
    return null;
  }
}

export async function waitForNewBlock(
  connection: Connection,
  targetHeight?: number
): Promise<number> {
  const currentHeight = await connection.getBlockHeight();
  const target = targetHeight || currentHeight + 1;
  
  while (true) {
    const height = await connection.getBlockHeight();
    if (height >= target) {
      return height;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

export interface TransactionConfirmationOptions {
  commitment?: Commitment;
  maxRetries?: number;
  retryDelay?: number;
  includesLogs?: boolean;
}

export async function confirmTransactionWithLogs(
  connection: Connection,
  signature: TransactionSignature,
  options: TransactionConfirmationOptions = {}
): Promise<{
  result: RpcResponseAndContext<SignatureResult>;
  logs?: string[] | null;
}> {
  const result = await confirmTransaction(
    connection,
    signature,
    options.commitment || 'confirmed',
    options.maxRetries || 30,
    options.retryDelay || 1000
  );
  
  if (options.includesLogs) {
    const logs = await getTransactionLogs(connection, signature);
    return { result, logs };
  }
  
  return { result };
}

export function parseTransactionError(error: any): {
  message: string;
  code?: number;
  logs?: string[];
} {
  if (error instanceof TransactionError) {
    return {
      message: error.message,
      logs: error.logs
    };
  }
  
  // Handle Anchor errors
  if (error.error?.errorCode) {
    return {
      message: error.error.errorMessage || 'Unknown Anchor error',
      code: error.error.errorCode.code || error.error.errorCode.number,
      logs: error.logs
    };
  }
  
  // Handle Solana errors
  if (error.logs && Array.isArray(error.logs)) {
    const errorLog = error.logs.find((log: string) => 
      log.includes('Error') || log.includes('failed')
    );
    
    return {
      message: errorLog || error.message || 'Unknown error',
      logs: error.logs
    };
  }
  
  return {
    message: error.message || error.toString() || 'Unknown error'
  };
}