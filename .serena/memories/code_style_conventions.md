# Code Style and Conventions

## TypeScript/Vue Frontend (app/)

### ESLint Configuration
- Extends `@antfu` and `prettier` configs
- **Code Style**:
  - Single quotes preferred
  - No semicolons
  - 2-space indentation
  - 120 character line width
  - Trailing commas in arrays (always-multiline)
  - 1TBS brace style (no single-line blocks)
  - Arrow functions always use parentheses

### TypeScript Settings
- Strict mode enabled
- `noUnusedLocals: true`
- `strictNullChecks: true`
- `forceConsistentCasingInFileNames: true`
- Path alias: `~/` maps to `src/`

### Vue Specific
- Attribute names: camelCase (not hyphenated)
- Event names: camelCase (not hyphenated)
- Component organization follows Vue 3 Composition API patterns

## Rust (Solana & CosmWasm)

### Solana (Anchor)
- Anchor framework v0.31.1
- Standard Rust formatting with `cargo fmt`
- Clippy linting enabled
- Overflow checks enabled in release builds

### CosmWasm
- Unix line endings
- 4-space indentation (no tabs)
- Standard Rust conventions
- Uses workspace dependencies pattern

### General Rust Conventions
- Snake_case for functions and variables
- PascalCase for structs and enums
- SCREAMING_SNAKE_CASE for constants
- Follow Rust API guidelines