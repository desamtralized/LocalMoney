import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { BN } from 'bn.js';
import {
  LocalMoneyError,
  ErrorCategory,
  ErrorSeverity,
  RecoveryStrategy,
  CircuitBreakerState,
  ErrorClassifier,
  CircuitBreaker,
  RetryManager,
  RecoveryManager,
  EnhancedErrorHandler,
  ConsoleLogger,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_CIRCUIT_BREAKER_CONFIG
} from '../src/error-handling';
import { EnhancedLocalMoneySDK, EnhancedSDKConfig } from '../src/enhanced-sdk';
import { ProgramAddresses } from '../src/types';

// Mock logger for testing
class MockLogger {
  public logs: Array<{ level: string; message: string; context?: any; error?: Error }> = [];

  debug(message: string, context?: any): void {
    this.logs.push({ level: 'debug', message, context });
  }

  info(message: string, context?: any): void {
    this.logs.push({ level: 'info', message, context });
  }

  warn(message: string, context?: any): void {
    this.logs.push({ level: 'warn', message, context });
  }

  error(message: string, error?: Error, context?: any): void {
    this.logs.push({ level: 'error', message, error, context });
  }

  clear(): void {
    this.logs = [];
  }

  getLogs(level?: string): Array<any> {
    return level ? this.logs.filter(log => log.level === level) : this.logs;
  }
}

describe('Error Handling System', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = new MockLogger();
    jest.clearAllMocks();
  });

  describe('LocalMoneyError', () => {
    test('should create error with all properties', () => {
      const context = { operation: 'test', account: 'abc123' };
      const originalError = new Error('Original error');
      
      const error = new LocalMoneyError(
        'Test error message',
        ErrorCategory.NETWORK,
        ErrorSeverity.HIGH,
        'TEST_ERROR',
        originalError,
        context,
        true,
        RecoveryStrategy.RETRY
      );

      expect(error.message).toBe('Test error message');
      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.originalError).toBe(originalError);
      expect(error.context).toEqual(context);
      expect(error.recoverable).toBe(true);
      expect(error.suggestedStrategy).toBe(RecoveryStrategy.RETRY);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    test('should serialize to JSON correctly', () => {
      const error = new LocalMoneyError(
        'Test error',
        ErrorCategory.RPC,
        ErrorSeverity.MEDIUM
      );

      const json = error.toJSON();

      expect(json.name).toBe('LocalMoneyError');
      expect(json.message).toBe('Test error');
      expect(json.category).toBe(ErrorCategory.RPC);
      expect(json.severity).toBe(ErrorSeverity.MEDIUM);
      expect(json.recoverable).toBe(true);
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('ErrorClassifier', () => {
    test('should classify network errors correctly', () => {
      const networkErrors = [
        new Error('Network connection failed'),
        new Error('ECONNREFUSED'),
        new Error('ETIMEDOUT'),
        new Error('Fetch error occurred'),
      ];

      networkErrors.forEach(error => {
        const classified = ErrorClassifier.classifyError(error);
        expect(classified.category).toBe(ErrorCategory.NETWORK);
        expect(classified.suggestedStrategy).toBe(RecoveryStrategy.RETRY);
      });
    });

    test('should classify RPC errors correctly', () => {
      const rpcErrors = [
        new Error('RPC endpoint failed'),
        new Error('JSON-RPC error'),
        new Error('Rate limit exceeded'),
        new Error('HTTP 429 Too Many Requests'),
        new Error('Gateway timeout 502'),
      ];

      rpcErrors.forEach(error => {
        const classified = ErrorClassifier.classifyError(error);
        expect([ErrorCategory.RPC, ErrorCategory.RATE_LIMIT]).toContain(classified.category);
      });
    });

    test('should classify program errors correctly', () => {
      const programErrors = [
        new Error('Program error: 0x1234'),
        new Error('Anchor instruction failed'),
        new Error('Program error occurred'),
      ];

      programErrors.forEach(error => {
        const classified = ErrorClassifier.classifyError(error);
        expect(classified.category).toBe(ErrorCategory.PROGRAM);
        expect(classified.suggestedStrategy).toBe(RecoveryStrategy.FALLBACK);
      });
    });

    test('should classify account errors correctly', () => {
      const accountErrors = [
        new Error('Account not found'),
        new Error('Invalid account data'),
        new Error('PDA derivation failed'),
        new Error('Account does not exist'),
      ];

      accountErrors.forEach(error => {
        const classified = ErrorClassifier.classifyError(error);
        expect(classified.category).toBe(ErrorCategory.ACCOUNT);
        expect(classified.suggestedStrategy).toBe(RecoveryStrategy.CACHE);
      });
    });

    test('should classify validation errors as non-recoverable', () => {
      const validationErrors = [
        new Error('Validation failed'),
        new Error('Invalid input parameter'),
        new Error('Constraint violation'),
        new Error('Assertion failed'),
      ];

      validationErrors.forEach(error => {
        const classified = ErrorClassifier.classifyError(error);
        expect(classified.category).toBe(ErrorCategory.VALIDATION);
        expect(classified.recoverable).toBe(false);
        expect(classified.suggestedStrategy).toBe(RecoveryStrategy.MANUAL);
      });
    });

    test('should classify authentication errors as non-recoverable', () => {
      const authErrors = [
        new Error('Unauthorized access'),
        new Error('HTTP 401 Unauthorized'),
        new Error('Permission denied'),
        new Error('HTTP 403 Forbidden'),
      ];

      authErrors.forEach(error => {
        const classified = ErrorClassifier.classifyError(error);
        expect([ErrorCategory.AUTHENTICATION, ErrorCategory.PERMISSION]).toContain(classified.category);
        expect(classified.recoverable).toBe(false);
        expect(classified.suggestedStrategy).toBe(RecoveryStrategy.MANUAL);
      });
    });
  });

  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        monitoringPeriod: 5000,
        resetTimeout: 1000,
      }, mockLogger);
    });

    test('should start in CLOSED state', () => {
      const status = circuitBreaker.getStatus();
      expect(status.state).toBe(CircuitBreakerState.CLOSED);
      expect(status.failureCount).toBe(0);
    });

    test('should execute successful operations normally', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getStatus().state).toBe(CircuitBreakerState.CLOSED);
    });

    test('should open circuit after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Trigger enough failures to open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      expect(circuitBreaker.getStatus().state).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.getStatus().failureCount).toBe(3);
    });

    test('should reject operations when circuit is OPEN', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Try to execute when circuit is open
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
      expect(mockLogger.getLogs('warn')).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('Circuit breaker opened')
        })
      );
    });

    test('should transition to HALF_OPEN after reset timeout', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      expect(circuitBreaker.getStatus().state).toBe(CircuitBreakerState.OPEN);
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Next operation should transition to HALF_OPEN
      operation.mockResolvedValueOnce('success');
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getStatus().state).toBe(CircuitBreakerState.HALF_OPEN);
    });

    test('should reset to CLOSED after successful operations in HALF_OPEN', async () => {
      const operation = jest.fn();
      
      // Open the circuit
      operation.mockRejectedValue(new Error('Operation failed'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Wait for reset timeout and execute successful operations
      await new Promise(resolve => setTimeout(resolve, 1100));
      operation.mockResolvedValue('success');
      
      // Execute enough successful operations to close the circuit
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getStatus().state).toBe(CircuitBreakerState.HALF_OPEN);
      
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getStatus().state).toBe(CircuitBreakerState.CLOSED);
      
      expect(mockLogger.getLogs('info')).toContainEqual(
        expect.objectContaining({
          message: 'Circuit breaker reset to CLOSED'
        })
      );
    });

    test('should reset manually', () => {
      // Open the circuit first
      const status = circuitBreaker.getStatus();
      circuitBreaker['failureCount'] = 5;
      circuitBreaker['state'] = CircuitBreakerState.OPEN;
      
      circuitBreaker.reset();
      
      const newStatus = circuitBreaker.getStatus();
      expect(newStatus.state).toBe(CircuitBreakerState.CLOSED);
      expect(newStatus.failureCount).toBe(0);
      expect(mockLogger.getLogs('info')).toContainEqual(
        expect.objectContaining({
          message: 'Circuit breaker manually reset'
        })
      );
    });
  });

  describe('RetryManager', () => {
    let retryManager: RetryManager;

    beforeEach(() => {
      retryManager = new RetryManager({
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: false,
        retryableErrors: [ErrorCategory.NETWORK, ErrorCategory.RPC, ErrorCategory.TIMEOUT],
        timeoutMs: 5000,
      }, mockLogger);
    });

    test('should execute successful operations without retry', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const context = { operation: 'test' };
      
      const result = await retryManager.executeWithRetry(operation, context);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should retry retryable errors', async () => {
      const operation = jest.fn();
      operation.mockRejectedValueOnce(new LocalMoneyError('Network error', ErrorCategory.NETWORK));
      operation.mockRejectedValueOnce(new LocalMoneyError('RPC error', ErrorCategory.RPC));
      operation.mockResolvedValueOnce('success');
      
      const context = { operation: 'test' };
      
      const result = await retryManager.executeWithRetry(operation, context);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(mockLogger.getLogs('warn')).toHaveLength(2);
      expect(mockLogger.getLogs('info')).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('Operation succeeded on attempt 3')
        })
      );
    });

    test('should not retry non-retryable errors', async () => {
      const error = new LocalMoneyError('Validation error', ErrorCategory.VALIDATION, ErrorSeverity.LOW, undefined, undefined, undefined, false);
      const operation = jest.fn().mockRejectedValue(error);
      const context = { operation: 'test' };
      
      await expect(retryManager.executeWithRetry(operation, context)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should fail after max attempts', async () => {
      const error = new LocalMoneyError('Network error', ErrorCategory.NETWORK);
      const operation = jest.fn().mockRejectedValue(error);
      const context = { operation: 'test' };
      
      await expect(retryManager.executeWithRetry(operation, context)).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(3);
      expect(mockLogger.getLogs('error')).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('Operation failed after 3 attempts')
        })
      );
    });

    test('should apply exponential backoff', async () => {
      const operation = jest.fn();
      operation.mockRejectedValueOnce(new LocalMoneyError('Network error', ErrorCategory.NETWORK));
      operation.mockRejectedValueOnce(new LocalMoneyError('Network error', ErrorCategory.NETWORK));
      operation.mockResolvedValueOnce('success');
      
      const context = { operation: 'test' };
      const startTime = Date.now();
      
      const result = await retryManager.executeWithRetry(operation, context);
      const duration = Date.now() - startTime;
      
      expect(result).toBe('success');
      // Should have waited at least 100ms + 200ms = 300ms for the delays
      expect(duration).toBeGreaterThan(250);
    });

    test('should timeout operations', async () => {
      const timeoutRetryManager = new RetryManager({
        maxAttempts: 2,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: false,
        retryableErrors: [ErrorCategory.NETWORK],
        timeoutMs: 500,
      }, mockLogger);
      
      const operation = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );
      const context = { operation: 'test' };
      
      await expect(timeoutRetryManager.executeWithRetry(operation, context)).rejects.toThrow('Operation timed out');
    });

    test('should store and retrieve attempt history', async () => {
      const error = new LocalMoneyError('Network error', ErrorCategory.NETWORK);
      const operation = jest.fn().mockRejectedValue(error);
      const context = { operation: 'test', account: 'abc123' };
      
      try {
        await retryManager.executeWithRetry(operation, context);
      } catch (e) {
        // Expected to fail
      }
      
      const attempts = retryManager.getAttempts(context);
      expect(attempts).toHaveLength(3);
      expect(attempts[0].attempt).toBe(1);
      expect(attempts[1].attempt).toBe(2);
      expect(attempts[2].attempt).toBe(3);
    });

    test('should clear attempt history', async () => {
      const context = { operation: 'test', account: 'abc123' };
      
      // Add some attempts
      try {
        const error = new LocalMoneyError('Network error', ErrorCategory.NETWORK);
        const operation = jest.fn().mockRejectedValue(error);
        await retryManager.executeWithRetry(operation, context);
      } catch (e) {
        // Expected to fail
      }
      
      expect(retryManager.getAttempts(context)).toHaveLength(3);
      
      retryManager.clearAttempts(context);
      expect(retryManager.getAttempts(context)).toHaveLength(0);
    });
  });

  describe('RecoveryManager', () => {
    let recoveryManager: RecoveryManager;

    beforeEach(() => {
      recoveryManager = new RecoveryManager({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        monitoringPeriod: 5000,
        resetTimeout: 500,
      }, 60000, mockLogger);
    });

    test('should execute successful operations normally', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await recoveryManager.executeWithRecovery(operation);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.strategy).toBe(RecoveryStrategy.RETRY);
      expect(result.attempts).toBe(1);
    });

    test('should use fallback operation on failure', async () => {
      const primaryOperation = jest.fn().mockRejectedValue(new LocalMoneyError('Primary failed', ErrorCategory.PROGRAM, ErrorSeverity.HIGH, undefined, undefined, undefined, true, RecoveryStrategy.FALLBACK));
      const fallbackOperation = jest.fn().mockResolvedValue('fallback success');
      
      const result = await recoveryManager.executeWithRecovery(primaryOperation, fallbackOperation);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('fallback success');
      expect(result.strategy).toBe(RecoveryStrategy.FALLBACK);
      expect(result.attempts).toBe(2);
    });

    test('should use cached data when available', async () => {
      const context = { operation: 'test', account: 'abc123' };
      
      // Cache some data
      recoveryManager.cacheResult('test::abc123', 'cached data');
      
      const operation = jest.fn().mockRejectedValue(new LocalMoneyError('Operation failed', ErrorCategory.ACCOUNT, ErrorSeverity.MEDIUM, undefined, undefined, undefined, true, RecoveryStrategy.CACHE));
      
      const result = await recoveryManager.executeWithRecovery(operation, undefined, context);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('cached data');
      expect(result.strategy).toBe(RecoveryStrategy.CACHE);
      expect(result.metadata?.fromCache).toBe(true);
    });

    test('should fail when no recovery strategy works', async () => {
      const operation = jest.fn().mockRejectedValue(new LocalMoneyError('Unrecoverable error', ErrorCategory.VALIDATION, ErrorSeverity.HIGH, undefined, undefined, undefined, false, RecoveryStrategy.MANUAL));
      
      const result = await recoveryManager.executeWithRecovery(operation);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(LocalMoneyError);
      expect(result.strategy).toBe(RecoveryStrategy.MANUAL);
    });

    test('should cache successful results', () => {
      const key = 'test:key';
      const data = { test: 'data' };
      
      recoveryManager.cacheResult(key, data);
      
      const retrieved = recoveryManager.getFromCache(key);
      expect(retrieved).toEqual(data);
    });

    test('should expire cached data', () => {
      const key = 'test:key';
      const data = { test: 'data' };
      
      recoveryManager.cacheResult(key, data, 100); // 100ms TTL
      
      // Should be available immediately
      expect(recoveryManager.getFromCache(key)).toEqual(data);
      
      // Should expire after TTL
      setTimeout(() => {
        expect(recoveryManager.getFromCache(key)).toBeNull();
      }, 150);
    });

    test('should clear cache with pattern', () => {
      recoveryManager.cacheResult('test:key1', 'data1');
      recoveryManager.cacheResult('test:key2', 'data2');
      recoveryManager.cacheResult('other:key', 'data3');
      
      recoveryManager.clearCache('test');
      
      expect(recoveryManager.getFromCache('test:key1')).toBeNull();
      expect(recoveryManager.getFromCache('test:key2')).toBeNull();
      expect(recoveryManager.getFromCache('other:key')).toBe('data3');
    });

    test('should provide circuit breaker statistics', () => {
      const stats = recoveryManager.getCircuitBreakerStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    test('should reset circuit breakers', () => {
      recoveryManager.resetCircuitBreakers();
      // Test passes if no errors are thrown
      expect(true).toBe(true);
    });
  });

  describe('EnhancedErrorHandler', () => {
    let errorHandler: EnhancedErrorHandler;

    beforeEach(() => {
      errorHandler = new EnhancedErrorHandler(
        DEFAULT_RETRY_CONFIGS.minimal,
        DEFAULT_CIRCUIT_BREAKER_CONFIG,
        mockLogger
      );
    });

    test('should execute successful operations', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const context = { operation: 'test' };
      
      const result = await errorHandler.execute(operation, context);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should retry and recover from failures', async () => {
      const operation = jest.fn();
      operation.mockRejectedValueOnce(new LocalMoneyError('Network error', ErrorCategory.NETWORK));
      operation.mockResolvedValueOnce('success');
      
      const context = { operation: 'test' };
      
      const result = await errorHandler.execute(operation, context);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should use fallback when retry fails', async () => {
      const operation = jest.fn().mockRejectedValue(new LocalMoneyError('Operation failed', ErrorCategory.PROGRAM, ErrorSeverity.HIGH, undefined, undefined, undefined, true, RecoveryStrategy.FALLBACK));
      const fallback = jest.fn().mockResolvedValue('fallback success');
      const context = { operation: 'test' };
      
      const result = await errorHandler.execute(operation, context, fallback);
      
      expect(result).toBe('fallback success');
    });

    test('should provide comprehensive statistics', () => {
      const stats = errorHandler.getStats();
      
      expect(stats).toHaveProperty('circuitBreakers');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('totalOperations');
    });

    test('should reset all state', () => {
      errorHandler.reset();
      // Test passes if no errors are thrown
      expect(true).toBe(true);
    });
  });

  describe('EnhancedLocalMoneySDK Integration', () => {
    let connection: Connection;
    let wallet: any;
    let programAddresses: ProgramAddresses;
    let enhancedSDK: EnhancedLocalMoneySDK;

    beforeEach(() => {
      connection = new Connection('http://localhost:8899');
      wallet = { publicKey: Keypair.generate().publicKey, signTransaction: jest.fn(), signAllTransactions: jest.fn() };
      programAddresses = {
        hub: new PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
        profile: new PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
        price: new PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
        offer: new PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
        trade: new PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
        arbitration: new PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
      };

      const config: EnhancedSDKConfig = {
        retryConfig: DEFAULT_RETRY_CONFIGS.minimal,
        logger: mockLogger,
        environment: 'development',
        enableErrorHandling: true,
      };

      enhancedSDK = new EnhancedLocalMoneySDK(connection, wallet, programAddresses, config);
    });

    test('should create enhanced SDK instance', () => {
      expect(enhancedSDK).toBeInstanceOf(EnhancedLocalMoneySDK);
      expect(enhancedSDK.connection).toBe(connection);
      expect(enhancedSDK.programAddresses).toEqual(programAddresses);
    });

    test('should create local development instance', () => {
      const localSDK = EnhancedLocalMoneySDK.createLocal(wallet);
      
      expect(localSDK).toBeInstanceOf(EnhancedLocalMoneySDK);
      expect(localSDK.connection.rpcEndpoint).toBe('http://localhost:8899');
    });

    test('should provide enhanced program SDKs', () => {
      expect(enhancedSDK.hub).toBeDefined();
      expect(enhancedSDK.profile).toBeDefined();
      expect(enhancedSDK.price).toBeDefined();
      expect(enhancedSDK.offer).toBeDefined();
      expect(enhancedSDK.trade).toBeDefined();
      expect(enhancedSDK.arbitration).toBeDefined();
      expect(enhancedSDK.accountFetcher).toBeDefined();
    });

    test('should provide error statistics', () => {
      const stats = enhancedSDK.getErrorStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    test('should reset error handling', () => {
      enhancedSDK.resetErrorHandling();
      // Test passes if no errors are thrown
      expect(true).toBe(true);
    });

    test('should execute operations with error handling when enabled', async () => {
      const operation = jest.fn().mockResolvedValue('test result');
      const context = { operation: 'test' };
      
      const result = await enhancedSDK.executeWithErrorHandling(operation, context);
      
      expect(result).toBe('test result');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should skip error handling when disabled', async () => {
      const disabledSDK = new EnhancedLocalMoneySDK(connection, wallet, programAddresses, {
        enableErrorHandling: false,
      });
      
      const operation = jest.fn().mockResolvedValue('test result');
      const context = { operation: 'test' };
      
      const result = await disabledSDK.executeWithErrorHandling(operation, context);
      
      expect(result).toBe('test result');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Default Configurations', () => {
    test('should provide default retry configurations', () => {
      expect(DEFAULT_RETRY_CONFIGS.aggressive).toBeDefined();
      expect(DEFAULT_RETRY_CONFIGS.conservative).toBeDefined();
      expect(DEFAULT_RETRY_CONFIGS.minimal).toBeDefined();
      
      expect(DEFAULT_RETRY_CONFIGS.aggressive.maxAttempts).toBe(5);
      expect(DEFAULT_RETRY_CONFIGS.conservative.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIGS.minimal.maxAttempts).toBe(2);
    });

    test('should provide default circuit breaker configuration', () => {
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG).toBeDefined();
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold).toBe(5);
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.successThreshold).toBe(3);
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle high-frequency operations efficiently', async () => {
      const errorHandler = new EnhancedErrorHandler(
        DEFAULT_RETRY_CONFIGS.minimal,
        DEFAULT_CIRCUIT_BREAKER_CONFIG,
        mockLogger
      );
      
      const operations: Promise<any>[] = [];
      const operationCount = 100;
      
      for (let i = 0; i < operationCount; i++) {
        const operation = jest.fn().mockResolvedValue(`result-${i}`);
        const context = { operation: `test-${i}` };
        
        operations.push(errorHandler.execute(operation, context));
      }
      
      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(operationCount);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      // Verify all results
      results.forEach((result, index) => {
        expect(result).toBe(`result-${index}`);
      });
    });

    test('should handle concurrent failures without memory leaks', async () => {
      const errorHandler = new EnhancedErrorHandler(
        { ...DEFAULT_RETRY_CONFIGS.minimal, maxAttempts: 2 },
        DEFAULT_CIRCUIT_BREAKER_CONFIG,
        mockLogger
      );
      
      const operations: Promise<any>[] = [];
      const operationCount = 50;
      
      for (let i = 0; i < operationCount; i++) {
        const operation = jest.fn().mockRejectedValue(new LocalMoneyError('Test error', ErrorCategory.NETWORK));
        const context = { operation: `test-${i}` };
        
        operations.push(
          errorHandler.execute(operation, context).catch(error => error)
        );
      }
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(operationCount);
      results.forEach(result => {
        expect(result).toBeInstanceOf(LocalMoneyError);
      });
    });
  });
});