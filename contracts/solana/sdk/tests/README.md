# LocalMoney SDK Tests

This directory contains comprehensive tests for the LocalMoney Solana SDK.

## Test Structure

```
tests/
├── unit/           # Unit tests for individual SDK methods
├── integration/    # Integration tests with real on-chain transactions
├── setup.ts       # Common test setup and utilities
└── README.md      # This file
```

## Running Tests

### Unit Tests
Unit tests run quickly and don't require any external dependencies:

```bash
npm test
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

### Integration Tests
Integration tests require a running Solana local validator and deployed programs:

1. **Start Solana Local Validator:**
   ```bash
   solana-test-validator
   ```

2. **Deploy Programs:**
   ```bash
   cd ../..  # Go to contracts/solana directory
   anchor build
   anchor deploy
   ```

3. **Run Integration Tests:**
   ```bash
   INTEGRATION_TESTS=true npm run test:integration
   ```

## Test Categories

### Unit Tests (`tests/unit/`)
- **sdk.test.ts**: Core SDK functionality, initialization, PDA derivation, caching
- **profile.test.ts**: Profile management methods
- **offer.test.ts**: Offer creation and management
- **trade.test.ts**: Trade lifecycle methods
- **price.test.ts**: Price feed integration
- **utils.test.ts**: Utility functions and error handling

### Integration Tests (`tests/integration/`)
- **trading-flow.test.ts**: Complete end-to-end trading scenarios
- **batch-transactions.test.ts**: Batch transaction processing
- **error-scenarios.test.ts**: Real error handling with actual program errors
- **performance.test.ts**: Performance and gas optimization validation

## Test Configuration

### Jest Configuration
Tests use Jest with TypeScript support via ts-jest. Configuration is in `jest.config.js`.

### Environment Variables
- `INTEGRATION_TESTS=true`: Enable integration tests
- `RPC_URL`: Custom RPC endpoint (defaults to localhost:8899)
- `LOG_LEVEL`: Set to 'debug' for verbose logging

### Mock Setup
Unit tests use mocked Anchor programs and Solana connections. The setup file (`setup.ts`) provides:
- Mock wallet with generated keypair
- Mock connection to localhost
- Mock program IDs for all LocalMoney programs
- Global test timeout configuration

## Writing New Tests

### Unit Test Example
```typescript
import { LocalMoneySDK } from '../../src/index';
import { mockConnection, mockWallet, mockProgramIds } from '../setup';

describe('New Feature', () => {
  let sdk: LocalMoneySDK;

  beforeEach(() => {
    sdk = new LocalMoneySDK({
      connection: mockConnection,
      wallet: mockWallet,
      programIds: mockProgramIds
    });
  });

  test('should work correctly', async () => {
    // Your test here
    expect(true).toBe(true);
  });
});
```

### Integration Test Example
```typescript
describe('New Integration Test', () => {
  // Skip if integration tests not enabled
  const itif = process.env.INTEGRATION_TESTS === 'true' ? it : it.skip;
  
  itif('should work on-chain', async () => {
    // Your integration test here
  });
});
```

## Coverage Requirements

The test suite aims for:
- **90%+ line coverage** for core SDK functionality
- **100% coverage** for critical paths (trading, escrow, profile management)
- **80%+ coverage** for utility functions

## Continuous Integration

Tests run automatically on:
- Pull requests to main branch
- Pushes to main branch
- Nightly builds with full integration test suite

The CI pipeline:
1. Runs unit tests on multiple Node.js versions
2. Starts solana-test-validator
3. Deploys contracts
4. Runs integration tests
5. Generates and uploads coverage reports