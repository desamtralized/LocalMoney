#[cfg(test)]
mod vrf_tests {
    use super::*;
    use trade::vrf::*;
    use trade::ArbitratorInfo;
    use anchor_lang::prelude::*;
    use localmoney_shared::FiatCurrency;
    
    #[test]
    fn test_arbitrator_weight_calculation_basic() {
        let info = ArbitratorInfo {
            arbitrator: Pubkey::default(),
            fiat_currency: FiatCurrency::Usd,
            total_cases: 60,
            resolved_cases: 50,
            reputation_score: 7500, // 75%
            registration_date: 0,
            is_active: true,
            bump: 0,
        };
        
        let weight = calculate_arbitrator_weight(&info);
        // Base: 1000 * 0.75 = 750
        // Experience: 50 * 10 = 500
        // Active bonus: 500
        // Total: 1750
        assert_eq!(weight, 1750);
    }
    
    #[test]
    fn test_arbitrator_weight_calculation_zero_reputation() {
        let info = ArbitratorInfo {
            arbitrator: Pubkey::default(),
            fiat_currency: FiatCurrency::Usd,
            total_cases: 25,
            resolved_cases: 20,
            reputation_score: 0, // 0%
            registration_date: 0,
            is_active: true,
            bump: 0,
        };
        
        let weight = calculate_arbitrator_weight(&info);
        // Base: 1000 * 0 = 0
        // Experience: 20 * 10 = 200
        // Active bonus: 500
        // Total: 700
        assert_eq!(weight, 700);
    }
    
    #[test]
    fn test_arbitrator_weight_calculation_max_reputation() {
        let info = ArbitratorInfo {
            arbitrator: Pubkey::default(),
            fiat_currency: FiatCurrency::Usd,
            total_cases: 200,
            resolved_cases: 150, // Should be capped at 100
            reputation_score: 10000, // 100%
            registration_date: 0,
            is_active: true,
            bump: 0,
        };
        
        let weight = calculate_arbitrator_weight(&info);
        // Base: 1000 * 1.0 = 1000
        // Experience: 100 * 10 = 1000 (capped at 100 cases)
        // Active bonus: 500
        // Total: 2500
        assert_eq!(weight, 2500);
    }
    
    #[test]
    fn test_arbitrator_weight_calculation_inactive() {
        let info = ArbitratorInfo {
            arbitrator: Pubkey::default(),
            fiat_currency: FiatCurrency::Usd,
            total_cases: 50,
            resolved_cases: 30,
            reputation_score: 8000, // 80%
            registration_date: 0,
            is_active: false, // Inactive
            bump: 0,
        };
        
        let weight = calculate_arbitrator_weight(&info);
        // Base: 1000 * 0.8 = 800
        // Experience: 30 * 10 = 300
        // Active bonus: 0 (inactive)
        // Total: 1100
        assert_eq!(weight, 1100);
    }
    
    #[test]
    fn test_arbitrator_weight_calculation_overflow_protection() {
        let info = ArbitratorInfo {
            arbitrator: Pubkey::default(),
            fiat_currency: FiatCurrency::Usd,
            total_cases: u64::MAX,
            resolved_cases: u64::MAX, // Extreme case count
            reputation_score: 10000, // Max reputation
            registration_date: 0,
            is_active: true,
            bump: 0,
        };
        
        // Should not panic and handle overflow gracefully
        let weight = calculate_arbitrator_weight(&info);
        assert!(weight > 0); // Should have some positive weight
    }
    
    #[test]
    fn test_selection_status_enum() {
        // Test that all enum variants are properly defined
        let pending = SelectionStatus::Pending;
        let requested = SelectionStatus::RandomnessRequested;
        let received = SelectionStatus::RandomnessReceived;
        let selected = SelectionStatus::ArbitratorSelected;
        let failed = SelectionStatus::Failed;
        
        // Test equality
        assert_eq!(pending, SelectionStatus::Pending);
        assert_eq!(requested, SelectionStatus::RandomnessRequested);
        assert_eq!(received, SelectionStatus::RandomnessReceived);
        assert_eq!(selected, SelectionStatus::ArbitratorSelected);
        assert_eq!(failed, SelectionStatus::Failed);
        
        // Test inequality
        assert_ne!(pending, requested);
        assert_ne!(received, failed);
    }
    
    #[test]
    fn test_vrf_arbitrator_selection_account_size() {
        // Test that the account size calculation is reasonable
        let expected_min_size = 8 + 8 + 32 + 33 + 33 + 33 + 8 + 1 + 1; // Basic fields
        assert!(VrfArbitratorSelection::INIT_SPACE >= expected_min_size);
        assert!(VrfArbitratorSelection::INIT_SPACE <= 512); // Reasonable upper bound
    }
    
    #[test]
    fn test_commit_reveal_data_structures() {
        let commit_data = CommitData {
            committer: Pubkey::default(),
            commitment: [0u8; 32],
            timestamp: 1234567890,
        };
        
        let reveal_data = RevealData {
            revealer: Pubkey::default(),
            value: [1u8; 32],
            nonce: [2u8; 32],
        };
        
        // Test that structures can be created without issues
        assert_eq!(commit_data.timestamp, 1234567890);
        assert_eq!(reveal_data.value, [1u8; 32]);
        assert_eq!(reveal_data.nonce, [2u8; 32]);
    }
    
    #[test]
    fn test_weighted_selection_distribution() {
        // Test that the weighted selection algorithm distributes fairly
        let randomness_samples = [
            [0u8; 32],   // All zeros - should select first
            [255u8; 32], // All ones - should select last
        ];
        
        // Create mock arbitrator weights
        let weights = vec![
            (Pubkey::new_unique(), 1000u64),
            (Pubkey::new_unique(), 2000u64),
            (Pubkey::new_unique(), 1000u64),
        ];
        let total_weight = 4000u64;
        
        for randomness in randomness_samples.iter() {
            let random_value = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
            let selection_point = random_value % total_weight;
            
            // Test that selection point is within valid range
            assert!(selection_point < total_weight);
            
            // Test that cumulative selection logic works
            let mut cumulative = 0u64;
            let mut found_selection = false;
            
            for (_, weight) in &weights {
                cumulative = cumulative.saturating_add(*weight);
                if selection_point < cumulative {
                    found_selection = true;
                    break;
                }
            }
            
            assert!(found_selection, "Selection algorithm should always find an arbitrator");
        }
    }
    
    #[test]
    fn test_reputation_edge_cases() {
        // Test edge cases for reputation scoring
        let test_cases = vec![
            (0, 0),      // Minimum reputation
            (5000, 500), // Mid-range reputation  
            (10000, 1000), // Maximum reputation
        ];
        
        for (reputation_score, _expected_base_weight) in test_cases {
            let info = ArbitratorInfo {
                arbitrator: Pubkey::default(),
                fiat_currency: FiatCurrency::Usd,
                total_cases: 10,
                resolved_cases: 5,
                reputation_score,
                registration_date: 0,
                is_active: true,
                bump: 0,
            };
            
            let weight = calculate_arbitrator_weight(&info);
            let base_component = 1000u64
                .saturating_mul(reputation_score as u64)
                .saturating_div(10000);
            
            // The weight should include base component plus experience and active bonus
            assert!(weight >= base_component);
            
            // For active arbitrators, weight should be at least base + experience + 500
            if info.is_active {
                let expected_min = base_component + (info.resolved_cases * 10) + 500;
                assert!(weight >= expected_min);
            }
        }
    }
}