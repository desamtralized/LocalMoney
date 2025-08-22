#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;
    use localmoney_shared::*;
    use trade::state::Trade;
    
    // Generate arbitrary trade states
    fn arb_trade_state() -> impl Strategy<Value = TradeState> {
        prop_oneof![
            Just(TradeState::RequestCreated),
            Just(TradeState::RequestAccepted),
            Just(TradeState::RequestCancelled),
            Just(TradeState::EscrowFunded),
            Just(TradeState::FiatDeposited),
            Just(TradeState::EscrowReleased),
            Just(TradeState::EscrowRefunded),
            Just(TradeState::DisputeOpened),
            Just(TradeState::DisputeResolved),
        ]
    }
    
    // Generate arbitrary fiat currencies
    fn arb_fiat_currency() -> impl Strategy<Value = FiatCurrency> {
        prop_oneof![
            Just(FiatCurrency::Usd),
            Just(FiatCurrency::Eur),
            Just(FiatCurrency::Gbp),
            Just(FiatCurrency::Cad),
            Just(FiatCurrency::Aud),
            Just(FiatCurrency::Jpy),
            Just(FiatCurrency::Brl),
            Just(FiatCurrency::Mxn),
        ]
    }
    
    proptest! {
        #[test]
        fn test_state_machine_invariants(
            transitions in prop::collection::vec(arb_trade_state(), 1..100)
        ) {
            let mut trade = Trade {
                id: 1,
                offer_id: 1,
                buyer: anchor_lang::prelude::Pubkey::new_unique(),
                seller: anchor_lang::prelude::Pubkey::new_unique(),
                arbitrator: anchor_lang::prelude::Pubkey::new_unique(),
                token_mint: anchor_lang::prelude::Pubkey::new_unique(),
                amount: 1000000,
                fiat_currency: FiatCurrency::Usd,
                locked_price: 100,
                state: TradeState::RequestCreated,
                created_at: 0,
                expires_at: 3600,
                dispute_window_at: None,
                state_history: BoundedStateHistory::new(),
                buyer_contact: None,
                seller_contact: None,
                bump: 0,
            };
            
            for new_state in transitions {
                // Try to transition to new state
                if trade.validate_transition(&new_state).is_ok() {
                    let old_state = trade.state.clone();
                    trade.state = new_state;
                    
                    // Check invariants
                    prop_assert!(trade.amount > 0, "Amount must be positive");
                    
                    // Terminal states should remain terminal
                    if matches!(old_state, TradeState::EscrowReleased | TradeState::EscrowRefunded | TradeState::RequestCancelled) {
                        prop_assert!(
                            trade.state == old_state,
                            "Terminal states should not transition"
                        );
                    }
                }
            }
        }
        
        #[test]
        fn test_small_vec_operations(
            operations in prop::collection::vec(
                prop_oneof![
                    (0u8..255u8).prop_map(|v| VecOp::Push(v as u64)),
                    Just(VecOp::Pop),
                    Just(VecOp::Clear),
                    (0usize..10).prop_map(|i| VecOp::Remove(i)),
                ],
                1..1000
            )
        ) {
            let mut vec = SmallVec::<10, u64>::new();
            
            for op in operations {
                match op {
                    VecOp::Push(val) => {
                        if !vec.is_full() {
                            vec.push(val).unwrap();
                            prop_assert!(vec.len() <= 10);
                            prop_assert!(vec.len() > 0);
                        }
                    }
                    VecOp::Pop => {
                        let before_len = vec.len();
                        let result = vec.pop();
                        if before_len > 0 {
                            prop_assert!(result.is_some());
                            prop_assert!(vec.len() == before_len - 1);
                        } else {
                            prop_assert!(result.is_none());
                            prop_assert!(vec.len() == 0);
                        }
                    }
                    VecOp::Clear => {
                        vec.clear();
                        prop_assert!(vec.is_empty());
                        prop_assert!(vec.len() == 0);
                    }
                    VecOp::Remove(idx) => {
                        let before_len = vec.len();
                        if idx < before_len {
                            let result = vec.remove(idx);
                            prop_assert!(result.is_ok());
                            prop_assert!(vec.len() == before_len - 1);
                        }
                    }
                }
                
                // General invariants
                prop_assert!(vec.len() <= vec.capacity());
                prop_assert!(vec.remaining_capacity() == vec.capacity() - vec.len());
            }
        }
        
        #[test]
        fn test_state_history_consistency(
            entries in prop::collection::vec(
                (arb_trade_state(), arb_trade_state(), 0i64..1000000i64),
                1..100
            )
        ) {
            let mut history = StateHistory::<50>::new();
            
            for (from_state, to_state, timestamp) in entries {
                let entry = StateHistoryEntry {
                    from_state,
                    to_state,
                    actor: anchor_lang::prelude::Pubkey::new_unique(),
                    timestamp,
                    reason: StateChangeReason::UserAction,
                };
                
                history.push(entry.clone()).unwrap();
                
                // Invariants
                prop_assert!(history.len() <= 50);
                
                // Last entry should be what we just pushed (unless overflow)
                if history.len() < 50 {
                    let last = history.get_last().unwrap();
                    prop_assert_eq!(last.timestamp, timestamp);
                }
            }
            
            // Iterator should return entries in order
            let mut prev_timestamp = None;
            for entry in history.iter() {
                if let Some(prev) = prev_timestamp {
                    // In a ring buffer, older entries come first
                    prop_assert!(entry.timestamp >= prev || history.len() == 50);
                }
                prev_timestamp = Some(entry.timestamp);
            }
        }
        
        #[test]
        fn test_safe_math_operations(
            a in 0u64..u64::MAX/2,
            b in 0u64..u64::MAX/2,
            percentage in 0u16..10000
        ) {
            // Test addition
            let result = a.safe_add(b);
            prop_assert!(result.is_ok());
            prop_assert_eq!(result.unwrap(), a + b);
            
            // Test subtraction
            if a >= b {
                let result = a.safe_sub(b);
                prop_assert!(result.is_ok());
                prop_assert_eq!(result.unwrap(), a - b);
            } else {
                let result = a.safe_sub(b);
                prop_assert!(result.is_err());
            }
            
            // Test multiplication with small values
            if a < 1000000 && b < 1000000 {
                let result = a.safe_mul(b);
                prop_assert!(result.is_ok());
                prop_assert_eq!(result.unwrap(), a * b);
            }
            
            // Test percentage calculation
            let calc = PercentageCalculator::new(10000);
            let result = calc.calculate(a, percentage);
            if let Ok(value) = result {
                prop_assert!(value <= a);
            }
        }
        
        #[test]
        fn test_bounded_string_limits(
            input in prop::string::string_regex("[a-zA-Z0-9@._-]{0,1000}").unwrap()
        ) {
            let result = BoundedString::from_string(input.clone());
            
            if input.len() <= 64 {
                prop_assert!(result.is_ok());
                let bounded = result.unwrap();
                prop_assert_eq!(bounded.len(), input.len());
                prop_assert_eq!(bounded.as_str(), input);
            } else {
                prop_assert!(result.is_err());
            }
        }
        
        #[test]
        fn test_reallocation_growth(
            initial_size in 100usize..1000,
            growth_steps in 1usize..10
        ) {
            struct TestData {
                size: usize,
            }
            
            impl Reallocatable for TestData {
                const MIN_SIZE: usize = 100;
                const GROWTH_FACTOR: usize = 256;
                
                fn required_size(&self) -> usize {
                    self.size
                }
                
                fn can_reallocate(&self) -> bool {
                    true
                }
            }
            
            let mut data = TestData { size: initial_size };
            let mut current_allocation = initial_size;
            
            for _ in 0..growth_steps {
                data.size += 100;
                
                if data.required_size() > current_allocation {
                    // Simulate reallocation
                    current_allocation = data.required_size() + TestData::GROWTH_FACTOR;
                    
                    // Check growth constraints
                    prop_assert!(current_allocation >= data.required_size());
                    prop_assert!(current_allocation - data.required_size() >= TestData::GROWTH_FACTOR);
                    prop_assert!(current_allocation <= 10 * 1024 * 1024); // Max 10MB
                }
            }
        }
        
        #[test]
        fn test_audit_trail_integrity(
            actions in prop::collection::vec(
                (0u64..1000, prop::string::string_regex("[A-Z_]{1,30}").unwrap()),
                1..100
            )
        ) {
            let mut trail = AuditTrail::new(50);
            let mut expected_entries = Vec::new();
            
            for (trade_id, action) in actions {
                let mut metadata = std::collections::BTreeMap::new();
                metadata.insert("test".to_string(), "value".to_string());
                
                trail.record_action(
                    trade_id,
                    &action,
                    anchor_lang::prelude::Pubkey::new_unique(),
                    &metadata,
                ).unwrap();
                
                expected_entries.push((trade_id, action));
                
                // Keep only last 50 entries for comparison
                if expected_entries.len() > 50 {
                    expected_entries.remove(0);
                }
            }
            
            // Verify trail contains expected entries
            for (trade_id, _) in &expected_entries {
                let entries = trail.get_entries_for_trade(*trade_id);
                prop_assert!(entries.len() > 0);
            }
            
            // Verify JSON export works
            let json = trail.export_json();
            prop_assert!(json.len() > 0);
            prop_assert!(json.starts_with('['));
            prop_assert!(json.ends_with(']'));
        }
    }
    
    #[derive(Debug, Clone)]
    enum VecOp {
        Push(u64),
        Pop,
        Clear,
        Remove(usize),
    }
}