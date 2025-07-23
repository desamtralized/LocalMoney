import { Connection, PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  NETWORK = 'network',
  RPC = 'rpc',
  PROGRAM = 'program',
  ACCOUNT = 'account',
  TRANSACTION = 'transaction',
  VALIDATION = 'validation',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  DATA = 'data',
  SYSTEM = 'system'
}

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  CIRCUIT_BREAKER = 'circuit_breaker',
  CACHE = 'cache',
  MANUAL = 'manual',
  SKIP = 'skip'
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Enhanced error class with detailed context
 */
export class LocalMoneyError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly code: string;
  public readonly originalError?: Error;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;
  public readonly suggestedStrategy: RecoveryStrategy;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    code?: string,
    originalError?: Error,
    context?: Record<string, any>,
    recoverable: boolean = true,
    suggestedStrategy: RecoveryStrategy = RecoveryStrategy.RETRY
  ) {
    super(message);
    this.name = 'LocalMoneyError';
    this.category = category;
    this.severity = severity;
    this.code = code || `${category.toUpperCase()}_ERROR`;
    this.originalError = originalError;
    this.context = context;
    this.timestamp = new Date();
    this.recoverable = recoverable;
    this.suggestedStrategy = suggestedStrategy;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LocalMoneyError);
    }
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      code: this.code,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      suggestedStrategy: this.suggestedStrategy,
      context: this.context,
      stack: this.stack,
      originalError: this.originalError?.message,
    };
  }
}

/**
 * Retry configuration options
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors: ErrorCategory[];
  timeoutMs?: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  monitoringPeriod: number;
  resetTimeout: number;
}

/**
 * Error context for logging and monitoring
 */
export interface ErrorContext {
  operation: string;
  programId?: string;
  account?: string;
  attempt?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Retry attempt result
 */
export interface RetryAttempt {
  attempt: number;
  error: Error;
  delay: number;
  timestamp: Date;
}

/**
 * Recovery result
 */
export interface RecoveryResult<T> {
  success: boolean;
  data?: T;
  error?: LocalMoneyError;
  strategy: RecoveryStrategy;
  attempts: number;
  duration: number;
  metadata?: Record<string, any>;
}

/**
 * Logger interface for error handling
 */
export interface Logger {
  debug(message: string, context?: any): void;
  info(message: string, context?: any): void;
  warn(message: string, context?: any): void;
  error(message: string, error?: Error, context?: any): void;
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements Logger {
  constructor(private enabled: boolean = true) {}

  debug(message: string, context?: any): void {
    if (this.enabled) {
      console.debug(`[DEBUG] ${message}`, context || '');
    }
  }

  info(message: string, context?: any): void {
    if (this.enabled) {
      console.info(`[INFO] ${message}`, context || '');
    }
  }

  warn(message: string, context?: any): void {
    if (this.enabled) {
      console.warn(`[WARN] ${message}`, context || '');
    }
  }

  error(message: string, error?: Error, context?: any): void {
    if (this.enabled) {
      console.error(`[ERROR] ${message}`, error?.message || '', context || '');
    }
  }
}

/**
 * Circuit breaker implementation for preventing cascade failures
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private logger: Logger;

  constructor(
    private config: CircuitBreakerConfig,
    logger?: Logger
  ) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new LocalMoneyError(
          'Circuit breaker is OPEN - operation rejected',
          ErrorCategory.SYSTEM,
          ErrorSeverity.HIGH,
          'CIRCUIT_BREAKER_OPEN',
          undefined,
          { state: this.state, nextAttemptTime: this.nextAttemptTime },
          false,
          RecoveryStrategy.CIRCUIT_BREAKER
        );
      } else {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.logger.info('Circuit breaker transitioning to HALF_OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        this.successCount = 0;
        this.logger.info('Circuit breaker reset to CLOSED');
      }
    }
  }

  private onFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.resetTimeout;
      this.successCount = 0;
      this.logger.warn('Circuit breaker opened from HALF_OPEN due to failure');
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.resetTimeout;
      this.logger.warn(`Circuit breaker opened due to ${this.failureCount} failures`);
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    this.logger.info('Circuit breaker manually reset');
  }
}

/**
 * Enhanced retry manager with exponential backoff and jitter
 */
export class RetryManager {
  private attempts: Map<string, RetryAttempt[]> = new Map();
  private logger: Logger;

  constructor(
    private config: RetryConfig,
    logger?: Logger
  ) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    const operationKey = this.getOperationKey(context);
    const attempts: RetryAttempt[] = [];
    
    let lastError: Error;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        // Add timeout if configured
        const result = this.config.timeoutMs
          ? await this.withTimeout(operation(), this.config.timeoutMs)
          : await operation();

        // Success - clear any stored attempts
        this.attempts.delete(operationKey);
        
        if (attempt > 1) {
          this.logger.info(
            `Operation succeeded on attempt ${attempt}`,
            { ...context, attempts: attempts.length }
          );
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        const localMoneyError = this.classifyError(lastError, context);
        
        const attemptInfo: RetryAttempt = {
          attempt,
          error: localMoneyError,
          delay: 0,
          timestamp: new Date(),
        };
        attempts.push(attemptInfo);

        // Check if error is retryable
        if (!this.isRetryableError(localMoneyError) || attempt === this.config.maxAttempts) {
          this.attempts.set(operationKey, attempts);
          this.logger.error(
            `Operation failed after ${attempt} attempts`,
            localMoneyError,
            { ...context, attempts: attempts.length, duration: Date.now() - startTime }
          );
          throw localMoneyError;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        attemptInfo.delay = delay;

        this.logger.warn(
          `Operation failed on attempt ${attempt}, retrying in ${delay}ms`,
          { error: localMoneyError.message, ...context }
        );

        await this.sleep(delay);
      }
    }

    // This shouldn't be reached, but TypeScript requires it
    throw lastError!;
  }

  /**
   * Get retry attempts for an operation
   */
  getAttempts(context: ErrorContext): RetryAttempt[] {
    const operationKey = this.getOperationKey(context);
    return this.attempts.get(operationKey) || [];
  }

  /**
   * Clear stored attempts for an operation
   */
  clearAttempts(context: ErrorContext): void {
    const operationKey = this.getOperationKey(context);
    this.attempts.delete(operationKey);
  }

  private getOperationKey(context: ErrorContext): string {
    return `${context.operation}:${context.programId || 'unknown'}:${context.account || 'unknown'}`;
  }

  private isRetryableError(error: LocalMoneyError): boolean {
    return this.config.retryableErrors.includes(error.category) && error.recoverable;
  }

  private calculateDelay(attempt: number): number {
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay cap
    delay = Math.min(delay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new LocalMoneyError(
          `Operation timed out after ${timeoutMs}ms`,
          ErrorCategory.TIMEOUT,
          ErrorSeverity.MEDIUM,
          'OPERATION_TIMEOUT',
          undefined,
          { timeoutMs },
          true,
          RecoveryStrategy.RETRY
        ));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private classifyError(error: Error, context: ErrorContext): LocalMoneyError {
    if (error instanceof LocalMoneyError) {
      return error;
    }

    return ErrorClassifier.classifyError(error, context);
  }
}

/**
 * Error classification utility
 */
export class ErrorClassifier {
  private static readonly ERROR_PATTERNS = {
    [ErrorCategory.NETWORK]: [
      /network/i,
      /connection/i,
      /fetch/i,
      /ECONNREFUSED/i,
      /ENOTFOUND/i,
      /ETIMEDOUT/i
    ],
    [ErrorCategory.RPC]: [
      /rpc/i,
      /json.?rpc/i,
      /endpoint/i,
      /rate.?limit/i,
      /429/,
      /503/,
      /502/,
      /gateway/i
    ],
    [ErrorCategory.PROGRAM]: [
      /program/i,
      /instruction/i,
      /anchor/i,
      /0x[0-9a-f]+/i,
      /program error/i
    ],
    [ErrorCategory.ACCOUNT]: [
      /account/i,
      /pda/i,
      /address/i,
      /not found/i,
      /does not exist/i,
      /invalid account/i
    ],
    [ErrorCategory.TRANSACTION]: [
      /transaction/i,
      /signature/i,
      /tx/i,
      /blockhash/i,
      /confirmed/i,
      /slot/i
    ],
    [ErrorCategory.VALIDATION]: [
      /validation/i,
      /invalid/i,
      /constraint/i,
      /require/i,
      /assert/i
    ],
    [ErrorCategory.TIMEOUT]: [
      /timeout/i,
      /timed out/i,
      /deadline/i,
      /expired/i
    ],
    [ErrorCategory.RATE_LIMIT]: [
      /rate.?limit/i,
      /too many requests/i,
      /429/,
      /quota/i,
      /throttle/i
    ],
    [ErrorCategory.AUTHENTICATION]: [
      /auth/i,
      /unauthorized/i,
      /401/,
      /forbidden/i,
      /403/,
      /permission/i
    ]
  };

  /**
   * Classify an error into a LocalMoneyError
   */
  static classifyError(error: Error, context?: ErrorContext): LocalMoneyError {
    const message = error.message.toLowerCase();
    
    // Find matching category
    let category = ErrorCategory.SYSTEM;
    let severity = ErrorSeverity.MEDIUM;
    let recoverable = true;
    let strategy = RecoveryStrategy.RETRY;

    for (const [cat, patterns] of Object.entries(this.ERROR_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(message))) {
        category = cat as ErrorCategory;
        break;
      }
    }

    // Determine severity and recovery strategy based on category
    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.RPC:
      case ErrorCategory.TIMEOUT:
        severity = ErrorSeverity.MEDIUM;
        strategy = RecoveryStrategy.RETRY;
        break;
      
      case ErrorCategory.RATE_LIMIT:
        severity = ErrorSeverity.HIGH;
        strategy = RecoveryStrategy.CIRCUIT_BREAKER;
        break;
      
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.PERMISSION:
        severity = ErrorSeverity.HIGH;
        recoverable = false;
        strategy = RecoveryStrategy.MANUAL;
        break;
      
      case ErrorCategory.VALIDATION:
        severity = ErrorSeverity.LOW;
        recoverable = false;
        strategy = RecoveryStrategy.MANUAL;
        break;
      
      case ErrorCategory.PROGRAM:
      case ErrorCategory.TRANSACTION:
        severity = ErrorSeverity.HIGH;
        strategy = RecoveryStrategy.FALLBACK;
        break;
      
      case ErrorCategory.ACCOUNT:
        severity = ErrorSeverity.MEDIUM;
        strategy = RecoveryStrategy.CACHE;
        break;
      
      default:
        severity = ErrorSeverity.MEDIUM;
        strategy = RecoveryStrategy.RETRY;
    }

    return new LocalMoneyError(
      error.message,
      category,
      severity,
      this.generateErrorCode(category, error),
      error,
      context,
      recoverable,
      strategy
    );
  }

  private static generateErrorCode(category: ErrorCategory, error: Error): string {
    const hash = this.simpleHash(error.message);
    return `${category.toUpperCase()}_${hash}`;
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 6).toUpperCase();
  }
}

/**
 * Recovery manager for implementing different recovery strategies
 */
export class RecoveryManager {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private logger: Logger;

  constructor(
    private circuitBreakerConfig: CircuitBreakerConfig,
    private cacheTtl: number = 300000, // 5 minutes
    logger?: Logger
  ) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Execute operation with comprehensive recovery strategies
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>,
    context?: ErrorContext
  ): Promise<RecoveryResult<T>> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: LocalMoneyError;

    // Try main operation with circuit breaker
    try {
      const circuitBreaker = this.getCircuitBreaker(context?.operation || 'default');
      const result = await circuitBreaker.execute(async () => {
        attempts++;
        return await operation();
      });

      return {
        success: true,
        data: result,
        strategy: RecoveryStrategy.RETRY,
        attempts,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof LocalMoneyError ? error : ErrorClassifier.classifyError(error as Error, context);
      
      this.logger.warn(
        `Primary operation failed: ${lastError.message}`,
        { strategy: lastError.suggestedStrategy, ...context }
      );
    }

    // Apply recovery strategy based on error type
    switch (lastError.suggestedStrategy) {
      case RecoveryStrategy.FALLBACK:
        if (fallbackOperation) {
          try {
            const result = await fallbackOperation();
            return {
              success: true,
              data: result,
              strategy: RecoveryStrategy.FALLBACK,
              attempts: attempts + 1,
              duration: Date.now() - startTime,
            };
          } catch (fallbackError) {
            this.logger.error('Fallback operation also failed', fallbackError as Error, context);
          }
        }
        break;

      case RecoveryStrategy.CACHE:
        const cacheKey = this.getCacheKey(context);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          this.logger.info('Returning cached result due to error', context);
          return {
            success: true,
            data: cached,
            strategy: RecoveryStrategy.CACHE,
            attempts,
            duration: Date.now() - startTime,
            metadata: { fromCache: true },
          };
        }
        break;

      case RecoveryStrategy.CIRCUIT_BREAKER:
        // Circuit breaker already applied above
        break;

      default:
        // For other strategies, we've already tried what we can
        break;
    }

    // All recovery attempts failed
    return {
      success: false,
      error: lastError,
      strategy: lastError.suggestedStrategy,
      attempts,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Cache successful results for fallback
   */
  cacheResult(key: string, data: any, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.cacheTtl,
    });
  }

  /**
   * Get result from cache if valid
   */
  getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    
    if (cached) {
      this.cache.delete(key);
    }
    
    return null;
  }

  /**
   * Clear cache
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitBreakerStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [key, cb] of this.circuitBreakers) {
      stats[key] = cb.getStatus();
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetCircuitBreakers(): void {
    for (const cb of this.circuitBreakers.values()) {
      cb.reset();
    }
  }

  private getCircuitBreaker(key: string): CircuitBreaker {
    if (!this.circuitBreakers.has(key)) {
      this.circuitBreakers.set(key, new CircuitBreaker(this.circuitBreakerConfig, this.logger));
    }
    return this.circuitBreakers.get(key)!;
  }

  private getCacheKey(context?: ErrorContext): string {
    return `${context?.operation || 'unknown'}:${context?.programId || ''}:${context?.account || ''}`;
  }
}

/**
 * Default configurations for different environments
 */
export const DEFAULT_RETRY_CONFIGS = {
  aggressive: {
    maxAttempts: 5,
    baseDelay: 100,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [
      ErrorCategory.NETWORK,
      ErrorCategory.RPC,
      ErrorCategory.TIMEOUT,
      ErrorCategory.RATE_LIMIT,
    ],
    timeoutMs: 30000,
  } as RetryConfig,

  conservative: {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [
      ErrorCategory.NETWORK,
      ErrorCategory.RPC,
      ErrorCategory.TIMEOUT,
    ],
    timeoutMs: 15000,
  } as RetryConfig,

  minimal: {
    maxAttempts: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: false,
    retryableErrors: [
      ErrorCategory.NETWORK,
      ErrorCategory.TIMEOUT,
    ],
    timeoutMs: 10000,
  } as RetryConfig,
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000, // 1 minute
  monitoringPeriod: 300000, // 5 minutes
  resetTimeout: 30000, // 30 seconds
};

/**
 * Enhanced error handler that combines all recovery strategies
 */
export class EnhancedErrorHandler {
  private retryManager: RetryManager;
  private recoveryManager: RecoveryManager;
  private logger: Logger;

  constructor(
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIGS.conservative,
    circuitBreakerConfig: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
    logger?: Logger
  ) {
    this.logger = logger || new ConsoleLogger();
    this.retryManager = new RetryManager(retryConfig, this.logger);
    this.recoveryManager = new RecoveryManager(circuitBreakerConfig, 300000, this.logger);
  }

  /**
   * Execute operation with full error handling and recovery
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    fallbackOperation?: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.retryManager.executeWithRetry(operation, context);
    } catch (error) {
      this.logger.error('Retry manager failed, attempting recovery', error as Error, context);
      
      const recoveryResult = await this.recoveryManager.executeWithRecovery(
        operation,
        fallbackOperation,
        context
      );

      if (recoveryResult.success) {
        // Cache successful recovery result
        const cacheKey = `${context.operation}:${context.programId || ''}:${context.account || ''}`;
        this.recoveryManager.cacheResult(cacheKey, recoveryResult.data);
        return recoveryResult.data!;
      }

      throw recoveryResult.error || error;
    }
  }

  /**
   * Get comprehensive error handling statistics
   */
  getStats(): {
    circuitBreakers: Record<string, any>;
    cacheHits: number;
    totalOperations: number;
  } {
    return {
      circuitBreakers: this.recoveryManager.getCircuitBreakerStats(),
      cacheHits: 0, // Would be tracked in a real implementation
      totalOperations: 0, // Would be tracked in a real implementation
    };
  }

  /**
   * Reset all error handling state
   */
  reset(): void {
    this.recoveryManager.resetCircuitBreakers();
    this.recoveryManager.clearCache();
  }
}