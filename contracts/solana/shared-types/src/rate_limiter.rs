use anchor_lang::prelude::*;
use super::SharedTypeError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ActionType {
    CreateTrade = 0,
    AcceptTrade = 1,
    FundEscrow = 2,
    ReleaseFunds = 3,
    OpenDispute = 4,
    CreateOffer = 5,
    UpdateOffer = 6,
    CancelTrade = 7,
    RefundEscrow = 8,
    UpdateProfile = 9,
}

impl ActionType {
    pub fn as_index(&self) -> usize {
        *self as usize
    }
}

#[account]
pub struct RateLimiter {
    pub user: Pubkey,
    pub action_counts: [u32; 10],     // Different action types
    pub window_start: i64,            // Current time window (unix timestamp)
    pub daily_limits: [u32; 10],      // Max actions per day
    pub bump: u8,
}

impl RateLimiter {
    pub const SPACE: usize = 8 + // discriminator
        32 + // user
        (4 * 10) + // action_counts
        8 + // window_start
        (4 * 10) + // daily_limits
        1; // bump
    
    pub const DEFAULT_LIMITS: [u32; 10] = [
        50,  // CreateTrade
        100, // AcceptTrade
        50,  // FundEscrow
        50,  // ReleaseFunds
        10,  // OpenDispute
        20,  // CreateOffer
        50,  // UpdateOffer
        50,  // CancelTrade
        50,  // RefundEscrow
        100, // UpdateProfile
    ];
    
    pub fn new(user: Pubkey, bump: u8) -> Self {
        Self {
            user,
            action_counts: [0; 10],
            window_start: 0,
            daily_limits: Self::DEFAULT_LIMITS,
            bump,
        }
    }
    
    pub fn check_and_increment(&mut self, action: ActionType, clock: &Clock) -> Result<()> {
        let current_window = clock.unix_timestamp / 86400; // Daily windows
        
        // Reset counters if new day
        if current_window != self.window_start {
            self.action_counts = [0; 10];
            self.window_start = current_window;
        }
        
        let action_idx = action.as_index();
        require!(
            self.action_counts[action_idx] < self.daily_limits[action_idx],
            SharedTypeError::RateLimitExceeded
        );
        
        self.action_counts[action_idx] += 1;
        Ok(())
    }
    
    pub fn check_limit(&self, action: ActionType, clock: &Clock) -> Result<()> {
        let current_window = clock.unix_timestamp / 86400;
        
        // If it's a new day, the limit is not exceeded
        if current_window != self.window_start {
            return Ok(());
        }
        
        let action_idx = action.as_index();
        require!(
            self.action_counts[action_idx] < self.daily_limits[action_idx],
            SharedTypeError::RateLimitExceeded
        );
        
        Ok(())
    }
    
    pub fn get_remaining(&self, action: ActionType, clock: &Clock) -> u32 {
        let current_window = clock.unix_timestamp / 86400;
        
        // If it's a new day, return full limit
        if current_window != self.window_start {
            return self.daily_limits[action.as_index()];
        }
        
        let action_idx = action.as_index();
        self.daily_limits[action_idx].saturating_sub(self.action_counts[action_idx])
    }
    
    pub fn set_limit(&mut self, action: ActionType, limit: u32) {
        self.daily_limits[action.as_index()] = limit;
    }
    
    pub fn reset(&mut self, clock: &Clock) {
        self.action_counts = [0; 10];
        self.window_start = clock.unix_timestamp / 86400;
    }
}

// Helper function to create rate limiter PDA
pub fn get_rate_limiter_pda(user: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"rate_limiter", user.as_ref()],
        program_id
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_clock(unix_timestamp: i64) -> Clock {
        Clock {
            slot: 0,
            epoch_start_timestamp: 0,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp,
        }
    }

    #[test]
    fn test_rate_limiter_basic() {
        let user = Pubkey::new_unique();
        let mut limiter = RateLimiter::new(user, 0);
        let clock = mock_clock(86400); // Day 1
        
        // Check initial state
        assert_eq!(limiter.get_remaining(ActionType::CreateTrade, &clock), 50);
        
        // Increment counter
        limiter.check_and_increment(ActionType::CreateTrade, &clock).unwrap();
        assert_eq!(limiter.action_counts[0], 1);
        assert_eq!(limiter.get_remaining(ActionType::CreateTrade, &clock), 49);
    }
    
    #[test]
    fn test_rate_limiter_daily_reset() {
        let user = Pubkey::new_unique();
        let mut limiter = RateLimiter::new(user, 0);
        let clock_day1 = mock_clock(86400); // Day 1
        let clock_day2 = mock_clock(86400 * 2); // Day 2
        
        // Use up some actions on day 1
        for _ in 0..10 {
            limiter.check_and_increment(ActionType::CreateTrade, &clock_day1).unwrap();
        }
        assert_eq!(limiter.action_counts[0], 10);
        
        // Check that it resets on day 2
        limiter.check_and_increment(ActionType::CreateTrade, &clock_day2).unwrap();
        assert_eq!(limiter.action_counts[0], 1);
        assert_eq!(limiter.window_start, 2);
    }
    
    #[test]
    fn test_rate_limiter_exceeded() {
        let user = Pubkey::new_unique();
        let mut limiter = RateLimiter::new(user, 0);
        let clock = mock_clock(86400);
        
        // Set a low limit for testing
        limiter.set_limit(ActionType::OpenDispute, 2);
        
        // Use up the limit
        limiter.check_and_increment(ActionType::OpenDispute, &clock).unwrap();
        limiter.check_and_increment(ActionType::OpenDispute, &clock).unwrap();
        
        // Should fail on the third attempt
        let result = limiter.check_and_increment(ActionType::OpenDispute, &clock);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_different_action_types() {
        let user = Pubkey::new_unique();
        let mut limiter = RateLimiter::new(user, 0);
        let clock = mock_clock(86400);
        
        // Different actions have independent counters
        limiter.check_and_increment(ActionType::CreateTrade, &clock).unwrap();
        limiter.check_and_increment(ActionType::AcceptTrade, &clock).unwrap();
        limiter.check_and_increment(ActionType::OpenDispute, &clock).unwrap();
        
        assert_eq!(limiter.action_counts[0], 1); // CreateTrade
        assert_eq!(limiter.action_counts[1], 1); // AcceptTrade
        assert_eq!(limiter.action_counts[4], 1); // OpenDispute
    }
    
    #[test]
    fn test_check_without_increment() {
        let user = Pubkey::new_unique();
        let mut limiter = RateLimiter::new(user, 0);
        let clock = mock_clock(86400);
        
        limiter.set_limit(ActionType::CreateOffer, 1);
        
        // Check should pass without incrementing
        limiter.check_limit(ActionType::CreateOffer, &clock).unwrap();
        assert_eq!(limiter.action_counts[5], 0);
        
        // Actually increment
        limiter.check_and_increment(ActionType::CreateOffer, &clock).unwrap();
        assert_eq!(limiter.action_counts[5], 1);
        
        // Now check should fail
        let result = limiter.check_limit(ActionType::CreateOffer, &clock);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_manual_reset() {
        let user = Pubkey::new_unique();
        let mut limiter = RateLimiter::new(user, 0);
        let clock = mock_clock(86400);
        
        // Add some actions
        for _ in 0..5 {
            limiter.check_and_increment(ActionType::CreateTrade, &clock).unwrap();
        }
        assert_eq!(limiter.action_counts[0], 5);
        
        // Manual reset
        limiter.reset(&clock);
        assert_eq!(limiter.action_counts[0], 0);
        assert_eq!(limiter.window_start, 1);
    }
    
    #[test]
    fn test_space_calculation() {
        assert_eq!(RateLimiter::SPACE, 8 + 32 + 40 + 8 + 40 + 1);
        assert_eq!(RateLimiter::SPACE, 129);
    }
}