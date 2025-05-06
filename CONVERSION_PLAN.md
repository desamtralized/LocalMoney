# LocalMoney Protocol Conversion Plan: CosmWasm → Anchor/Solana

This document outlines an end-to-end roadmap for re-implementing the LocalMoney protocol (originally in CosmWasm) as a suite of Anchor/Solana programs. It covers project goals, environment requirements, milestones, technical mappings, and maintenance guidelines.

---

## 1. Project Overview & Goals

- **Objective:** Port the five core LocalMoney modules (Hub, Offer, Profile, Price, Trade) from CosmWasm/Rust into the Anchor framework on Solana.
- **Approach:** Use Anchor v0.31.x, Solana CLI v2.1.x, Rust 1.85+, and TypeScript testing via @coral-xyz/anchor.
- **Scope:** Implement equivalent account structures, state machines, fee logic, and cross-program flows; deliver unit, integration, and end-to-end tests; set up CI/CD and documentation.

---

## 2. Requirements & Environment

### 2.1 Toolchain

- Rust ≥ 1.85.0 (via `rustup`)
- Solana CLI ≥ 2.1.15 (`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`)
- Anchor CLI ≥ 0.31.1 (via `avm install latest && avm use latest`)
- Node.js ≥ 18.x and Yarn ≥ 1.22 for TypeScript test harness

### 2.2 Anchor Workspace Structure

```
LocalMoney/contracts/solana/
├─ Anchor.toml
├─ programs/
│  ├─ hub/
│  ├─ offer/
│  ├─ profile/
│  ├─ price/
│  └─ trade/
├─ tests/          # TS or Rust e2e tests
├─ idl/            # Generated IDLs
└─ .github/workflows/ci.yml
```

### 2.3 Accounts & PDAs

- **HubConfig PDA:** `Pubkey::find_program_address(&[b"hub"], program_id)`
- **Offer PDA:** `[b"offer", &offer_id.to_le_bytes()]`
- **Profile PDA:** `[b"profile", user_pubkey]`
- **Price & Trade PDAs:** similar seeds with module prefix

### 2.4 Cross-Program Invocations (CPIs)

- Replace CosmWasm `SubMsg` patterns with Anchor CPIs via `#[derive(Accounts)]` and `Program<'info, X>` contexts.

### 2.5 Testing & CI/CD

- Use `anchor test` (TS + Rust) on localnet.
- GitHub Actions: `anchor build`, `anchor test`, `anchor deploy --provider.cluster devnet`, plus lint steps.

---

## 3. Milestones

- [x] M1: Environment & Scaffolding
  - [x] Install Rust, Solana CLI, Anchor CLI, Node.js, and Yarn
  - [x] Initialize Anchor workspace skeleton and program directories
  - [x] Configure `Anchor.toml` and tsconfig for tests
  - [x] Stub GitHub Actions CI workflow with build and test steps
  - [x] Run and verify `anchor build` succeeds locally

- [x] M2: Hub Program
  - [x] Define `HubConfig` account struct and PDA seeds
  - [x] Implement `initialize` instruction
  - [x] Implement `update_config` and `update_admin` instructions
  - [x] Add fee and timer guard logic
  - [x] Write unit tests to cover all Hub instructions and validations

- [ ] M3: Offer + Profile Programs
  - [x] Define Offer PDA and account struct
  - [x] Implement `register_hub`, `create_offer`, and `update_offer` instructions
  - [x] Emit CPI events from the Offer program
  - [x] Define Profile PDA and account struct
  - [x] Implement `register_hub` and counter update instructions in Profile
  - [x] Write CPI and query tests for Offer and Profile flows

- [ ] M4: Price Oracle Program
  - [ ] Define Price PDA and account struct
  - [ ] Implement `register_hub` instruction
  - [ ] Implement `update_prices` and `register_routes` instructions
  - [ ] Implement `get_price` query with pool CPI integration
  - [ ] Write tests to verify on-chain and fiat price consistency

- [ ] M5: Trade Lifecycle
  - [ ] Define Trade PDA and account struct
  - [ ] Implement `create_trade` and `accept_trade` instructions
  - [ ] Implement `fund_trade` and `deposit_trade` instructions
  - [ ] Add state transition checks and profile CPI counters
  - [ ] Write integration tests for full trade lifecycle

- [ ] M6: Trade Settlement & Dispute
  - [ ] Implement `release_escrow` with fee distribution logic
  - [ ] Integrate SPL token transfers for CW20/native assets
  - [ ] Implement `dispute_trade`, `settle_trade`, and `refund_trade` instructions
  - [ ] Add arbitrator management instructions and validations
  - [ ] Write tests covering settlement and dispute scenarios

- [ ] M7: End-to-End Tests & Devnet Deploy
  - [ ] Develop TypeScript e2e scripts covering all module flows
  - [ ] Set up localnet testing environment and validate flows
  - [ ] Deploy programs to Devnet cluster
  - [ ] Execute e2e scripts against Devnet and fix any issues

- [ ] M8: Performance & Audit Prep
  - [ ] Benchmark critical instruction paths for CU usage
  - [ ] Optimize Rust code for gas and compute efficiency
  - [ ] Run Clippy and fix lint warnings
  - [ ] Prepare audit checklist and documentation
  - [ ] Conduct internal code review for security best practices

- [ ] M9: Mainnet Readiness
  - [ ] Finalize program documentation and generate IDLs
  - [ ] Configure `Anchor.toml` for mainnet deployment
  - [ ] Draft migration guide for existing data and state
  - [ ] Publish TypeScript client package to NPM
  - [ ] Prepare release notes and developer announcement

---

## 4. Key Technical Notes & Mappings

1. **PDAs & Seeds**: Use module prefixes and ID bytes for deterministic PDAs.
2. **Indexing & Queries**: Store index arrays or use Anchor account lists for pagination.
3. **Error Handling**: Map CosmWasm errors to `#[error_code]` in Anchor, use `require!` macros.
4. **Zero-Copy Serialization**: Apply `#[account(zero_copy)]` to large tables.
5. **Events**: Port CosmWasm events into `#[event]` structs.
6. **Fee & Conversion Routes**: CPI into SPL Token program or serum-DEX for swaps.

---

## 5. Long-Term & Maintenance

- **Migrations**: Leverage Anchor's upgradeable programs and `anchor upgrade` workflows.
- **Monitoring**: Subscribe to on-chain events for off-chain indexing.
- **Documentation**: Host IDLs, developer guides, and migration notes on GitHub.
- **Community & Support**: Publish TS clients to NPM (`@localmoney/anchor`) and maintain versioned releases.

---

*End of Conversion Plan* 