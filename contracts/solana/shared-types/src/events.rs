use anchor_lang::prelude::*;

// Base trait for consistency
pub trait LocalMoneyEvent {
    fn event_type(&self) -> &'static str;
    fn timestamp(&self) -> i64;
    fn version(&self) -> u8 {
        1
    }
}

// Trade events
#[event]
pub struct TradeCreatedEvent {
    pub trade_id: u64,
    pub offer_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub fiat_currency: String,
    pub locked_price: u64,
    pub timestamp: i64,
    pub buyer_index: Pubkey,
    pub seller_index: Pubkey,
}

impl LocalMoneyEvent for TradeCreatedEvent {
    fn event_type(&self) -> &'static str {
        "trade_created"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct EscrowFundedEvent {
    pub trade_id: u64,
    pub seller: Pubkey,
    pub amount: u64,
    pub escrow_account: Pubkey,
    pub timestamp: i64,
    pub trade_index: u64,
}

impl LocalMoneyEvent for EscrowFundedEvent {
    fn event_type(&self) -> &'static str {
        "escrow_funded"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct FeeDistributionEvent {
    pub trade_id: u64,
    pub total_amount: u64,
    pub treasury_fee: u64,
    pub chain_fee: u64,
    pub warchest_fee: u64,
    pub burn_amount: u64,
    pub net_to_recipient: u64,
    pub timestamp: i64,
}

impl LocalMoneyEvent for FeeDistributionEvent {
    fn event_type(&self) -> &'static str {
        "fee_distribution"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct TradeCompletedEvent {
    pub trade_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub final_amount: u64,
    pub fees_collected: u64,
    pub completion_type: String,
    pub timestamp: i64,
    pub trade_index: u64,
}

impl LocalMoneyEvent for TradeCompletedEvent {
    fn event_type(&self) -> &'static str {
        "trade_completed"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct TradeStateChangeEvent {
    pub trade_id: u64,
    pub old_state: String,
    pub new_state: String,
    pub actor: Pubkey,
    pub timestamp: i64,
    pub trade_index: u64,
}

impl LocalMoneyEvent for TradeStateChangeEvent {
    fn event_type(&self) -> &'static str {
        "trade_state_change"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct DisputeResolvedEvent {
    pub trade_id: u64,
    pub arbitrator: Pubkey,
    pub winner: Pubkey,
    pub resolution_reason: String,
    pub fee_to_arbitrator: u64,
    pub timestamp: i64,
    pub arbitrator_index: Pubkey,
}

impl LocalMoneyEvent for DisputeResolvedEvent {
    fn event_type(&self) -> &'static str {
        "dispute_resolved"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

// Profile events
#[event]
pub struct ProfileCreatedEvent {
    pub user: Pubkey,
    pub username: String,
    pub timestamp: i64,
    pub user_index: Pubkey,
}

impl LocalMoneyEvent for ProfileCreatedEvent {
    fn event_type(&self) -> &'static str {
        "profile_created"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct ProfileUpdatedEvent {
    pub user: Pubkey,
    pub field: String,
    pub old_value: String,
    pub new_value: String,
    pub timestamp: i64,
    pub user_index: Pubkey,
}

impl LocalMoneyEvent for ProfileUpdatedEvent {
    fn event_type(&self) -> &'static str {
        "profile_updated"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct ReputationUpdatedEvent {
    pub user: Pubkey,
    pub trade_id: u64,
    pub reputation_change: i16,
    pub new_reputation: u32,
    pub timestamp: i64,
    pub user_index: Pubkey,
}

impl LocalMoneyEvent for ReputationUpdatedEvent {
    fn event_type(&self) -> &'static str {
        "reputation_updated"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

// Offer events
#[event]
pub struct OfferCreatedEvent {
    pub offer_id: u64,
    pub owner: Pubkey,
    pub offer_type: String,
    pub token_mint: Pubkey,
    pub fiat_currency: String,
    pub min_amount: u64,
    pub max_amount: u64,
    pub rate: u64,
    pub timestamp: i64,
    pub owner_index: Pubkey,
}

impl LocalMoneyEvent for OfferCreatedEvent {
    fn event_type(&self) -> &'static str {
        "offer_created"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct OfferUpdatedEvent {
    pub offer_id: u64,
    pub owner: Pubkey,
    pub field: String,
    pub old_value: String,
    pub new_value: String,
    pub timestamp: i64,
    pub owner_index: Pubkey,
}

impl LocalMoneyEvent for OfferUpdatedEvent {
    fn event_type(&self) -> &'static str {
        "offer_updated"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct OfferStateChangeEvent {
    pub offer_id: u64,
    pub owner: Pubkey,
    pub old_state: String,
    pub new_state: String,
    pub reason: String,
    pub timestamp: i64,
    pub owner_index: Pubkey,
}

impl LocalMoneyEvent for OfferStateChangeEvent {
    fn event_type(&self) -> &'static str {
        "offer_state_change"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

// Hub events
#[event]
pub struct ConfigUpdateEvent {
    pub updater: Pubkey,
    pub config_type: String,
    pub old_value: String,
    pub new_value: String,
    pub timestamp: i64,
}

impl LocalMoneyEvent for ConfigUpdateEvent {
    fn event_type(&self) -> &'static str {
        "config_update"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct ProgramRegisteredEvent {
    pub program_id: Pubkey,
    pub program_type: String,
    pub registered_by: Pubkey,
    pub timestamp: i64,
}

impl LocalMoneyEvent for ProgramRegisteredEvent {
    fn event_type(&self) -> &'static str {
        "program_registered"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

// Price events
#[event]
pub struct PriceUpdatedEvent {
    pub token_mint: Pubkey,
    pub fiat_currency: String,
    pub old_price: u64,
    pub new_price: u64,
    pub oracle: Pubkey,
    pub timestamp: i64,
    pub token_index: Pubkey,
}

impl LocalMoneyEvent for PriceUpdatedEvent {
    fn event_type(&self) -> &'static str {
        "price_updated"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct PriceValidationEvent {
    pub token_mint: Pubkey,
    pub fiat_currency: String,
    pub price: u64,
    pub is_valid: bool,
    pub validation_reason: String,
    pub timestamp: i64,
}

impl LocalMoneyEvent for PriceValidationEvent {
    fn event_type(&self) -> &'static str {
        "price_validation"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

// Security events
#[event]
pub struct SecurityAlertEvent {
    pub alert_type: String,
    pub severity: u8, // 1-5 scale
    pub actor: Pubkey,
    pub details: String,
    pub timestamp: i64,
    pub alert_index: String,
}

impl LocalMoneyEvent for SecurityAlertEvent {
    fn event_type(&self) -> &'static str {
        "security_alert"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct SuspiciousActivityEvent {
    pub activity_type: String,
    pub actor: Pubkey,
    pub details: String,
    pub risk_score: u8, // 1-10 scale
    pub auto_blocked: bool,
    pub timestamp: i64,
    pub actor_index: Pubkey,
}

impl LocalMoneyEvent for SuspiciousActivityEvent {
    fn event_type(&self) -> &'static str {
        "suspicious_activity"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

// Circuit breaker events
#[event]
pub struct CircuitBreakerEvent {
    pub action: String, // "pause", "resume", "triggered"
    pub scope: String,  // "trading", "offers", "global"
    pub triggered_by: Pubkey,
    pub reason: String,
    pub auto_resume_at: Option<i64>,
    pub timestamp: i64,
}

impl LocalMoneyEvent for CircuitBreakerEvent {
    fn event_type(&self) -> &'static str {
        "circuit_breaker"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct SystemHealthEvent {
    pub component: String,
    pub status: String, // "healthy", "degraded", "critical"
    pub metrics: String, // JSON string of metrics
    pub timestamp: i64,
}

impl LocalMoneyEvent for SystemHealthEvent {
    fn event_type(&self) -> &'static str {
        "system_health"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

// Account lifecycle events
#[event]
pub struct TradeClosedEvent {
    pub trade_id: u64,
    pub rent_reclaimed: u64,
    pub collector: Pubkey,
    pub timestamp: i64,
}

impl LocalMoneyEvent for TradeClosedEvent {
    fn event_type(&self) -> &'static str {
        "trade_closed"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

// Arbitration events
#[event]
pub struct ArbitratorAssignedEvent {
    pub trade_id: u64,
    pub arbitrator: Pubkey,
    pub assignment_type: String, // "random", "manual", "vrf"
    pub timestamp: i64,
    pub arbitrator_index: Pubkey,
}

impl LocalMoneyEvent for ArbitratorAssignedEvent {
    fn event_type(&self) -> &'static str {
        "arbitrator_assigned"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}

#[event]
pub struct DisputeEscalatedEvent {
    pub trade_id: u64,
    pub escalated_by: Pubkey,
    pub reason: String,
    pub escalation_level: u8,
    pub timestamp: i64,
    pub trade_index: u64,
}

impl LocalMoneyEvent for DisputeEscalatedEvent {
    fn event_type(&self) -> &'static str {
        "dispute_escalated"
    }
    fn timestamp(&self) -> i64 {
        self.timestamp
    }
}