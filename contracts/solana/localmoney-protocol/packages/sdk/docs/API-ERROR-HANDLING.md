# Enhanced Error Handling API Documentation

This document provides comprehensive API documentation for the LocalMoney SDK's enhanced error handling system.

## Table of Contents

- [Overview](#overview)
- [Core Classes](#core-classes)
  - [LocalMoneyError](#localmoneyerror)
  - [EnhancedLocalMoneySDK](#enhancedlocalmoneysdk)
  - [CircuitBreaker](#circuitbreaker)
  - [RetryManager](#retrymanager)
  - [RecoveryManager](#recoverymanager)
  - [EnhancedErrorHandler](#enhancederrorhandler)
  - [ErrorClassifier](#errorclassifier)
- [Enums and Types](#enums-and-types)
- [Configuration](#configuration)
- [Usage Patterns](#usage-patterns)

## Overview

The LocalMoney SDK includes a comprehensive error handling system designed for production environments with high reliability requirements. The system provides:

- **Error Classification**: Automatic categorization of errors with appropriate recovery strategies
- **Circuit Breakers**: Prevent cascade failures and protect against unreliable services
- **Retry Logic**: Exponential backoff with jitter and configurable retry strategies
- **Recovery Strategies**: Fallback operations, caching, and graceful degradation
- **Performance Monitoring**: Detailed analytics and performance metrics

## Core Classes

### LocalMoneyError

Enhanced error class with detailed context and recovery information.

```typescript
class LocalMoneyError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly code: string;
  public readonly originalError?: Error;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;
  public readonly suggestedStrategy: RecoveryStrategy;
}
```

#### Constructor

```typescript
constructor(
  message: string,
  category: ErrorCategory,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  code?: string,
  originalError?: Error,
  context?: Record<string, any>,
  recoverable: boolean = true,
  suggestedStrategy: RecoveryStrategy = RecoveryStrategy.RETRY
)
```

**Parameters:**

- `message` - Human-readable error message
- `category` - Error category (Network, RPC, Program, etc.)
- `severity` - Error severity level (Low, Medium, High, Critical)
- `code` - Optional error code for programmatic handling
- `originalError` - Original error that caused this error
- `context` - Additional context information
- `recoverable` - Whether the error can be recovered from
- `suggestedStrategy` - Recommended recovery strategy

#### Methods

##### `toJSON(): Record<string, any>`

Converts the error to a JSON object for logging and serialization.

**Returns:** Object containing all error properties in JSON format.

**Example:**
```typescript
const error = new LocalMoneyError('Network failure', ErrorCategory.NETWORK);
const json = error.toJSON();
console.log(json);
// {
//   name: 'LocalMoneyError',
//   message: 'Network failure',
//   category: 'network',
//   severity: 'medium',
//   code: 'NETWORK_ABC123',
//   recoverable: true,
//   suggestedStrategy: 'retry',
//   timestamp: '2024-01-01T00:00:00.000Z'
// }
```

### EnhancedLocalMoneySDK

Enhanced SDK with comprehensive error handling and recovery capabilities.

```typescript
class EnhancedLocalMoneySDK {
  public readonly hub: EnhancedHubSDK;
  public readonly profile: EnhancedProfileSDK;
  public readonly price: EnhancedPriceSDK;
  public readonly offer: EnhancedOfferSDK;
  public readonly trade: EnhancedTradeSDK;
  public readonly arbitration: EnhancedArbitrationSDK;
  public readonly accountFetcher: EnhancedAccountFetcher;
}
```

#### Constructor

```typescript
constructor(
  connection: Connection,
  wallet: Wallet | LocalMoneyWallet,
  programAddresses: ProgramAddresses,
  config: EnhancedSDKConfig = {}
)
```

**Parameters:**

- `connection` - Solana connection instance
- `wallet` - Wallet implementation
- `programAddresses` - Program addresses for all protocol programs
- `config` - Enhanced SDK configuration options

#### Methods

##### `getErrorStats(): Record<string, any>`

Returns comprehensive error handling statistics.

**Returns:** Object containing circuit breaker stats, cache hits, and operation counts.

##### `resetErrorHandling(): void`

Resets all error handling state including circuit breakers and caches.

##### `executeWithErrorHandling<T>(operation, context, fallbackOperation?): Promise<T>`

Executes an operation with full error handling and recovery.

**Parameters:**

- `operation` - Function to execute
- `context` - Error context for logging and monitoring
- `fallbackOperation` - Optional fallback function

**Returns:** Promise resolving to the operation result.

#### Static Methods

##### `create(connection, wallet, programAddresses, config?): EnhancedLocalMoneySDK`

Factory method to create an enhanced SDK instance.

##### `createLocal(wallet, config?): EnhancedLocalMoneySDK`

Creates an enhanced SDK instance configured for local development.

### CircuitBreaker

Implements the circuit breaker pattern to prevent cascade failures.

```typescript
class CircuitBreaker {
  constructor(config: CircuitBreakerConfig, logger?: Logger)
}
```

#### Configuration

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;     // Number of failures before opening
  successThreshold: number;     // Number of successes before closing
  timeout: number;              // Timeout for operations (ms)
  monitoringPeriod: number;     // Period for monitoring (ms)
  resetTimeout: number;         // Time before attempting reset (ms)
}
```

#### Methods

##### `execute<T>(operation: () => Promise<T>): Promise<T>`

Executes an operation with circuit breaker protection.

**Parameters:**

- `operation` - Async function to execute

**Returns:** Promise resolving to operation result.

**Throws:** `LocalMoneyError` with `CIRCUIT_BREAKER_OPEN` code when circuit is open.

##### `getStatus(): CircuitBreakerStatus`

Returns current circuit breaker status.

**Returns:** Object containing state, failure count, success count, and timing information.

##### `reset(): void`

Manually resets the circuit breaker to CLOSED state.

#### States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Circuit breaker active, requests are rejected
- **HALF_OPEN**: Testing if the service has recovered

### RetryManager

Manages retry logic with exponential backoff and configurable strategies.

```typescript
class RetryManager {
  constructor(config: RetryConfig, logger?: Logger)
}
```

#### Configuration

```typescript
interface RetryConfig {
  maxAttempts: number;          // Maximum retry attempts
  baseDelay: number;            // Initial delay in milliseconds
  maxDelay: number;             // Maximum delay cap
  backoffMultiplier: number;    // Exponential backoff multiplier
  jitter: boolean;              // Add randomness to delays
  retryableErrors: ErrorCategory[]; // Which error types to retry
  timeoutMs?: number;           // Timeout per attempt
}
```

#### Methods

##### `executeWithRetry<T>(operation, context): Promise<T>`

Executes an operation with retry logic.

**Parameters:**

- `operation` - Function to execute with retries
- `context` - Error context for tracking

**Returns:** Promise resolving to operation result.

##### `getAttempts(context): RetryAttempt[]`

Returns retry attempt history for a specific context.

**Parameters:**

- `context` - Error context to query

**Returns:** Array of retry attempt records.

##### `clearAttempts(context): void`

Clears stored attempt history for a context.

**Parameters:**

- `context` - Error context to clear

### RecoveryManager

Implements comprehensive recovery strategies including caching and fallbacks.

```typescript
class RecoveryManager {
  constructor(
    circuitBreakerConfig: CircuitBreakerConfig,
    cacheTtl: number = 300000,
    logger?: Logger
  )
}
```

#### Methods

##### `executeWithRecovery<T>(operation, fallbackOperation?, context?): Promise<RecoveryResult<T>>`

Executes an operation with comprehensive recovery strategies.

**Parameters:**

- `operation` - Primary operation to execute
- `fallbackOperation` - Optional fallback operation
- `context` - Optional error context

**Returns:** Promise resolving to recovery result with success status, data, strategy used, and metadata.

##### `cacheResult(key, data, ttl?): void`

Caches a result for fallback use.

**Parameters:**

- `key` - Cache key
- `data` - Data to cache
- `ttl` - Optional TTL override

##### `getFromCache(key): any | null`

Retrieves data from cache if valid.

**Parameters:**

- `key` - Cache key

**Returns:** Cached data or null if not found/expired.

##### `clearCache(pattern?): void`

Clears cache entries matching a pattern.

**Parameters:**

- `pattern` - Optional pattern to match keys

##### `getCircuitBreakerStats(): Record<string, any>`

Returns statistics for all circuit breakers.

##### `resetCircuitBreakers(): void`

Resets all circuit breakers to CLOSED state.

### EnhancedErrorHandler

Combines all error handling strategies into a unified interface.

```typescript
class EnhancedErrorHandler {
  constructor(
    retryConfig?: RetryConfig,
    circuitBreakerConfig?: CircuitBreakerConfig,
    logger?: Logger
  )
}
```

#### Methods

##### `execute<T>(operation, context, fallbackOperation?): Promise<T>`

Executes an operation with full error handling pipeline.

**Parameters:**

- `operation` - Function to execute
- `context` - Error context
- `fallbackOperation` - Optional fallback

**Returns:** Promise resolving to operation result.

##### `getStats(): ErrorHandlerStats`

Returns comprehensive error handling statistics.

##### `reset(): void`

Resets all error handling state.

### ErrorClassifier

Utility class for automatic error classification.

#### Static Methods

##### `classifyError(error, context?): LocalMoneyError`

Automatically classifies an error into a LocalMoneyError.

**Parameters:**

- `error` - Original error to classify
- `context` - Optional error context

**Returns:** LocalMoneyError with appropriate category, severity, and recovery strategy.

**Example:**
```typescript
const error = new Error('Network connection failed');
const classified = ErrorClassifier.classifyError(error);
console.log(classified.category); // ErrorCategory.NETWORK
console.log(classified.suggestedStrategy); // RecoveryStrategy.RETRY
```

## Enums and Types

### ErrorCategory

```typescript
enum ErrorCategory {
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
```

### ErrorSeverity

```typescript
enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}
```

### RecoveryStrategy

```typescript
enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  CIRCUIT_BREAKER = 'circuit_breaker',
  CACHE = 'cache',
  MANUAL = 'manual',
  SKIP = 'skip'
}
```

### CircuitBreakerState

```typescript
enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}
```

### ErrorContext

```typescript
interface ErrorContext {
  operation: string;
  programId?: string;
  account?: string;
  attempt?: number;
  duration?: number;
  metadata?: Record<string, any>;
}
```

### RecoveryResult

```typescript
interface RecoveryResult<T> {
  success: boolean;
  data?: T;
  error?: LocalMoneyError;
  strategy: RecoveryStrategy;
  attempts: number;
  duration: number;
  metadata?: Record<string, any>;
}
```

## Configuration

### Default Configurations

The SDK provides three pre-configured retry strategies:

#### Minimal (Development)

```typescript
DEFAULT_RETRY_CONFIGS.minimal = {
  maxAttempts: 2,
  baseDelay: 1000,
  maxDelay: 5000,
  backoffMultiplier: 2,
  jitter: false,
  retryableErrors: [ErrorCategory.NETWORK, ErrorCategory.TIMEOUT],
  timeoutMs: 10000,
}
```

#### Conservative (Production)

```typescript
DEFAULT_RETRY_CONFIGS.conservative = {
  maxAttempts: 3,
  baseDelay: 500,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [ErrorCategory.NETWORK, ErrorCategory.RPC, ErrorCategory.TIMEOUT],
  timeoutMs: 15000,
}
```

#### Aggressive (Staging/Testing)

```typescript
DEFAULT_RETRY_CONFIGS.aggressive = {
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
}
```

#### Default Circuit Breaker Configuration

```typescript
DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,          // 1 minute
  monitoringPeriod: 300000, // 5 minutes
  resetTimeout: 30000,     // 30 seconds
}
```

### Enhanced SDK Configuration

```typescript
interface EnhancedSDKConfig {
  retryConfig?: RetryConfig;
  circuitBreakerConfig?: CircuitBreakerConfig;
  logger?: Logger;
  enableErrorHandling?: boolean;
  cacheEnabled?: boolean;
  cacheTtl?: number;
  environment?: 'development' | 'staging' | 'production';
}
```

## Usage Patterns

### Basic Usage

```typescript
import { EnhancedLocalMoneySDK, DEFAULT_RETRY_CONFIGS } from '@localmoney/solana-sdk';

const sdk = new EnhancedLocalMoneySDK(connection, wallet, addresses, {
  retryConfig: DEFAULT_RETRY_CONFIGS.conservative,
  enableErrorHandling: true,
  environment: 'production',
});

// All operations now have automatic error handling
const profile = await sdk.profile.getProfile(userPublicKey);
```

### Custom Configuration

```typescript
const sdk = new EnhancedLocalMoneySDK(connection, wallet, addresses, {
  retryConfig: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [ErrorCategory.NETWORK, ErrorCategory.RPC],
    timeoutMs: 15000,
  },
  circuitBreakerConfig: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    monitoringPeriod: 60000,
    resetTimeout: 10000,
  },
  enableErrorHandling: true,
  cacheEnabled: true,
  cacheTtl: 300000, // 5 minutes
});
```

### Manual Error Handling

```typescript
import { 
  CircuitBreaker, 
  RetryManager, 
  ErrorClassifier 
} from '@localmoney/solana-sdk';

// Create individual components
const circuitBreaker = new CircuitBreaker(config);
const retryManager = new RetryManager(retryConfig);

// Manual execution with error handling
try {
  const result = await retryManager.executeWithRetry(
    () => circuitBreaker.execute(() => myOperation()),
    { operation: 'myOperation' }
  );
} catch (error) {
  const classified = ErrorClassifier.classifyError(error);
  console.log('Error category:', classified.category);
  console.log('Suggested strategy:', classified.suggestedStrategy);
}
```

### Performance Monitoring

```typescript
// Get detailed statistics
const stats = enhancedSDK.getErrorStats();
console.log('Circuit breakers:', Object.keys(stats.circuitBreakers).length);
console.log('Cache hit rate:', stats.cacheHits / stats.totalOperations);

// Monitor specific operations
const operationStats = retryManager.getAttempts({ operation: 'getPrice' });
operationStats.forEach(attempt => {
  console.log(`Attempt ${attempt.attempt}: ${attempt.error.message}`);
  console.log(`Delay: ${attempt.delay}ms`);
});
```

### Error Recovery Strategies

```typescript
// Automatic recovery based on error type
const recoveryResult = await recoveryManager.executeWithRecovery(
  primaryOperation,
  fallbackOperation,
  { operation: 'critical-data-fetch' }
);

switch (recoveryResult.strategy) {
  case RecoveryStrategy.RETRY:
    console.log('Succeeded after retries');
    break;
  case RecoveryStrategy.FALLBACK:
    console.log('Used fallback operation');
    break;
  case RecoveryStrategy.CACHE:
    console.log('Served from cache');
    break;
  default:
    console.log('Recovery failed');
}
```

## Error Handling Best Practices

1. **Use Environment-Specific Configuration**: Configure retry and circuit breaker settings based on your environment (dev/staging/prod).

2. **Monitor Error Statistics**: Regularly check error handling statistics to identify patterns and optimize configuration.

3. **Provide Fallback Operations**: Always provide fallback operations for critical functionality.

4. **Handle Non-Recoverable Errors**: Some errors (validation, authentication) should not be retried - handle them appropriately.

5. **Use Caching Strategically**: Enable caching for data that can be safely served stale during outages.

6. **Log Appropriately**: Use the provided logging interface to track error patterns and system health.

7. **Test Error Scenarios**: Use the enhanced error handling in your tests to verify behavior under failure conditions.

## Migration from Basic SDK

To migrate from the basic LocalMoneySDK to EnhancedLocalMoneySDK:

```typescript
// Before
import { LocalMoneySDK } from '@localmoney/solana-sdk';
const sdk = new LocalMoneySDK(connection, wallet, addresses);

// After
import { 
  EnhancedLocalMoneySDK, 
  DEFAULT_RETRY_CONFIGS 
} from '@localmoney/solana-sdk';

const sdk = new EnhancedLocalMoneySDK(connection, wallet, addresses, {
  retryConfig: DEFAULT_RETRY_CONFIGS.conservative,
  enableErrorHandling: true,
  environment: 'production',
});

// All existing method calls remain the same
const profile = await sdk.profile.getProfile(userPublicKey);
```

The enhanced SDK is a drop-in replacement with the same interface but additional error handling capabilities.