use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

pub mod bounded_string;
pub mod circular_buffer;
pub mod cpi_security;
pub mod events;
pub mod pagination;
pub mod rate_limiter;
pub mod reallocation;
pub mod rent_management;
pub mod safe_math;
pub mod small_vec;
pub mod state_history;

pub use bounded_string::BoundedString;
pub use circular_buffer::BoundedStateHistory;
pub use cpi_security::{
    get_system_protected_accounts, validate_no_reentrancy, validate_protected_accounts,
    validate_token_2022_program, validate_token_interface_program, validate_token_program,
    SharedError, ValidatedCpiContext,
};
pub use events::*;
pub use pagination::{ArbitratorPage, ArbitratorPool};
pub use rate_limiter::{ActionType, RateLimiter};
pub use rent_management::{
    calculate_rent_exemption, calculate_rent_with_margin, resize_account_safely,
    validate_account_health, validate_rent_exemption, RentError, RentValidation,
};
pub use safe_math::{ArithmeticError, PercentageCalculator, SafeMath};
pub use reallocation::{Reallocatable, ReallocContext, ReallocStats};
pub use small_vec::{SmallVec, SmallArbitratorList, SupportedTokens, TokenInfo};
pub use state_history::{
    StateHistory, StateHistoryEntry, StateChangeReason, 
    AuditTrail, AuditEntry
};

#[error_code]
pub enum SharedTypeError {
    #[msg("Invalid fiat currency value")]
    InvalidFiatCurrency,
    #[msg("String exceeds maximum length")]
    StringTooLong,
    #[msg("Collection is full")]
    CollectionFull,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Page is full")]
    PageFull,
    #[msg("Invalid page number")]
    InvalidPageNumber,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Hash, Debug)]
pub enum FiatCurrency {
    Usd,
    Eur,
    Gbp,
    Cad,
    Aud,
    Jpy,
    Brl,
    Mxn,
    Ars,
    Clp,
    Cop,
    Ngn,
    Thb,
    Ves,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub struct TradeStateItem {
    pub actor: Pubkey,
    pub state: TradeState,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
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
    DisputeOpened,
    DisputeResolved,
    Released,
    SettledForMaker,
    SettledForTaker,
    Refunded,
}

impl Default for TradeState {
    fn default() -> Self {
        TradeState::RequestCreated
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum OfferState {
    Active,
    Paused,
    Archive,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum OfferType {
    Buy,
    Sell,
}

// Helper conversions for backwards compatibility
impl FiatCurrency {
    pub fn to_seed_bytes(&self) -> &[u8] {
        match self {
            FiatCurrency::Usd => b"USD",
            FiatCurrency::Eur => b"EUR",
            FiatCurrency::Gbp => b"GBP",
            FiatCurrency::Cad => b"CAD",
            FiatCurrency::Aud => b"AUD",
            FiatCurrency::Jpy => b"JPY",
            FiatCurrency::Brl => b"BRL",
            FiatCurrency::Mxn => b"MXN",
            FiatCurrency::Ars => b"ARS",
            FiatCurrency::Clp => b"CLP",
            FiatCurrency::Cop => b"COP",
            FiatCurrency::Ngn => b"NGN",
            FiatCurrency::Thb => b"THB",
            FiatCurrency::Ves => b"VES",
        }
    }
}

// For migration compatibility
impl TryFrom<u8> for FiatCurrency {
    type Error = anchor_lang::error::Error;

    fn try_from(value: u8) -> Result<Self> {
        match value {
            0 => Ok(FiatCurrency::Usd),
            1 => Ok(FiatCurrency::Eur),
            2 => Ok(FiatCurrency::Gbp),
            3 => Ok(FiatCurrency::Cad),
            4 => Ok(FiatCurrency::Aud),
            5 => Ok(FiatCurrency::Jpy),
            6 => Ok(FiatCurrency::Brl),
            7 => Ok(FiatCurrency::Mxn),
            8 => Ok(FiatCurrency::Ars),
            9 => Ok(FiatCurrency::Clp),
            10 => Ok(FiatCurrency::Cop),
            11 => Ok(FiatCurrency::Ngn),
            12 => Ok(FiatCurrency::Thb),
            13 => Ok(FiatCurrency::Ves),
            _ => Err(SharedTypeError::InvalidFiatCurrency.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fiat_currency_serialization() {
        let currency = FiatCurrency::Usd;
        let serialized = currency.try_to_vec().unwrap();
        let deserialized: FiatCurrency = FiatCurrency::try_from_slice(&serialized).unwrap();
        assert_eq!(currency, deserialized);
    }

    #[test]
    fn test_seed_bytes() {
        assert_eq!(FiatCurrency::Usd.to_seed_bytes(), b"USD");
        assert_eq!(FiatCurrency::Eur.to_seed_bytes(), b"EUR");
        assert_eq!(FiatCurrency::Ves.to_seed_bytes(), b"VES");
    }

    #[test]
    fn test_conversion_from_u8() {
        assert_eq!(FiatCurrency::try_from(0).unwrap(), FiatCurrency::Usd);
        assert_eq!(FiatCurrency::try_from(13).unwrap(), FiatCurrency::Ves);
        assert!(FiatCurrency::try_from(14).is_err());
    }
}
