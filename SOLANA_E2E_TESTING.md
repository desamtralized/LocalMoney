## FEATURE:

- Comprehensive end-to-end testing infrastructure for LocalMoney Solana Protocol
- Automated local validator management with background process supervision  
- Cross-program integration testing with real on-chain transactions (no mocking/stubs)
- Complete happy path trading flow validation between multiple test wallets
- Program deployment pipeline with key synchronization and funding verification
- Real-time wallet balance monitoring and automatic SOL airdrop management
- Integration test suite covering all 4 programs: Trade, Offer, Profile, and Price
- Advanced CPI (Cross-Program Invocation) and PDA (Program Derived Addresses) testing
- Token escrow and SPL token interaction validation
- Price oracle verification and tolerance testing

## EXAMPLES:

Complete Happy Path Trade Flow:
1. **Setup Phase**: Create and fund test wallets, deploy programs, initialize price oracle
2. **Profile Creation**: Both trader wallets create user profiles with usernames
3. **Offer Creation**: Seller creates offer with token amount, price, and constraints  
4. **Trade Initiation**: Buyer accepts offer, tokens transferred to escrow
5. **Price Verification**: Oracle validates trade price within tolerance
6. **Trade Completion**: Escrow releases tokens, profiles updated with trade statistics
7. **Verification**: Assert all state changes, token balances, and reputation updates

## DOCUMENTATION:

Anchor Framework: https://book.anchor-lang.com/
Solana Program Library: https://spl.solana.com/
Solana Web3.js: https://docs.solana.com/developing/clients/javascript-api
Solana CLI Tools: https://docs.solana.com/cli
SPL Token Program: https://spl.solana.com/token
Solana Program Development: https://docs.solana.com/developing/on-chain-programs/overview
Mocha Testing Framework: https://mochajs.org/
TypeScript Testing Best Practices: https://github.com/microsoft/TypeScript/wiki/Coding-guidelines
Anchor Testing: https://book.anchor-lang.com/anchor_in_depth/milestone_project_tic-tac-toe.html

## OTHER CONSIDERATIONS:

- **Validator Management**: Ensure consistent test environment with proper ledger cleanup between test runs
- **Program Dependencies**: Verify correct CPI calls and cross-program account relationships
- **Token Mechanics**: Test all SPL token operations including minting, transfers, and escrow management
- **Error Handling**: Validate program error codes and constraint violations across all edge cases
- **Performance Testing**: Measure transaction confirmation times and throughput under load
- **State Consistency**: Ensure atomic operations and proper rollback behavior on failures
- **PDA Derivation**: Verify correct seed generation and bump calculations for all program accounts
- **Account Rent**: Validate rent-exempt account creation and proper space allocation
- **Gas Optimization**: Monitor compute unit consumption and optimize instruction efficiency
- **Multi-Program Atomicity**: Test complex transactions involving multiple programs simultaneously
- **Upgrade Safety**: Ensure program upgrades don't break existing account structures

## RELATED PROJECTS:

- **Anchor CLI**: Essential toolchain for Solana program development, testing, and deployment. Provides built-in testing framework, IDL generation, and local validator management. Critical for our automated deployment pipeline. https://book.anchor-lang.com/getting_started/installation.html

- **Solana Test Validator**: Local blockchain simulation environment for development and testing. Supports custom program loading, account state manipulation, and slot advancement for time-based testing scenarios. https://docs.solana.com/developing/test-validator

- **SPL Token CLI**: Command-line interface for managing SPL tokens in test environments. Enables token creation, minting, and account management essential for trading flow testing. https://spl.solana.com/token

- **Metaplex Test Utils**: Advanced testing utilities for complex Solana program interactions, including account mocking and instruction simulation. Useful for sophisticated test scenarios requiring precise state control. https://github.com/metaplex-foundation/js

## TESTING INFRASTRUCTURE COMPONENTS:

### Validator Management Script:
- Check if `solana-test-validator` process is running on port 8899
- Launch validator in detached screen session if not active
- Configure with proper program deployments and initial state
- Handle graceful shutdown and ledger cleanup

### Deployment Pipeline:
- Execute `anchor keys sync` to align program IDs with keypairs
- Run `anchor build` with proper workspace configuration
- Deploy all 4 programs with `anchor deploy --provider.cluster localnet`
- Verify deployment success and program account initialization

### Wallet Management:
- Generate test keypair pairs for maker/taker trading scenarios
- Check SOL balances via RPC calls to local validator
- Request airdrops for wallets with insufficient funds (< 1000 SOL)
- Monitor transaction fees and maintain minimum operational balance

### Test Suite Architecture:
- **Price Oracle Tests**: Initialize oracle, register price routes, update prices, verify tolerance checks
- **Profile Tests**: Create profiles, update usernames, record trade completions, verify reputation scoring
- **Offer Tests**: Create/update/pause/resume offers, validate constraints, test offer taking mechanics
- **Trade Tests**: Full trade lifecycle with escrow management, CPI calls, and completion flows
- **Integration Tests**: Cross-program interactions, atomic multi-instruction transactions, error scenarios

### Happy Path E2E Validation:
1. **Environment Setup**: Deploy programs, initialize oracle with USD price routes
2. **User Onboarding**: Create profiles for both trader wallets with unique usernames
3. **Token Preparation**: Create test token mint, distribute tokens to seller wallet
4. **Offer Publishing**: Seller creates offer with amount, price-per-token, and trading constraints
5. **Trade Execution**: Buyer accepts offer, triggering escrow transfer and trade state update
6. **Price Verification**: Oracle validates trade price against current market rates with tolerance
7. **Settlement**: Complete trade with token release, profile updates, and reputation adjustments
8. **State Verification**: Assert all account states, token balances, and cross-program relationships

## PROGRAM INTERACTION FLOWS:

### Cross-Program Dependencies:
- **Trade → Price**: CPI call for price verification before trade completion
- **Trade → Profile**: CPI calls to update both buyer and seller reputation scores
- **Offer → Trade**: Reference trade program for escrow account management
- **All Programs**: Dependency on SPL Token program for token operations

### Critical Test Scenarios:
- Multiple simultaneous trades with shared price oracle
- Offer updates while active trades are in progress  
- Price oracle tolerance boundary testing
- Profile reputation edge cases (underflow prevention)
- Escrow security with malicious account attempts
- Program upgrade compatibility with existing accounts
