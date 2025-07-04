pub mod constants;
pub mod currencies;
pub mod errors;

pub use constants::*;
pub use currencies::*;
pub use errors::ErrorCode as LocalMoneyErrorCode;

use anchor_lang::prelude::*;

// Re-export commonly used types
pub use anchor_lang::{
    prelude::{Clock, Pubkey},
    Result,
};

/// Offer Types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum OfferType {
    Buy,
    Sell,
}

impl std::fmt::Display for OfferType {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            OfferType::Buy => write!(f, "Buy"),
            OfferType::Sell => write!(f, "Sell"),
        }
    }
}

/// Offer States
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum OfferState {
    Active,
    Paused,
    Archive,
}

impl std::fmt::Display for OfferState {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            OfferState::Active => write!(f, "Active"),
            OfferState::Paused => write!(f, "Paused"),
            OfferState::Archive => write!(f, "Archive"),
        }
    }
}

/// Trade States - 12 states as per specification
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum TradeState {
    RequestCreated,
    RequestCanceled,
    RequestExpired,
    RequestAccepted,
    EscrowFunded,
    EscrowCanceled,
    EscrowRefunded,
    FiatDeposited,
    EscrowReleased,
    EscrowDisputed,
    SettledForMaker,
    SettledForTaker,
}

impl std::fmt::Display for TradeState {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            TradeState::RequestCreated => write!(f, "RequestCreated"),
            TradeState::RequestCanceled => write!(f, "RequestCanceled"),
            TradeState::RequestExpired => write!(f, "RequestExpired"),
            TradeState::RequestAccepted => write!(f, "RequestAccepted"),
            TradeState::EscrowFunded => write!(f, "EscrowFunded"),
            TradeState::EscrowCanceled => write!(f, "EscrowCanceled"),
            TradeState::EscrowRefunded => write!(f, "EscrowRefunded"),
            TradeState::FiatDeposited => write!(f, "FiatDeposited"),
            TradeState::EscrowReleased => write!(f, "EscrowReleased"),
            TradeState::EscrowDisputed => write!(f, "EscrowDisputed"),
            TradeState::SettledForMaker => write!(f, "SettledForMaker"),
            TradeState::SettledForTaker => write!(f, "SettledForTaker"),
        }
    }
}

/// Trade State History Item
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct TradeStateItem {
    pub actor: Pubkey,
    pub state: TradeState,
    pub timestamp: i64,
}

/// Price Route Step for multi-step price conversion
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct RouteStep {
    pub pool: Pubkey,
    pub offer_asset: Pubkey, // Token mint
}

/// Price History Entry for tracking price changes over time
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct PriceHistoryEntry {
    pub timestamp: i64,
    pub price_usd: u64,
    pub source: Pubkey, // Oracle or price provider
    pub confidence: u64, // 0-100 confidence level
}

/// Utility functions for validation
pub fn validate_fee_percentage(fee_bps: u16) -> Result<()> {
    require!(
        fee_bps <= MAX_PLATFORM_FEE_BPS,
        LocalMoneyErrorCode::ExcessiveFees
    );
    Ok(())
}

pub fn validate_total_fees(
    chain_fee_bps: u16,
    burn_fee_bps: u16,
    warchest_fee_bps: u16,
) -> Result<()> {
    let total_fees = chain_fee_bps + burn_fee_bps + warchest_fee_bps;
    require!(
        total_fees <= MAX_PLATFORM_FEE_BPS,
        LocalMoneyErrorCode::ExcessiveFees
    );
    Ok(())
}

pub fn validate_amount_range(min_amount: u64, max_amount: u64, amount: u64) -> Result<()> {
    require!(
        amount >= min_amount && amount <= max_amount,
        LocalMoneyErrorCode::InvalidAmountRange
    );
    Ok(())
}

pub fn validate_trade_timer(timer_seconds: u64, max_seconds: u64) -> Result<()> {
    require!(
        timer_seconds <= max_seconds,
        LocalMoneyErrorCode::InvalidTimer
    );
    Ok(())
}

/// Arbitrator Status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ArbitratorStatus {
    Active,
    Inactive,
    Suspended,
}

impl std::fmt::Display for ArbitratorStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            ArbitratorStatus::Active => write!(f, "Active"),
            ArbitratorStatus::Inactive => write!(f, "Inactive"),
            ArbitratorStatus::Suspended => write!(f, "Suspended"),
        }
    }
}

impl anchor_lang::Space for ArbitratorStatus {
    const INIT_SPACE: usize = 1;
}

/// Dispute Status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum DisputeStatus {
    Open,
    UnderReview,
    Resolved,
    Expired,
}

impl std::fmt::Display for DisputeStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            DisputeStatus::Open => write!(f, "Open"),
            DisputeStatus::UnderReview => write!(f, "UnderReview"),
            DisputeStatus::Resolved => write!(f, "Resolved"),
            DisputeStatus::Expired => write!(f, "Expired"),
        }
    }
}

impl anchor_lang::Space for DisputeStatus {
    const INIT_SPACE: usize = 1;
}

/// Dispute Resolution Result
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum DisputeResolution {
    FavorBuyer,
    FavorSeller,
    Split { buyer_percentage: u8 },
}

impl std::fmt::Display for DisputeResolution {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            DisputeResolution::FavorBuyer => write!(f, "FavorBuyer"),
            DisputeResolution::FavorSeller => write!(f, "FavorSeller"),
            DisputeResolution::Split { buyer_percentage } => write!(f, "Split({}%)", buyer_percentage),
        }
    }
}

/// Program types that can be registered with the hub
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RegisteredProgramType {
    Offer,
    Trade,
    Profile,
    Price,
    Arbitration,
}

impl std::fmt::Display for RegisteredProgramType {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            RegisteredProgramType::Offer => write!(f, "Offer"),
            RegisteredProgramType::Trade => write!(f, "Trade"),
            RegisteredProgramType::Profile => write!(f, "Profile"),
            RegisteredProgramType::Price => write!(f, "Price"),
            RegisteredProgramType::Arbitration => write!(f, "Arbitration"),
        }
    }
}
