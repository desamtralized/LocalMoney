# LocalMoney Protocol Migration Task List: CosmWasm to Solana

## Overview

This document provides a comprehensive, actionable task list for migrating the LocalMoney protocol from CosmWasm to Solana using the Anchor Framework. Tasks are organized by phase and priority, with clear deliverables and acceptance criteria.

## Project Setup and Infrastructure

### Phase 0: Environment Setup (Week 1)

#### Task 0.1: Development Environment Setup
- [x] **0.1.1** Install Rust toolchain (latest stable)
- [x] **0.1.2** Install Solana CLI tools (v1.18+)
- [x] **0.1.3** Install Anchor CLI (v0.31.1)
- [x] **0.1.4** Set up local Solana validator
- [x] **0.1.5** Configure development keypairs

**Deliverable**: Fully configured development environment
**Acceptance Criteria**: Can build and deploy basic Anchor program

#### Task 0.2: Project Structure Creation
- [x] **0.2.1** Initialize Anchor workspace
- [x] **0.2.2** Create program directories (hub, offer, trade, profile, price)
- [x] **0.2.3** Set up shared types library
- [x] **0.2.4** Configure Cargo.toml dependencies
- [x] **0.2.5** Set up testing framework structure
- [x] **0.2.6** Update .gitignore file to include Anchor artifacts

**Deliverable**: Complete project structure
**Acceptance Criteria**: All programs compile successfully ✅

#### Task 0.3: Shared Types and Constants
- [x] **0.3.1** Define FiatCurrency enum (20 popular currencies)
- [x] **0.3.2** Define OfferType and OfferState enums
- [x] **0.3.3** Define TradeState enum (12 states)
- [x] **0.3.4** Define error codes for all programs
- [x] **0.3.5** Define protocol constants (fees, limits, timers)
- [x] **0.3.6** Create utility functions for common operations

**Deliverable**: Shared types library ✅
**Acceptance Criteria**: All programs can import and use shared types ✅

## Phase 1: Foundation Programs

### Hub Program Implementation

#### Task 1.1: Hub Program Core Structure
- [x] **1.1.1** Define GlobalConfig account structure
- [x] **1.1.2** Implement initialize instruction
- [x] **1.1.3** Implement update_config instruction
- [x] **1.1.4** Implement update_authority instruction
- [x] **1.1.5** Add configuration validation logic
- [x] **1.1.6** Implement fee constraint validation (max 10%)

**Deliverable**: Basic Hub program ✅
**Acceptance Criteria**: Can initialize and update global configuration ✅

#### Task 1.2: Hub Program Advanced Features
- [x] **1.2.1** Add program registry management
- [x] **1.2.2** Implement parameter validation functions
- [x] **1.2.3** Add event emission for configuration changes
- [x] **1.2.4** Implement query functions for configuration
- [x] **1.2.5** Add upgrade authority management
- [x] **1.2.6** Write comprehensive unit tests

**Deliverable**: Complete Hub program
**Acceptance Criteria**: All configuration management functions work correctly

### Profile Program Implementation

#### Task 1.3: Profile Program Core Structure
- [x] **1.3.1** Define Profile account structure
- [x] **1.3.2** Implement create_profile instruction
- [x] **1.3.3** Implement update_contact instruction
- [x] **1.3.4** Implement update_trade_stats instruction
- [x] **1.3.5** Implement update_offer_stats instruction
- [x] **1.3.6** Add profile validation logic

**Deliverable**: Basic Profile program ✅
**Acceptance Criteria**: Can create and update user profiles ✅

#### Task 1.4: Profile Program Advanced Features
- [x] **1.4.1** Add activity limit enforcement
- [x] **1.4.2** Implement reputation tracking
- [x] **1.4.3** Add profile query functions
- [x] **1.4.4** Implement contact encryption handling
- [x] **1.4.5** Add profile statistics aggregation
- [x] **1.4.6** Write comprehensive unit tests

**Deliverable**: Complete Profile program
**Acceptance Criteria**: All profile management functions work correctly

### Price Program Implementation

#### Task 1.5: Price Program Core Structure
- [x] **1.5.1** Define CurrencyPrice account structure
- [x] **1.5.2** Define PriceRoute account structure
- [x] **1.5.3** Implement update_prices instruction
- [x] **1.5.4** Implement register_price_route instruction
- [x] **1.5.5** Implement price query functions
- [x] **1.5.6** Add price validation logic

**Deliverable**: Basic Price program ✅
**Acceptance Criteria**: Can update and query currency prices ✅

#### Task 1.6: Price Program Advanced Features
- [x] **1.6.1** Add multi-step price route calculation
- [x] **1.6.2** Implement price staleness checks
- [x] **1.6.3** Add oracle integration interfaces
- [x] **1.6.4** Implement price aggregation logic
- [x] **1.6.5** Add price history tracking (optional)
  - ✅ Added PriceHistoryEntry struct for tracking price changes over time with timestamps, prices, sources, and confidence levels
  - ✅ Implemented PriceHistory account with automatic entry management (max 50 entries with oldest removal)
  - ✅ Added PRICE_HISTORY_SEED constant and proper account size calculations
  - ✅ Created add_price_history() instruction for manual price history entry addition
  - ✅ Implemented get_price_history() function for retrieving recent price data with configurable limits
  - ✅ Added get_price_statistics() with comprehensive analytics including min/max/average calculations, weighted averages, and volatility analysis
  - ✅ Implemented update_prices_with_history() for automatic history tracking during price updates
  - ✅ Added comprehensive unit tests covering all price history functionality and edge cases
  - ✅ Included NoHistoryData error code for proper error handling when no data is available
  - ✅ Support for confidence levels (0-100%) for data quality tracking and weighted calculations
  - ✅ Historical analysis capabilities for price trends, market volatility, and statistical analysis
- [x] **1.6.6** Write comprehensive unit tests

**Deliverable**: Complete Price program ✅
**Acceptance Criteria**: All price management functions work correctly ✅

## Phase 2: Core Trading Programs

### Offer Program Implementation

#### Task 2.1: Offer Program Core Structure
- [x] **2.1.1** Define Offer account structure
- [x] **2.1.2** Define OfferCounter account structure
- [x] **2.1.3** Implement create_offer instruction
- [x] **2.1.4** Implement update_offer instruction
- [x] **2.1.5** Implement close_offer instruction
- [x] **2.1.6** Add offer validation logic

**Deliverable**: Basic Offer program ✅
**Acceptance Criteria**: Can create, update, and close offers ✅

#### Task 2.2: Offer Program Advanced Features
- [x] **2.2.1** Add offer filtering and search functions
- [x] **2.2.2** Implement offer pagination
- [x] **2.2.3** Add offer state management
- [x] **2.2.4** Implement rate validation against market prices
- [x] **2.2.5** Add offer expiration handling
- [x] **2.2.6** Write comprehensive unit tests

**Deliverable**: Complete Offer program
**Acceptance Criteria**: All offer management functions work correctly

#### Task 2.3: Offer-Profile Integration
- [x] **2.3.1** Implement CPI calls to Profile program
  - ✅ Added CPI calls to profile::update_offer_stats() in offer creation and closure
  - ✅ Added CPI calls to profile::can_create_offer() for activity limit validation
  - ✅ Added CPI calls to profile::profile_exists() for profile validation
  - ✅ Updated CreateOffer account structure with optional profile accounts
  - ✅ Created UpdateOfferWithProfile account structure for profile integration
  - ✅ Added create_offer_with_profile_validation() function for comprehensive validation
  - ✅ Enhanced close_offer() function with profile statistics updates
  - ✅ Added ProfileRequired and OfferLimitExceeded error codes to shared-types
  - ✅ Successfully compiled with CPI integration (core functionality working)
  - ✅ Profile statistics automatically updated when offers are created/closed
- [x] **2.3.2** Add active offer count updates
  - ✅ Enhanced pause_offer() function with profile statistics updates (decrement on pause)
  - ✅ Enhanced activate_offer() function with profile statistics updates (increment on activation)
  - ✅ Enhanced update_offer_state() with comprehensive state transition handling
  - ✅ Added proper profile count management for all state transitions (Active↔Paused↔Archive)
  - ✅ Added sync_profile_offer_counts() function for bulk synchronization of profile statistics
  - ✅ Created SyncProfileOfferCounts account structure for profile sync operations
  - ✅ Implemented logic to only count Active offers toward active_offers_count in profile
  - ✅ All offer state changes now properly update profile statistics via CPI calls
  - ✅ Successfully compiled with enhanced profile integration
- [x] **2.3.3** Add contact information updates
  - ✅ Added update_contact_information() function with CPI calls to Profile program
  - ✅ Created update_contact_for_trading() with enhanced validation for trading context
  - ✅ Added get_contact_for_offers() query function for trading-relevant contact info
  - ✅ Created UpdateContactInformation and GetContactInformation account structures
  - ✅ Added ContactInfoSummary data structure for trading context validation
  - ✅ Implemented contact encryption status validation via Profile program CPI
  - ✅ Added ContactInfoRequired error code to shared-types
  - ✅ Added trading suitability validation and security recommendations
  - ✅ Successfully compiled with contact information integration
- [x] **2.3.4** Implement offer limit enforcement
  - ✅ Added check_offer_limits() function with comprehensive Hub program integration
  - ✅ Created create_offer_with_limits() function enforcing all Hub program limits
  - ✅ Added get_user_limits_status() query function for user limit information
  - ✅ Implemented CPI calls to hub::validate_user_activity_limits() for offer count validation
  - ✅ Added CPI calls to hub::validate_trade_amount() for amount limit enforcement
  - ✅ Created CheckOfferLimits, GetUserLimitsStatus, and CreateOfferWithLimits account structures
  - ✅ Added UserLimitsStatus data structure with current usage and availability info
  - ✅ Integrated with Hub program configuration for dynamic limit management
  - ✅ Added proper error handling for limit violations (OfferLimitExceeded, amounts)
  - ✅ Successfully compiled with comprehensive limit enforcement system
- [x] **2.3.5** Add profile validation in offer creation
  - ✅ Added `validate_profile_for_offers()` function with comprehensive scoring system (0-100 points)
  - ✅ Implemented profile age validation (minimum 7 days old requirement)
  - ✅ Added reputation score requirements with configurable minimums
  - ✅ Implemented trading history validation with minimum completed trades
  - ✅ Added contact information requirement validation
  - ✅ Created activity pattern analysis (must trade within 90 days or be new user)
  - ✅ Added `create_offer_with_comprehensive_validation()` function with strict profile requirements
  - ✅ Created `ProfileValidationResult` data structure with detailed validation metrics
  - ✅ Added proper error handling with ProfileValidationFailed and ContactInfoRequired error codes
  - ✅ Integrated Hub program CPI calls for activity limit validation
  - ✅ Added comprehensive validation criteria: profile age, reputation, trades, contact info, activity pattern
  - ✅ Created detailed validation scoring: Reputation (25 pts), Trade history (30 pts), Profile age (20 pts), Contact (15 pts), Activity (10 pts)
  - ✅ Added recommendation system with specific improvement suggestions
  - ✅ Successfully compiled with comprehensive profile validation system
- [x] **2.3.6** Test cross-program integration
  - ✅ Created comprehensive integration test suite in `tests/offer-profile-integration.test.ts`
  - ✅ Implemented tests for profile validation in offer creation (ProfileRequired error handling)
  - ✅ Added tests for active offer count management (pause, activate, archive operations)
  - ✅ Created tests for offer limit enforcement (maximum active offers validation)
  - ✅ Implemented contact information integration tests (CPI calls to Profile program)
  - ✅ Added comprehensive profile validation tests (scoring system, validation criteria)
  - ✅ Created profile statistics synchronization tests (sync_profile_offer_counts function)
  - ✅ Implemented error handling tests (CPI call failures, invalid accounts)
  - ✅ Added test coverage for all CPI functions: can_create_offer(), update_offer_stats(), profile_exists(), update_contact(), validate_contact_encryption()
  - ✅ Verified Hub program integration for activity limits validation
  - ✅ All cross-program interactions properly tested with realistic scenarios
  - ✅ Test suite covers edge cases, error conditions, and security validations
  - ✅ Successfully integrated with existing test framework and utilities

**Deliverable**: Integrated Offer-Profile functionality ✅
**Acceptance Criteria**: Offer operations correctly update profile statistics ✅

### Trade Program Implementation

#### Task 2.4: Trade Program Core Structure
- [x] **2.4.1** Define Trade account structure
- [x] **2.4.2** Define TradeCounter account structure
- [x] **2.4.3** Define TradeStateItem structure
- [x] **2.4.4** Implement create_trade instruction
- [x] **2.4.5** Implement accept_trade instruction
- [x] **2.4.6** Add trade validation logic

**Deliverable**: Basic Trade program structure ✅
**Acceptance Criteria**: Can create and accept trade requests ✅

#### Task 2.5: Escrow Management
- [x] **2.5.1** Design escrow account structure
  - ✅ Added dedicated Escrow account with comprehensive state management
  - ✅ Implemented EscrowState enum (Created, Funded, Released, Refunded, Disputed)
  - ✅ Created EscrowReleaseConditions with timeout and approval controls
  - ✅ Added detailed EscrowFeeBreakdown for transparent fee distribution
  - ✅ Comprehensive escrow account structure with proper PDA management
- [x] **2.5.2** Implement fund_escrow instruction
  - ✅ Enhanced fund_escrow with escrow account initialization
  - ✅ Added comprehensive validation and fee calculation
  - ✅ Integrated with Hub program configuration for dynamic fee rates
  - ✅ Proper token transfer from seller to escrow with security checks
  - ✅ Release conditions setup based on Hub program configuration
- [x] **2.5.3** Implement release_escrow instruction
  - ✅ Updated release_escrow with escrow state management
  - ✅ Added proper fee distribution to multiple collectors (chain, warchest, burn)
  - ✅ Implemented timeout validation and release condition checks
  - ✅ Net amount calculation after fee deduction
  - ✅ Secure token transfer with escrow authority validation
- [x] **2.5.4** Implement refund_escrow instruction
  - ✅ Enhanced refund_escrow with escrow state validation
  - ✅ Added dispute timeout checks for refund eligibility
  - ✅ Full amount refund to seller (no fees deducted for refunds)
  - ✅ Proper escrow state transition to Refunded
  - ✅ Security validation for trade participants
- [x] **2.5.5** Add escrow validation and security checks
  - ✅ Comprehensive validate_escrow_security function with 15+ validation checks
  - ✅ Escrow state transition validation with proper state machine
  - ✅ Fee limit validation (max 10% chain, 5% burn/warchest/arbitration, 2% platform)
  - ✅ Timestamp and timeout validation for release conditions
  - ✅ Token mint and trade account relationship validation
  - ✅ Added can_release_escrow and can_refund_escrow helper functions
- [x] **2.5.6** Implement fee calculation and distribution
  - ✅ Added calculate_escrow_fees with detailed breakdown calculation
  - ✅ Implemented distribute_escrow_fees for proper fee distribution
  - ✅ Multiple fee collectors: chain_fee_collector, warchest_collector, burn_collector
  - ✅ Platform fee calculation (0.5% of total fees for admin operations)
  - ✅ Math overflow protection and comprehensive error handling

**Deliverable**: Complete escrow system ✅
**Acceptance Criteria**: Secure escrow operations with proper fee handling ✅

#### Task 2.6: Trade State Management
- [x] **2.6.1** Implement state transition validation
  - ✅ Enhanced state transition validation with detailed logging and error context
  - ✅ Added support for no-op transitions and comprehensive state machine validation
  - ✅ Implemented validation for terminal states and invalid transitions
  - ✅ Added detailed logging for all state transitions with success/failure messages
- [x] **2.6.2** Add state history tracking
  - ✅ Enhanced state history tracking with validation and timestamp checks
  - ✅ Added comprehensive state history query functions for analysis
  - ✅ Implemented state duration tracking and actor-based history filtering
  - ✅ Added recent state history retrieval and state duration calculations
  - ✅ Enhanced TradeSummary with state change count and last change timestamp
- [x] **2.6.3** Implement trade expiration handling
  - ✅ Enhanced trade expiration with comprehensive status tracking
  - ✅ Added time remaining calculations and expiring soon warnings
  - ✅ Implemented can_expire validation and expiration status queries
  - ✅ Added expire_trade instruction for manual expiration triggering
  - ✅ Created ExpirationStatus struct with detailed expiration information
- [x] **2.6.4** Add fiat_deposited instruction
  - ✅ Confirmed confirm_fiat_deposited instruction already implemented
  - ✅ Instruction allows buyer to confirm fiat payment transition to FiatDeposited state
  - ✅ Complete validation and state management for fiat payment confirmation
- [x] **2.6.5** Implement cancel_trade instruction
  - ✅ Enhanced cancel_trade instruction with reason tracking and improved validation
  - ✅ Added optional cancellation reason parameter with length validation
  - ✅ Improved authority validation based on trade state
  - ✅ Added expiration checks to prevent canceling expired trades
  - ✅ Enhanced error messaging and logging for cancellation tracking
- [x] **2.6.6** Add comprehensive state validation
  - ✅ Added validate_trade_comprehensive function with detailed error reporting
  - ✅ Implemented TradeValidationResult with warnings, errors, and recommendations
  - ✅ Added validate_trade_business_rules for protocol constraint validation
  - ✅ Created BusinessRuleValidationResult for compliance tracking
  - ✅ Comprehensive validation covering data integrity, state consistency, timestamps, 
       expiration, state history, hub configuration, and business rules

**Deliverable**: Complete trade state management ✅
**Acceptance Criteria**: All trade state transitions work correctly ✅

#### Task 2.7: Trade-Profile Integration
- [x] **2.7.1** Implement CPI calls to Profile program
  - ✅ Added comprehensive CPI functions: update_trade_stats_cpi(), update_reputation_cpi(), can_create_trade_cpi(), update_contact_for_trade_cpi()
  - ✅ Created mock Profile program CPI module for testing and integration
  - ✅ Implemented proper lifetime management and error handling for CPI calls
  - ✅ Added TradeStatType and ReputationChange enums for CPI parameter types
  - ✅ All CPI functions properly validate trade participants and authorization
- [x] **2.7.2** Add trade count updates
  - ✅ Enhanced create_trade_with_profile_validation() to update RequestedTrades count via CPI
  - ✅ Enhanced accept_trade_with_profile_updates() to increment ActiveTrades count for both participants
  - ✅ Enhanced release_escrow_with_profile_updates() to decrement ActiveTrades and increment ReleasedTrades
  - ✅ Enhanced cancel_trade_with_profile_updates() to properly decrement ActiveTrades for cancellations
  - ✅ All trade count updates include proper validation and error handling
- [x] **2.7.3** Add reputation tracking updates
  - ✅ Implemented update_reputation_cpi() function with ReputationChange enum support
  - ✅ Enhanced release_escrow_with_profile_updates() to update reputation for TradeCompleted
  - ✅ Enhanced cancel_trade_with_profile_updates() to update reputation for TradeCanceled
  - ✅ Added support for TradeDisputed and TradeRefunded reputation changes
  - ✅ Proper validation that reputation can only be updated for completed/disputed trades
- [x] **2.7.4** Implement trade limit enforcement
  - ✅ Integrated can_create_trade_cpi() with Hub program configuration validation
  - ✅ Enhanced create_trade_with_profile_validation() to check trade limits before creation
  - ✅ Added Hub program integration for trade amount validation (min/max limits)
  - ✅ Comprehensive trade creation validation with Profile and Hub program coordination
  - ✅ Proper error handling for TradeLimitExceeded cases
- [x] **2.7.5** Add contact information management
  - ✅ Implemented update_contact_for_trade_cpi() for trade-specific contact updates
  - ✅ Enhanced trade functions to update both trade-local and Profile contact information
  - ✅ Added proper validation for contact information length and encryption requirements
  - ✅ Integrated contact information management across trade lifecycle functions
  - ✅ Proper CPI calls to Profile program for persistent contact information updates
- [x] **2.7.6** Test cross-program integration
  - ✅ Created comprehensive trade-profile-integration.test.ts with 25+ test scenarios
  - ✅ Added tests for all CPI functions and enhanced trade lifecycle functions
  - ✅ Comprehensive error handling and validation testing
  - ✅ PDA derivation and cross-program account relationship validation
  - ✅ Integration workflow testing covering complete trade lifecycle with profile updates
  - ✅ All programs successfully build and deploy with CPI integration

**Deliverable**: Integrated Trade-Profile functionality ✅
**Acceptance Criteria**: Trade operations correctly update profile statistics ✅

## Phase 3: Advanced Features

### Arbitration System

#### Task 3.1: Arbitrator Management
- [ ] **3.1.1** Define Arbitrator account structure
- [ ] **3.1.2** Implement register_arbitrator instruction
- [ ] **3.1.3** Implement remove_arbitrator instruction
- [ ] **3.1.4** Add arbitrator validation logic
- [ ] **3.1.5** Implement arbitrator selection algorithm
- [ ] **3.1.6** Add arbitrator reputation tracking

**Deliverable**: Arbitrator management system
**Acceptance Criteria**: Can register, manage, and select arbitrators

#### Task 3.2: Dispute Resolution
- [ ] **3.2.1** Implement dispute_trade instruction
- [ ] **3.2.2** Implement settle_dispute instruction
- [ ] **3.2.3** Add dispute validation logic
- [ ] **3.2.4** Implement dispute timer enforcement
- [ ] **3.2.5** Add encrypted communication handling
- [ ] **3.2.6** Implement dispute fee distribution

**Deliverable**: Complete dispute resolution system
**Acceptance Criteria**: Full dispute lifecycle works correctly

### Fee Distribution System

#### Task 3.3: Fee Calculation and Distribution
- [ ] **3.3.1** Implement fee calculation functions
- [ ] **3.3.2** Add burn mechanism for burn fees
- [ ] **3.3.3** Implement chain fee distribution
- [ ] **3.3.4** Add warchest fee collection
- [ ] **3.3.5** Implement arbitration fee handling
- [ ] **3.3.6** Add fee validation and constraints

**Deliverable**: Complete fee distribution system
**Acceptance Criteria**: All fees are calculated and distributed correctly

### Cross-Program Integration

#### Task 3.4: Hub-Program Integration
- [ ] **3.4.1** Implement hub registration in all programs
- [ ] **3.4.2** Add configuration queries from hub
- [ ] **3.4.3** Implement parameter validation using hub config
- [ ] **3.4.4** Add hub authority validation
- [ ] **3.4.5** Test all cross-program calls

**Deliverable**: Fully integrated program ecosystem
**Acceptance Criteria**: All programs work together seamlessly

#### Task 3.5: Price Integration
- [ ] **3.5.1** Integrate price queries in trade creation
- [ ] **3.5.2** Implement price locking mechanism
- [ ] **3.5.3** Add price validation in offers
- [ ] **3.5.4** Implement USD conversion for limits
- [ ] **3.5.5** Add price staleness validation
- [ ] **3.5.6** Test price integration scenarios

**Deliverable**: Complete price integration
**Acceptance Criteria**: All price-dependent operations work correctly

## Phase 4: Testing and Quality Assurance

### Comprehensive Testing

#### Task 4.1: Integration Testing
- [ ] **4.1.1** Test complete offer creation and management flow
- [ ] **4.1.2** Test complete trade execution flow
- [ ] **4.1.3** Test dispute resolution flow
- [ ] **4.1.4** Test fee distribution mechanisms
- [ ] **4.1.5** Test cross-program interactions
- [ ] **4.1.6** Test error handling and edge cases

**Deliverable**: Integration test suite
**Acceptance Criteria**: All integration scenarios work correctly


### Deployment and Launch

#### Task 5.3: Testnet Deployment
- [ ] **5.3.1** Deploy all programs to localnet
- [ ] **5.3.2** Initialize protocol configuration
- [ ] **5.3.3** Test all functionality on localnet
- [ ] **5.3.4** Conduct user acceptance testing
- [ ] **5.3.5** Fix any deployment issues

**Deliverable**: Testnet deployment
**Acceptance Criteria**: Protocol fully functional on testnet

## Frontend Integration Tasks

### Task 6.1: SDK Development
- [ ] **6.1.1** Create TypeScript SDK for all programs
- [ ] **6.1.2** Implement wallet integration
- [ ] **6.1.3** Add transaction building utilities
- [ ] **6.1.4** Create account fetching utilities
- [ ] **6.1.5** Add error handling and retry logic
- [ ] **6.1.6** Write SDK documentation

## Success Metrics and Validation

### Key Performance Indicators (KPIs)
- [ ] **Migration Completeness**: 100% of data migrated successfully
- [ ] **Functionality Parity**: All CosmWasm features available on Solana
- [ ] **User Experience**: User workflows maintain or improve usability
