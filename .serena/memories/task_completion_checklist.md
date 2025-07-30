# Task Completion Checklist

## When completing any development task, run these commands:

### Frontend Changes (app/)
1. **Type Check**: `yarn typecheck` - Ensure no TypeScript errors
2. **Lint**: `yarn lint` - Check code style compliance
3. **Fix Linting**: `yarn lint:fix` - Auto-fix formatting issues
4. **Test**: `yarn test` - Run Jest tests to ensure functionality
5. **Build Check**: `yarn build` - Verify production build works

### Solana Contract Changes (contracts/solana/)
1. **Build**: `anchor build` - Compile all programs
2. **Format**: `cargo fmt` - Apply Rust formatting
3. **Lint**: `cargo clippy` - Check for Rust best practices
4. **Test**: `anchor test` - Run program tests
5. **Prettier**: `yarn lint:fix` - Format TypeScript test files

### CosmWasm Contract Changes (contracts/cosmwasm/)
1. **Build**: `cargo build` - Compile contracts
2. **Format**: `cargo fmt` - Apply Rust formatting  
3. **Lint**: `cargo clipgy` - Check for issues
4. **Test**: `cargo test` - Run contract tests
5. **All Checks**: `./all.sh` - Run comprehensive validation

## Important Notes
- **Never downgrade Anchor** - As specified in CLAUDE.md
- **Never downgrade dependencies** to fix issues
- Always fix the root cause rather than downgrading
- Ensure all tests pass before considering task complete
- Check git status to review changes before committing