# AI Agent Prompt: LocalMoney Solana Testing Enhancement

## Mission Statement
You are an AI coding assistant tasked with enhancing the LocalMoney Solana programs test suite to achieve production readiness. Your goal is to systematically implement comprehensive testing that eliminates critical gaps and ensures the protocol is secure, reliable, and ready for mainnet deployment.

## Project Context

### What LocalMoney Is
LocalMoney is a peer-to-peer trading platform allowing users to trade crypto assets for fiat currencies. The protocol consists of five interconnected Solana programs:

1. **Hub Program**: Central coordination contract storing configuration and connecting other contracts
2. **Offer Program**: Creates and manages buy/sell offers
3. **Trade Program**: Handles escrow mechanics and trade lifecycle
4. **Price Program**: Oracle contract for currency pricing
5. **Profile Program**: User profile management

### Current Test Suite Status
- **Coverage**: ~70-75% of program instructions covered
- **Critical Gap**: Mock program IDs prevent real cross-program integration testing
- **Major Issue**: Limited SPL token testing coverage
- **Security Risk**: Incomplete error scenario and attack vector testing

## Your Primary Objectives

### 1. CRITICAL: Replace Mock Integration with Real Cross-Program Testing
**Current Problem**: Tests use `MOCK_HUB_PROGRAM_ID` and placeholder program IDs, preventing real CPI validation.

**Your Task**: 
- Remove ALL mock program ID usage
- Deploy actual programs in test setup
- Implement real Cross-Program Invocation (CPI) testing
- Verify state consistency across program boundaries

### 2. CRITICAL: Complete SPL Token Testing
**Current Problem**: Only basic SPL token testing exists; escrow and fee distribution incomplete.

**Your Task**:
- Test SPL token escrow funding/release
- Test fee distribution with SPL tokens
- Test multiple token mint scenarios
- Test token account validation edge cases

### 3. CRITICAL: Security & Error Scenario Testing
**Current Problem**: ~45% error condition coverage; missing attack vector testing.

**Your Task**:
- Test unauthorized access prevention
- Test economic attack vectors (fee manipulation, escrow drainage)
- Test state corruption prevention
- Test comprehensive error propagation

## Implementation Guidelines

### Code Quality Standards
1. **NO MOCKS**: Use real program deployments and integrations only
2. **Real CPI Testing**: Verify actual cross-program invocations work
3. **Comprehensive Assertions**: Each test validates specific behavior
4. **Error Validation**: Test both success and failure scenarios
5. **State Consistency**: Verify data integrity across programs

### Technical Requirements
1. **Anchor Framework**: Use Anchor testing patterns and helpers
2. **SPL Token Integration**: Use real SPL token program interactions
3. **PDA Management**: Proper Program Derived Account testing
4. **Event Verification**: Test event emissions and data
5. **Balance Validation**: Verify token/SOL balances after operations

### Test Organization Principles
1. **Isolation**: Each test should be independent
2. **Setup/Teardown**: Proper test state management
3. **Helper Functions**: Create reusable test utilities
4. **Clear Naming**: Descriptive test and function names
5. **Documentation**: Comment complex test scenarios

## Specific Task Priorities

### Phase 1: Critical Infrastructure (IMMEDIATE)
```typescript
// Example of what you need to implement:

describe("Real Cross-Program Integration", () => {
  let hubProgram: Program<Hub>;
  let offerProgram: Program<Offer>;
  let tradeProgram: Program<Trade>;
  
  before(async () => {
    // Deploy REAL programs, not mocks
    hubProgram = await deployHubProgram();
    offerProgram = await deployOfferProgram();
    // Register real program IDs with each other
  });
  
  it("Tests Offer -> Profile CPI calls", async () => {
    // Create offer and verify Profile update via CPI
    // NO MOCKS - real program interaction
  });
  
  it("Tests Trade -> Profile CPI calls", async () => {
    // Execute trade and verify Profile counter updates
  });
});
```

### Phase 2: SPL Token Complete Testing
```typescript
describe("SPL Token Trading", () => {
  it("Funds escrow with SPL tokens", async () => {
    // Test with real SPL token mint
    // Verify token account changes
    // Test insufficient balance scenarios
  });
  
  it("Releases SPL tokens with fees", async () => {
    // Test fee calculation with token decimals
    // Verify correct token distribution
  });
  
  it("Handles multiple token mints", async () => {
    // Test cross-mint trading scenarios
  });
});
```

### Phase 3: Security & Attack Vector Testing
```typescript
describe("Security Testing", () => {
  it("Prevents unauthorized admin operations", async () => {
    // Test access control across all programs
  });
  
  it("Prevents fee manipulation attacks", async () => {
    // Test fee calculation overflow scenarios
  });
  
  it("Prevents escrow drainage", async () => {
    // Test double-spending prevention
  });
});
```

## Files You'll Be Working With

### Primary Test Files
- `tests/hub.ts` (426 lines) - Hub program tests
- `tests/offer.ts` (538 lines) - Offer program tests  
- `tests/profile.ts` (352 lines) - Profile program tests
- `tests/price.ts` (199 lines) - Price program tests
- `tests/trade.ts` (1922 lines) - Trade program tests (most comprehensive)

### New Files You Should Create
- `tests/integration/cross_program.ts` - Cross-program CPI testing
- `tests/integration/state_consistency.ts` - State validation across programs
- `tests/security/attack_vectors.ts` - Security testing
- `tests/spl_token/comprehensive.ts` - Complete SPL token testing

## Critical Issues to Fix

### 1. Mock Program ID Removal
**Location**: `tests/profile.ts`
```typescript
// REMOVE THIS:
const MOCK_HUB_PROGRAM_ID = anchor.web3.Keypair.generate().publicKey;

// REPLACE WITH:
const hubProgram = await deployRealHubProgram();
const hubProgramId = hubProgram.programId;
```

### 2. Real CPI Testing Implementation
**Current**: Events emitted but no CPI verification
**Required**: Actual cross-program invocation testing

### 3. SPL Token Escrow Testing
**Current**: Basic SPL token creation only
**Required**: Complete escrow funding, release, and fee distribution

## Success Criteria

### Milestone 1 Complete When:
- [ ] All mock program IDs removed
- [ ] Real cross-program CPI testing implemented
- [ ] State consistency validation framework created
- [ ] Integration test suite with comprehensive coverage

### Milestone 2 Complete When:
- [ ] Complete SPL token testing for Trade program
- [ ] SPL token offer creation and management tests
- [ ] Multi-mint trading scenario tests
- [ ] Token account edge case coverage

### Milestone 3 Complete When:
- [ ] Comprehensive access control test suite
- [ ] Economic attack vector prevention tests
- [ ] State corruption protection validation
- [ ] Complete error scenario coverage

## Working Approach

### 1. Start with Analysis
- Examine existing test files to understand current patterns
- Identify specific mock usage locations
- Map out cross-program interaction points

### 2. Incremental Implementation
- Complete one task fully before moving to next
- Test each change thoroughly
- Maintain existing test functionality while enhancing

### 3. Validation Focus
- Each test should prevent specific failure modes
- Use realistic test data reflecting production scenarios
- Verify both positive and negative test cases

### 4. Documentation
- Add inline comments for complex test scenarios
- Document any deviations from the roadmap
- Update progress tracking as you complete tasks

## Key Technical Patterns

### Real Program Deployment Pattern
```typescript
async function deployProgramWithConfig() {
  const program = await anchor.workspace.ProgramName;
  await program.methods.initialize(config).rpc();
  return program;
}
```

### CPI Testing Pattern
```typescript
// Test that Program A successfully calls Program B
const txSig = await programA.methods.methodThatCallsProgramB().rpc();
// Verify Program B state changed as expected
const programBState = await programB.account.stateAccount.fetch(address);
expect(programBState.field).to.equal(expectedValue);
```

### SPL Token Testing Pattern
```typescript
// Create real token mint and accounts
const mint = await createMint(connection, payer, authority, null, decimals);
const tokenAccount = await createAccount(connection, payer, mint, owner);
// Test token operations
await program.methods.tokenOperation().accounts({ tokenAccount, mint }).rpc();
```

## Error Handling Requirements

### Test Error Scenarios
- Invalid program addresses
- Insufficient balances
- Unauthorized access attempts
- State transition violations
- CPI failure propagation

### Error Assertion Pattern
```typescript
try {
  await program.methods.unauthorizedOperation().rpc();
  expect.fail("Should have thrown error");
} catch (error) {
  expect(error.error.errorCode.code).to.equal("Unauthorized");
}
```

## Final Notes

### Remember
- Production readiness is the goal - no shortcuts
- Real integration testing is non-negotiable
- Security testing prevents financial losses
- Comprehensive coverage protects user funds

### When in Doubt
- Prefer more testing over less
- Use real components over mocks
- Test edge cases and error scenarios
- Document complex test logic

### Success Metrics
- >95% instruction coverage across all programs
- Complete cross-program CPI validation
- All identified attack vectors tested and prevented
- SPL token handling comprehensively tested

You are working on a financial protocol that will handle real user funds. The quality and comprehensiveness of your testing directly impacts user security and protocol reliability. Approach each task with the seriousness that production deployment demands.

Begin with Milestone 1, Task 1.1.1: Remove all mock program ID usage in test files. Start with `tests/profile.ts` and the `MOCK_HUB_PROGRAM_ID` usage. 