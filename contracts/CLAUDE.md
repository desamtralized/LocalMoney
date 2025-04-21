# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- CosmWasm: `cd cosmwasm && cargo +nightly build`
- CosmWasm optimize: `cd cosmwasm && sh optimize.sh`
- Solana: `cd solana && anchor build`

## Test Commands
- Solana all tests: `cd solana && anchor test`
- Solana single test: `cd solana && yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/hub.test.ts`
- CosmWasm tests: `cd cosmwasm && cargo test`

## Lint/Format Commands
- Rust: `rustfmt`
- Solana lint check: `cd solana && anchor lint`

## Code Style
- Rust: snake_case for functions/variables, PascalCase for types/structs
- TypeScript: camelCase for functions/variables, PascalCase for classes/interfaces
- Error handling: Use proper error types (ErrorCode in Solana, thiserror in CosmWasm)
- 4-space indentation (soft tabs, no hard tabs)
- Unix line endings

## Project Structure
- Solana programs in `/solana/programs/`
- CosmWasm contracts in `/cosmwasm/contracts/`
- Shared code in `/solana/programs/shared/` and `/cosmwasm/packages/`
- Test files in `/solana/tests/` and within CosmWasm contracts