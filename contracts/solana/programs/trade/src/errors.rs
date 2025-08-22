use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // Trade Creation Errors (6000-6099)
    #[msg("Trade amount below minimum limit")]
    TradeBelowMinimum,
    
    #[msg("Trade amount exceeds maximum limit")]
    TradeAboveMaximum,
    
    #[msg("Invalid trade amount")]
    InvalidTradeAmount,
    
    #[msg("Invalid locked price")]
    InvalidLockedPrice,
    
    #[msg("Cannot trade with yourself")]
    SelfTradeNotAllowed,
    
    #[msg("Trade has expired")]
    TradeExpired,
    
    #[msg("Invalid parameter")]
    InvalidParameter,
    
    // State Transition Errors (6100-6199)
    #[msg("Invalid state transition")]
    InvalidStateTransition,
    
    #[msg("Invalid trade state")]
    InvalidTradeState,
    
    #[msg("Dispute window not open")]
    DisputeWindowNotOpen,
    
    #[msg("Premature dispute request")]
    PrematureDisputeRequest,
    
    #[msg("Refund not allowed")]
    RefundNotAllowed,
    
    #[msg("Refund too early")]
    RefundTooEarly,
    
    // Authorization Errors (6200-6299)
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("Invalid winner")]
    InvalidWinner,
    
    #[msg("Invalid arbitrator")]
    InvalidArbitrator,
    
    #[msg("Invalid arbitrator assignment")]
    InvalidArbitratorAssignment,
    
    // Arbitrator Pool Errors (6300-6399)
    #[msg("Arbitrator already exists")]
    ArbitratorAlreadyExists,
    
    #[msg("Arbitrator pool is full")]
    ArbitratorPoolFull,
    
    #[msg("No arbitrators available")]
    NoArbitratorsAvailable,
    
    #[msg("No eligible arbitrators available")]
    NoEligibleArbitrators,
    
    // Arithmetic Errors (6400-6499)
    #[msg("Arithmetic error")]
    ArithmeticError,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    
    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,
    
    #[msg("Division by zero")]
    DivisionByZero,
    
    // Fee Management Errors (6500-6599)
    #[msg("Excessive fees")]
    ExcessiveFees,
    
    #[msg("Excessive burn fee")]
    ExcessiveBurnFee,
    
    #[msg("Excessive chain fee")]
    ExcessiveChainFee,
    
    #[msg("Excessive warchest fee")]
    ExcessiveWarchestFee,
    
    #[msg("Excessive conversion fee")]
    ExcessiveConversionFee,
    
    #[msg("Excessive arbitration fees")]
    ExcessiveArbitrationFees,
    
    #[msg("Excessive arbitrator fee")]
    ExcessiveArbitratorFee,
    
    #[msg("Invalid fee calculation method")]
    InvalidFeeCalculationMethod,
    
    // Token Conversion Errors (6600-6699)
    #[msg("Token conversion failed")]
    TokenConversionFailed,
    
    #[msg("Slippage exceeded maximum")]
    SlippageExceeded,
    
    #[msg("Insufficient conversion amount")]
    InsufficientConversionAmount,
    
    #[msg("Invalid conversion route")]
    InvalidConversionRoute,
    
    #[msg("Conversion route too complex")]
    ConversionRouteTooComplex,
    
    #[msg("LOCAL token conversion required")]
    LocalTokenConversionRequired,
    
    #[msg("Token burn failed")]
    TokenBurnFailed,
    
    // DEX Integration Errors (6700-6799)
    #[msg("DEX operation failed")]
    DexOperationFailed,
    
    #[msg("Invalid DEX program")]
    InvalidDexProgram,
    
    #[msg("Pool not found")]
    PoolNotFound,
    
    // Account Validation Errors (6800-6899)
    #[msg("Invalid account")]
    InvalidAccount,
    
    #[msg("Invalid token account - does not match expected ATA")]
    InvalidTokenAccount,
    
    #[msg("Invalid account owner")]
    InvalidAccountOwner,
    
    #[msg("Invalid PDA - does not match expected derivation")]
    InvalidPDA,
    
    #[msg("Invalid program account")]
    InvalidProgramAccount,
    
    #[msg("Invalid treasury address")]
    InvalidTreasuryAddress,
    
    #[msg("Invalid chain fee collector")]
    InvalidChainFeeCollector,
    
    #[msg("Invalid warchest address")]
    InvalidWarchestAddress,
    
    // CPI Security Errors (6900-6999)
    #[msg("Unauthorized CPI call")]
    UnauthorizedCpiCall,
    
    #[msg("Invalid CPI data")]
    InvalidCpiData,
    
    #[msg("Invalid CPI program")]
    InvalidCpiProgram,
    
    #[msg("Protected account cannot be modified")]
    ProtectedAccount,
    
    // Data Structure Errors (7000-7099)
    #[msg("String exceeds maximum length")]
    StringTooLong,
    
    #[msg("Collection is full")]
    CollectionFull,
    
    #[msg("Page is full")]
    PageFull,
    
    #[msg("Invalid page number")]
    InvalidPageNumber,
    
    // VRF Errors (7100-7199)
    #[msg("No randomness available from VRF")]
    NoRandomnessAvailable,
    
    #[msg("VRF request failed")]
    VrfRequestFailed,
    
    #[msg("Invalid reveal in commit-reveal scheme")]
    InvalidReveal,
    
    #[msg("Not in reveal phase")]
    NotInRevealPhase,
    
    #[msg("Commitment not found")]
    NoCommitmentFound,
    
    #[msg("Already committed randomness")]
    AlreadyCommitted,
    
    #[msg("Commit phase has ended")]
    CommitPhaseEnded,
    
    // Security Errors (7200-7299)
    #[msg("Insufficient rent exemption with safety margin")]
    InsufficientRentExemption,
    
    #[msg("Reentrancy detected")]
    ReentrancyDetected,
    
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    
    // Account Lifecycle Errors (7300-7399)
    #[msg("Cannot close active trade")]
    CannotCloseActiveTrade,
    
    #[msg("Grace period not expired")]
    GracePeriodNotExpired,
    
    #[msg("Unauthorized rent collector")]
    UnauthorizedRentCollector,
    
    #[msg("Account reallocation failed")]
    AccountReallocationFailed,
    
    #[msg("Account too large")]
    AccountTooLarge,
}