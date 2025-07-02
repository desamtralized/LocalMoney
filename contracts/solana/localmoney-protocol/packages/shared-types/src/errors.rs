use anchor_lang::prelude::*;

/// LocalMoney Protocol Error Codes
#[error_code]
pub enum ErrorCode {
    // General Errors (100-199)
    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Invalid parameter provided")]
    InvalidParameter,

    #[msg("Value is out of acceptable range")]
    ValueOutOfRange,

    #[msg("Operation not allowed in current state")]
    InvalidState,

    #[msg("Calculation overflow occurred")]
    MathOverflow,

    #[msg("Account already initialized")]
    AlreadyInitialized,

    // Hub/Configuration Errors (200-299)
    #[msg("Hub already registered")]
    HubAlreadyRegistered,

    #[msg("The sum of platform fees exceeds maximum allowed (10%)")]
    ExcessiveFees,

    #[msg("Invalid fee percentage")]
    InvalidFeePercentage,

    #[msg("Program not registered with hub")]
    ProgramNotRegistered,

    #[msg("Configuration parameter is invalid")]
    InvalidConfiguration,

    #[msg("Trading limits are invalid")]
    InvalidTradingLimits,

    // Offer Errors (300-399)
    #[msg("Minimum amount must be less than or equal to maximum amount")]
    InvalidAmountRange,

    #[msg("Offer not found")]
    OfferNotFound,

    #[msg("Invalid offer state transition")]
    InvalidOfferStateChange,

    #[msg("Offer amount is outside acceptable range")]
    InvalidOfferAmount,

    #[msg("Offer maximum amount exceeds trading limit")]
    OfferMaxAboveTradingLimit,

    #[msg("Active offers limit reached")]
    ActiveOffersLimitReached,

    #[msg("Cannot modify archived offer")]
    CannotModifyArchivedOffer,

    #[msg("Invalid rate provided")]
    InvalidRate,

    #[msg("Invalid minimum amount")]
    InvalidMinAmount,

    #[msg("Invalid maximum amount")]
    InvalidMaxAmount,

    #[msg("Description too long")]
    DescriptionTooLong,

    #[msg("Offer is not active")]
    OfferNotActive,

    #[msg("Offer cannot be updated in current state")]
    OfferNotUpdatable,

    #[msg("Offer cannot be closed in current state")]
    OfferNotClosable,

    #[msg("Invalid state transition")]
    InvalidStateTransition,

    // Trade Errors (400-499)
    #[msg("Trade not found")]
    TradeNotFound,

    #[msg("Invalid trade state transition")]
    InvalidTradeStateChange,

    #[msg("Trade has expired")]
    TradeExpired,

    #[msg("Trade amount is outside offer limits")]
    InvalidTradeAmount,

    #[msg("Invalid trade state for this operation")]
    InvalidTradeState,

    #[msg("Sender is not authorized for this trade operation")]
    InvalidTradeSender,

    #[msg("Active trades limit reached")]
    ActiveTradesLimitReached,

    #[msg("Trade cannot be refunded yet")]
    RefundNotAllowed,

    #[msg("Dispute requested too early")]
    PrematureDisputeRequest,

    #[msg("Cannot dispute in current trade state")]
    DisputeNotAllowed,

    #[msg("Trade amount below minimum limit")]
    BelowMinimumAmount,

    #[msg("Trade amount above maximum limit")]
    AboveMaximumAmount,

    // Escrow Errors (500-599)
    #[msg("Insufficient escrow balance")]
    InsufficientEscrow,

    #[msg("Escrow funding amount mismatch")]
    EscrowFundingMismatch,

    #[msg("Escrow already funded")]
    EscrowAlreadyFunded,

    #[msg("Escrow not funded")]
    EscrowNotFunded,

    #[msg("Cannot release escrow in current state")]
    EscrowReleaseNotAllowed,

    #[msg("Escrow account validation failed")]
    InvalidEscrowAccount,

    #[msg("Escrow not found")]
    EscrowNotFound,

    #[msg("Invalid escrow state for this operation")]
    InvalidEscrowState,

    #[msg("Invalid escrow state transition")]
    InvalidEscrowStateTransition,

    #[msg("Escrow has expired")]
    EscrowExpired,

    #[msg("Insufficient funds for escrow operation")]
    InsufficientFunds,

    #[msg("Invalid token account for escrow operation")]
    InvalidTokenAccount,

    // Profile Errors (600-699)
    #[msg("Profile not found")]
    ProfileNotFound,

    #[msg("Profile already exists")]
    ProfileAlreadyExists,

    #[msg("Contact information too long")]
    ContactInfoTooLong,

    #[msg("Invalid encryption key format")]
    InvalidEncryptionKey,

    #[msg("Profile statistics update failed")]
    ProfileStatsUpdateFailed,

    #[msg("Encryption key is required for encrypted contact information")]
    EncryptionKeyRequired,

    #[msg("Profile is required for this operation")]
    ProfileRequired,

    #[msg("Offer limit has been exceeded for this user")]
    OfferLimitExceeded,

    #[msg("Contact information is required for this operation")]
    ContactInfoRequired,

    #[msg("Profile validation failed for this operation")]
    ProfileValidationFailed,

    // Price Errors (700-799)
    #[msg("Price not found for currency")]
    PriceNotFound,

    #[msg("Price is stale and needs update")]
    StalePrice,

    #[msg("Invalid price value")]
    InvalidPrice,

    #[msg("Price route not found")]
    PriceRouteNotFound,

    #[msg("Price calculation failed")]
    PriceCalculationFailed,

    #[msg("Currency not supported")]
    UnsupportedCurrency,

    #[msg("Price is inactive")]
    InactivePrice,

    #[msg("Invalid price route")]
    InvalidRoute,

    #[msg("Price route is too long")]
    RouteTooLong,

    #[msg("Price route is inactive")]
    InactiveRoute,

    #[msg("Invalid price weights provided")]
    InvalidWeights,

    #[msg("Too many prices provided for aggregation")]
    TooManyPrices,

    #[msg("Oracle is inactive")]
    InactiveOracle,

    #[msg("Invalid confidence level")]
    InvalidConfidence,

    #[msg("Oracle data is stale")]
    StaleOracleData,

    #[msg("Confidence level too low")]
    LowConfidence,

    // Arbitration Errors (800-899)
    #[msg("Arbitrator not found")]
    ArbitratorNotFound,

    #[msg("Arbitrator not available")]
    ArbitratorUnavailable,

    #[msg("Invalid arbitrator assignment")]
    InvalidArbitratorAssignment,

    #[msg("Arbitration fee calculation failed")]
    ArbitrationFeeCalculationFailed,

    #[msg("Settlement amount invalid")]
    InvalidSettlementAmount,

    // Token/Transfer Errors (900-999)
    #[msg("Invalid token mint")]
    InvalidTokenMint,

    #[msg("Token transfer failed")]
    TokenTransferFailed,

    #[msg("Insufficient token balance")]
    InsufficientTokenBalance,

    #[msg("Token account not found")]
    TokenAccountNotFound,

    #[msg("Invalid token amount")]
    InvalidTokenAmount,

    // System/Runtime Errors (1000+)
    #[msg("Account creation failed")]
    AccountCreationFailed,

    #[msg("Invalid program address")]
    InvalidProgramAddress,

    #[msg("Cross-program invocation failed")]
    CpiCallFailed,

    #[msg("Invalid PDA derivation")]
    InvalidPdaDerivation,

    #[msg("Account size insufficient")]
    InsufficientAccountSize,

    #[msg("Invalid timer value")]
    InvalidTimer,

    #[msg("Operation timeout")]
    OperationTimeout,

    #[msg("Same authority provided - no change needed")]
    SameAuthority,

    #[msg("Invalid authority provided")]
    InvalidAuthority,
}

/// Error conversion utilities
impl ErrorCode {
    /// Get error category for logging and monitoring
    pub fn category(&self) -> &'static str {
        match self {
            ErrorCode::Unauthorized
            | ErrorCode::InvalidParameter
            | ErrorCode::ValueOutOfRange
            | ErrorCode::InvalidState
            | ErrorCode::MathOverflow
            | ErrorCode::AlreadyInitialized => "General",

            ErrorCode::HubAlreadyRegistered
            | ErrorCode::ExcessiveFees
            | ErrorCode::InvalidFeePercentage
            | ErrorCode::ProgramNotRegistered
            | ErrorCode::InvalidConfiguration
            | ErrorCode::InvalidTradingLimits => "Configuration",

            ErrorCode::InvalidAmountRange
            | ErrorCode::OfferNotFound
            | ErrorCode::InvalidOfferStateChange
            | ErrorCode::InvalidOfferAmount
            | ErrorCode::OfferMaxAboveTradingLimit
            | ErrorCode::ActiveOffersLimitReached
            | ErrorCode::CannotModifyArchivedOffer
            | ErrorCode::InvalidRate
            | ErrorCode::InvalidMinAmount
            | ErrorCode::InvalidMaxAmount
            | ErrorCode::DescriptionTooLong
            | ErrorCode::OfferNotActive
            | ErrorCode::OfferNotUpdatable
            | ErrorCode::OfferNotClosable
            | ErrorCode::InvalidStateTransition => "Offer",

            ErrorCode::TradeNotFound
            | ErrorCode::InvalidTradeStateChange
            | ErrorCode::TradeExpired
            | ErrorCode::InvalidTradeAmount
            | ErrorCode::InvalidTradeState
            | ErrorCode::InvalidTradeSender
            | ErrorCode::ActiveTradesLimitReached
            | ErrorCode::RefundNotAllowed
            | ErrorCode::PrematureDisputeRequest
            | ErrorCode::DisputeNotAllowed
            | ErrorCode::BelowMinimumAmount
            | ErrorCode::AboveMaximumAmount => "Trade",

            ErrorCode::InsufficientEscrow
            | ErrorCode::EscrowFundingMismatch
            | ErrorCode::EscrowAlreadyFunded
            | ErrorCode::EscrowNotFunded
            | ErrorCode::EscrowReleaseNotAllowed
            | ErrorCode::InvalidEscrowAccount
            | ErrorCode::EscrowNotFound
            | ErrorCode::InvalidEscrowState
            | ErrorCode::InvalidEscrowStateTransition
            | ErrorCode::EscrowExpired
            | ErrorCode::InsufficientFunds
            | ErrorCode::InvalidTokenAccount => "Escrow",

            ErrorCode::ProfileNotFound
            | ErrorCode::ProfileAlreadyExists
            | ErrorCode::ContactInfoTooLong
            | ErrorCode::InvalidEncryptionKey
            | ErrorCode::ProfileStatsUpdateFailed
            | ErrorCode::EncryptionKeyRequired
            | ErrorCode::ProfileRequired
            | ErrorCode::OfferLimitExceeded
            | ErrorCode::ContactInfoRequired
            | ErrorCode::ProfileValidationFailed => "Profile",

            ErrorCode::PriceNotFound
            | ErrorCode::StalePrice
            | ErrorCode::InvalidPrice
            | ErrorCode::PriceRouteNotFound
            | ErrorCode::PriceCalculationFailed
            | ErrorCode::UnsupportedCurrency
            | ErrorCode::InactivePrice
            | ErrorCode::InvalidRoute
            | ErrorCode::RouteTooLong
            | ErrorCode::InactiveRoute
            | ErrorCode::InvalidWeights
            | ErrorCode::TooManyPrices
            | ErrorCode::InactiveOracle
            | ErrorCode::InvalidConfidence
            | ErrorCode::StaleOracleData
            | ErrorCode::LowConfidence => "Price",

            ErrorCode::ArbitratorNotFound
            | ErrorCode::ArbitratorUnavailable
            | ErrorCode::InvalidArbitratorAssignment
            | ErrorCode::ArbitrationFeeCalculationFailed
            | ErrorCode::InvalidSettlementAmount => "Arbitration",

            ErrorCode::InvalidTokenMint
            | ErrorCode::TokenTransferFailed
            | ErrorCode::InsufficientTokenBalance
            | ErrorCode::TokenAccountNotFound
            | ErrorCode::InvalidTokenAmount => "Token",

            ErrorCode::AccountCreationFailed
            | ErrorCode::InvalidProgramAddress
            | ErrorCode::CpiCallFailed
            | ErrorCode::InvalidPdaDerivation
            | ErrorCode::InsufficientAccountSize
            | ErrorCode::InvalidTimer
            | ErrorCode::OperationTimeout
            | ErrorCode::SameAuthority
            | ErrorCode::InvalidAuthority => "System",
        }
    }

    /// Check if error is recoverable
    pub fn is_recoverable(&self) -> bool {
        matches!(
            self,
            ErrorCode::StalePrice
                | ErrorCode::ArbitratorUnavailable
                | ErrorCode::OperationTimeout
                | ErrorCode::InsufficientTokenBalance
        )
    }
}
