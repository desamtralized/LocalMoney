/// Protocol Constants
/// Maximum platform fee percentage (10%)
pub const MAX_PLATFORM_FEE_BPS: u16 = 1000; // 10% in basis points

/// Maximum trade expiration timer (2 days)
pub const MAX_TRADE_EXPIRATION_SECONDS: u64 = 172_800; // 2 days

/// Maximum dispute timer (1 day)
pub const MAX_DISPUTE_TIMER_SECONDS: u64 = 86_400; // 1 day

/// Maximum offer description length
pub const MAX_DESCRIPTION_LENGTH: usize = 140;

/// Default pagination limits
pub const MIN_PAGE_SIZE: u8 = 1;
pub const MAX_PAGE_SIZE: u8 = 30;

/// Default active limits
pub const DEFAULT_ACTIVE_OFFERS_LIMIT: u8 = 10;
pub const DEFAULT_ACTIVE_TRADES_LIMIT: u8 = 5;

/// PDA Seeds
pub const CONFIG_SEED: &[u8] = b"config";
pub const OFFER_SEED: &[u8] = b"offer";
pub const OFFER_COUNTER_SEED: &[u8] = b"offer_counter";
pub const TRADE_SEED: &[u8] = b"trade";
pub const TRADE_COUNTER_SEED: &[u8] = b"trade_counter";
pub const PROFILE_SEED: &[u8] = b"profile";
pub const CURRENCY_PRICE_SEED: &[u8] = b"currency_price";
pub const PRICE_ROUTE_SEED: &[u8] = b"price_route";
pub const ESCROW_SEED: &[u8] = b"escrow";

/// Scaling factors for price calculations
pub const PRICE_SCALE: u64 = 1_000_000; // 6 decimal places
pub const RATE_SCALE: u64 = 10_000; // 4 decimal places (basis points)

/// Fee distribution constraints
pub const MIN_FEE_BPS: u16 = 0;
pub const MAX_INDIVIDUAL_FEE_BPS: u16 = 500; // 5% max for any single fee

/// Time constants
pub const SECONDS_PER_DAY: u64 = 86_400;
pub const SECONDS_PER_HOUR: u64 = 3_600;
pub const SECONDS_PER_MINUTE: u64 = 60;

/// Account size constants (for rent calculation)
pub const GLOBAL_CONFIG_SIZE: usize =
    8 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 1 + 1 + 2 + 2 + 2 + 2 + 8 + 8 + 8 + 8 + 1; // ~300 bytes
pub const OFFER_SIZE: usize = 8 + 8 + 32 + 1 + 1 + 8 + 8 + 8 + 4 + 140 + 32 + 1 + 8 + 1; // ~350 bytes
pub const TRADE_SIZE: usize =
    8 + 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 32 + 8 + 1 + 8 + 32 + 4 + 200 + 1 + 1; // ~500 bytes base + state history
pub const PROFILE_SIZE: usize = 8 + 32 + 8 + 8 + 1 + 8 + 8 + 4 + 200 + 4 + 200 + 1 + 1; // ~400 bytes
pub const CURRENCY_PRICE_SIZE: usize = 8 + 1 + 8 + 8 + 1; // ~30 bytes
pub const PRICE_ROUTE_SIZE: usize = 8 + 32 + 4 + 100 + 1; // ~150 bytes (assuming max 10 route steps)
