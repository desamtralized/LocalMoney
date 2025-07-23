/**
 * Enhanced Error Handling Usage Examples
 * 
 * This file demonstrates the comprehensive error handling and recovery
 * capabilities of the LocalMoney SDK, including circuit breakers,
 * retry mechanisms, and automatic recovery strategies.
 */

import { 
  EnhancedLocalMoneySDK,
  LocalMoneySDK,
  LocalMoneyError,
  ErrorCategory,
  ErrorSeverity,
  RecoveryStrategy,
  CircuitBreaker,
  CircuitBreakerState,
  RetryManager,
  RecoveryManager,
  EnhancedErrorHandler,
  ErrorClassifier,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  createConnection,
  createWallet,
  Keypair,
  PublicKey
} from '../src/index';

// Example configuration
const connection = createConnection('http://localhost:8899');
const wallet = createWallet(Keypair.generate());
const programAddresses = {
  hub: new PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
  profile: new PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
  price: new PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
  offer: new PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
  trade: new PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
  arbitration: new PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
};

/**
 * Example 1: Basic Enhanced SDK Usage
 * 
 * Demonstrates how to create and use the EnhancedLocalMoneySDK
 * with automatic error handling and recovery.
 */
async function basicEnhancedSDKExample() {
  console.log('\n=== Basic Enhanced SDK Example ===');

  // Create enhanced SDK with production-ready error handling
  const enhancedSDK = new EnhancedLocalMoneySDK(connection, wallet, programAddresses, {
    retryConfig: DEFAULT_RETRY_CONFIGS.conservative,
    circuitBreakerConfig: DEFAULT_CIRCUIT_BREAKER_CONFIG,
    enableErrorHandling: true,
    environment: 'production',
    cacheEnabled: true,
    cacheTtl: 300000, // 5 minutes
  });

  try {
    // All operations now have automatic error handling
    console.log('Fetching global config with automatic retry...');
    const config = await enhancedSDK.hub.getGlobalConfig();
    console.log('Global config retrieved successfully');

    console.log('Creating profile with error handling...');
    const profileResult = await enhancedSDK.profile.createProfile(
      wallet.publicKey,
      'encrypted-contact-info'
    );
    console.log('Profile created:', profileResult.success);

  } catch (error) {
    console.error('Operation failed after all retry attempts:', error);
  }

  // Get error handling statistics
  const stats = enhancedSDK.getErrorStats();
  console.log('Error handling stats:', stats);

  // Reset error handling state if needed
  enhancedSDK.resetErrorHandling();
}

/**
 * Example 2: Circuit Breaker Pattern
 * 
 * Demonstrates how to use circuit breakers to prevent cascade failures
 * and protect against problematic external services.
 */
async function circuitBreakerExample() {
  console.log('\n=== Circuit Breaker Example ===');

  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,    // Open after 3 failures
    successThreshold: 2,    // Close after 2 successes
    timeout: 60000,         // 1 minute timeout
    monitoringPeriod: 300000, // 5 minutes monitoring
    resetTimeout: 10000,    // Try again after 10 seconds
  });

  // Simulate a risky operation that might fail
  const riskyOperation = async (): Promise<string> => {
    // Simulate random failures
    if (Math.random() < 0.7) {
      throw new Error('Simulated network failure');
    }
    return 'Operation successful';
  };

  // Execute operations with circuit breaker protection
  for (let i = 0; i < 10; i++) {
    try {
      console.log(`\nAttempt ${i + 1}:`);
      const result = await circuitBreaker.execute(riskyOperation);
      console.log('✅ Success:', result);
    } catch (error) {
      if (error instanceof LocalMoneyError && error.code === 'CIRCUIT_BREAKER_OPEN') {
        console.log('⚡ Circuit breaker is OPEN - operation rejected');
      } else {
        console.log('❌ Operation failed:', error.message);
      }
    }

    // Check circuit breaker status
    const status = circuitBreaker.getStatus();
    console.log(`   State: ${status.state}, Failures: ${status.failureCount}`);

    // Small delay between attempts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Manual reset if needed
  console.log('\nManually resetting circuit breaker...');
  circuitBreaker.reset();
  console.log('Circuit breaker state:', circuitBreaker.getStatus().state);
}

/**
 * Example 3: Advanced Retry Configuration
 * 
 * Demonstrates configurable retry mechanisms with exponential backoff,
 * jitter, and selective error handling.
 */
async function advancedRetryExample() {
  console.log('\n=== Advanced Retry Example ===');

  const retryManager = new RetryManager({
    maxAttempts: 5,
    baseDelay: 500,             // Start with 500ms
    maxDelay: 10000,            // Max 10 seconds
    backoffMultiplier: 2,       // Double each time
    jitter: true,               // Add randomness to prevent thundering herd
    retryableErrors: [
      ErrorCategory.NETWORK,
      ErrorCategory.RPC,
      ErrorCategory.TIMEOUT,
      ErrorCategory.RATE_LIMIT,
    ],
    timeoutMs: 5000,            // 5 second timeout per attempt
  });

  // Example of different types of operations
  const operations = [
    {
      name: 'Network Error (Retryable)',
      fn: async () => {
        throw new LocalMoneyError('Network connection failed', ErrorCategory.NETWORK);
      }
    },
    {
      name: 'Validation Error (Non-retryable)',
      fn: async () => {
        throw new LocalMoneyError('Invalid parameters', ErrorCategory.VALIDATION, ErrorSeverity.LOW, undefined, undefined, undefined, false);
      }
    },
    {
      name: 'Timeout Error (Retryable)',
      fn: async () => {
        throw new LocalMoneyError('Operation timed out', ErrorCategory.TIMEOUT);
      }
    },
    {
      name: 'Eventually Successful',
      fn: async () => {
        // Succeed on the 3rd attempt
        const attempts = retryManager.getAttempts({ operation: 'eventualSuccess' });
        if (attempts.length < 2) {
          throw new LocalMoneyError('Temporary failure', ErrorCategory.RPC);
        }
        return 'Success after retries!';
      }
    }
  ];

  for (const operation of operations) {
    console.log(`\n--- Testing: ${operation.name} ---`);
    
    try {
      const result = await retryManager.executeWithRetry(
        operation.fn,
        { operation: operation.name.toLowerCase().replace(/\s+/g, '') }
      );
      console.log('✅ Result:', result);
    } catch (error) {
      console.log('❌ Final error:', error.message);
    }

    // Show retry history
    const attempts = retryManager.getAttempts({ 
      operation: operation.name.toLowerCase().replace(/\s+/g, '') 
    });
    console.log(`   Total attempts: ${attempts.length}`);
    attempts.forEach((attempt, index) => {
      console.log(`   Attempt ${attempt.attempt}: ${attempt.error.message} (delay: ${attempt.delay}ms)`);
    });

    // Clear history for next test
    retryManager.clearAttempts({ 
      operation: operation.name.toLowerCase().replace(/\s+/g, '') 
    });
  }
}

/**
 * Example 4: Error Classification System
 * 
 * Demonstrates how errors are automatically classified and how
 * different error types are handled with appropriate strategies.
 */
async function errorClassificationExample() {
  console.log('\n=== Error Classification Example ===');

  const testErrors = [
    new Error('Network connection failed'),
    new Error('RPC endpoint failed'),
    new Error('Program error: 0x1234'),
    new Error('Account not found'),
    new Error('Transaction failed'),
    new Error('Validation failed: invalid input'),
    new Error('Operation timed out'),
    new Error('Rate limit exceeded'),
    new Error('HTTP 401 Unauthorized'),
    new Error('Invalid amount provided'),
  ];

  console.log('Classifying various error types:\n');

  for (const error of testErrors) {
    const classified = ErrorClassifier.classifyError(error, {
      operation: 'testOperation',
      metadata: { originalError: error.message }
    });

    console.log(`Original: "${error.message}"`);
    console.log(`  Category: ${classified.category}`);
    console.log(`  Severity: ${classified.severity}`);
    console.log(`  Recoverable: ${classified.recoverable}`);
    console.log(`  Strategy: ${classified.suggestedStrategy}`);
    console.log(`  Code: ${classified.code}`);
    console.log();
  }
}

/**
 * Example 5: Recovery Manager with Multiple Strategies
 * 
 * Demonstrates comprehensive recovery strategies including
 * fallback operations, caching, and circuit breakers.
 */
async function recoveryManagerExample() {
  console.log('\n=== Recovery Manager Example ===');

  const recoveryManager = new RecoveryManager({
    failureThreshold: 2,
    successThreshold: 1,
    timeout: 30000,
    monitoringPeriod: 60000,
    resetTimeout: 5000,
  }, 60000); // 1 minute cache TTL

  // Pre-populate cache with some data
  recoveryManager.cacheResult('test-operation', 'cached-fallback-data');

  const scenarios = [
    {
      name: 'Primary Success',
      primary: async () => 'Primary operation succeeded',
      fallback: async () => 'Fallback not needed',
    },
    {
      name: 'Primary Fails, Fallback Succeeds',
      primary: async () => {
        throw new LocalMoneyError('Primary failed', ErrorCategory.PROGRAM, ErrorSeverity.HIGH, undefined, undefined, undefined, true, RecoveryStrategy.FALLBACK);
      },
      fallback:async () => 'Fallback operation succeeded',
    },
    {
      name: 'Both Fail, Use Cache',
      primary: async () => {
        throw new LocalMoneyError('Primary failed', ErrorCategory.ACCOUNT, ErrorSeverity.MEDIUM, undefined, undefined, undefined, true, RecoveryStrategy.CACHE);
      },
      fallback: async () => {
        throw new Error('Fallback also failed');
      },
    },
    {
      name: 'Complete Failure',
      primary: async () => {
        throw new LocalMoneyError('Unrecoverable error', ErrorCategory.VALIDATION, ErrorSeverity.HIGH, undefined, undefined, undefined, false, RecoveryStrategy.MANUAL);
      },
      fallback: async () => {
        throw new Error('Fallback failed too');
      },
    }
  ];

  for (const scenario of scenarios) {
    console.log(`\n--- Testing: ${scenario.name} ---`);

    const result = await recoveryManager.executeWithRecovery(
      scenario.primary,
      scenario.fallback,
      { operation: 'test-operation' }
    );

    if (result.success) {
      console.log('✅ Success:', result.data);
      console.log(`   Strategy: ${result.strategy}`);
      console.log(`   Attempts: ${result.attempts}`);
      console.log(`   Duration: ${result.duration}ms`);
      
      if (result.metadata?.fromCache) {
        console.log('   📦 Data served from cache');
      }
    } else {
      console.log('❌ Complete failure:', result.error?.message);
      console.log(`   Final strategy: ${result.strategy}`);
    }
  }

  // Check cache and circuit breaker statistics
  console.log('\n--- Recovery Manager Statistics ---');
  const stats = recoveryManager.getCircuitBreakerStats();
  console.log('Circuit breaker stats:', Object.keys(stats).length > 0 ? stats : 'No active circuit breakers');
}

/**
 * Example 6: Performance Monitoring and Analytics
 * 
 * Demonstrates how to monitor error handling performance
 * and get insights into system behavior.
 */
async function performanceMonitoringExample() {
  console.log('\n=== Performance Monitoring Example ===');

  const enhancedErrorHandler = new EnhancedErrorHandler(
    DEFAULT_RETRY_CONFIGS.aggressive,
    DEFAULT_CIRCUIT_BREAKER_CONFIG
  );

  // Simulate various operations with different outcomes
  const operations = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    shouldFail: Math.random() < 0.3, // 30% failure rate
  }));

  console.log(`Executing ${operations.length} operations with 30% failure rate...\n`);

  let successCount = 0;
  let failureCount = 0;
  const startTime = Date.now();

  for (const op of operations) {
    try {
      await enhancedErrorHandler.execute(
        async () => {
          if (op.shouldFail) {
            throw new LocalMoneyError('Simulated failure', ErrorCategory.NETWORK);
          }
          return `Operation ${op.id} succeeded`;
        },
        { operation: `operation-${op.id}` },
        // Fallback operation
        async () => `Fallback result for operation ${op.id}`
      );
      successCount++;
    } catch (error) {
      failureCount++;
    }
  }

  const duration = Date.now() - startTime;
  const stats = enhancedErrorHandler.getStats();

  console.log('--- Performance Results ---');
  console.log(`Total operations: ${operations.length}`);
  console.log(`Successes: ${successCount} (${((successCount / operations.length) * 100).toFixed(1)}%)`);
  console.log(`Failures: ${failureCount} (${((failureCount / operations.length) * 100).toFixed(1)}%)`);
  console.log(`Total duration: ${duration}ms`);
  console.log(`Average per operation: ${(duration / operations.length).toFixed(1)}ms`);
  console.log(`Operations per second: ${((operations.length / duration) * 1000).toFixed(1)}`);
  console.log('\n--- Error Handler Statistics ---');
  console.log(`Circuit breakers: ${Object.keys(stats.circuitBreakers).length}`);
  console.log(`Cache hits: ${stats.cacheHits}`);
  console.log(`Total operations tracked: ${stats.totalOperations}`);

  // Reset statistics
  enhancedErrorHandler.reset();
  console.log('\nError handler statistics reset.');
}

/**
 * Example 7: Environment-Specific Configuration
 * 
 * Demonstrates how to configure error handling for different
 * environments (development, staging, production).
 */
async function environmentConfigurationExample() {
  console.log('\n=== Environment Configuration Example ===');

  const environments = [
    {
      name: 'Development',
      config: {
        environment: 'development' as const,
        retryConfig: DEFAULT_RETRY_CONFIGS.minimal,
        enableErrorHandling: true,
        circuitBreakerConfig: {
          failureThreshold: 2,
          successThreshold: 1,
          timeout: 5000,
          monitoringPeriod: 10000,
          resetTimeout: 1000,
        }
      }
    },
    {
      name: 'Staging',
      config: {
        environment: 'staging' as const,
        retryConfig: DEFAULT_RETRY_CONFIGS.conservative,
        enableErrorHandling: true,
        cacheEnabled: true,
        cacheTtl: 60000, // 1 minute
      }
    },
    {
      name: 'Production',
      config: {
        environment: 'production' as const,
        retryConfig: DEFAULT_RETRY_CONFIGS.aggressive,
        enableErrorHandling: true,
        cacheEnabled: true,
        cacheTtl: 300000, // 5 minutes
        circuitBreakerConfig: {
          failureThreshold: 10,
          successThreshold: 5,
          timeout: 300000,  // 5 minutes
          monitoringPeriod: 900000, // 15 minutes
          resetTimeout: 60000, // 1 minute
        }
      }
    }
  ];

  for (const env of environments) {
    console.log(`\n--- ${env.name} Environment ---`);
    
    const sdk = new EnhancedLocalMoneySDK(connection, wallet, programAddresses, env.config);
    
    console.log(`Environment: ${env.config.environment}`);
    console.log(`Max retry attempts: ${env.config.retryConfig.maxAttempts}`);
    console.log(`Base delay: ${env.config.retryConfig.baseDelay}ms`);
    console.log(`Error handling enabled: ${env.config.enableErrorHandling}`);
    console.log(`Caching enabled: ${env.config.cacheEnabled || false}`);
    
    if (env.config.cacheTtl) {
      console.log(`Cache TTL: ${env.config.cacheTtl / 1000}s`);
    }
    
    if (env.config.circuitBreakerConfig) {
      console.log(`Circuit breaker failure threshold: ${env.config.circuitBreakerConfig.failureThreshold}`);
    }

    // Simulate a quick test operation
    try {
      await sdk.executeWithErrorHandling(
        async () => 'Test operation for ' + env.name,
        { operation: `test-${env.name.toLowerCase()}` }
      );
      console.log('✅ Test operation successful');
    } catch (error) {
      console.log('❌ Test operation failed:', error.message);
    }
  }
}

/**
 * Main function to run all examples
 */
async function runAllExamples() {
  console.log('🚀 LocalMoney SDK - Enhanced Error Handling Examples');
  console.log('====================================================');

  try {
    await basicEnhancedSDKExample();
    await circuitBreakerExample();
    await advancedRetryExample();
    await errorClassificationExample();
    await recoveryManagerExample();
    await performanceMonitoringExample();
    await environmentConfigurationExample();

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Example execution failed:', error);
  }
}

// Export for use in other files
export {
  basicEnhancedSDKExample,
  circuitBreakerExample,
  advancedRetryExample,
  errorClassificationExample,
  recoveryManagerExample,
  performanceMonitoringExample,
  environmentConfigurationExample,
  runAllExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}