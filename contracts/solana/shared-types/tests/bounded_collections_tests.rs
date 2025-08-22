use localmoney_shared::{BoundedString, BoundedStateHistory, TradeState, TradeStateItem};
use anchor_lang::prelude::*;
use proptest::prelude::*;

fn create_test_item(actor: Pubkey, state: TradeState, timestamp: i64) -> TradeStateItem {
    TradeStateItem {
        actor,
        state,
        timestamp,
    }
}

#[cfg(test)]
mod bounded_string_tests {
    use super::*;

    #[test]
    fn test_bounded_string_within_limit() {
        let s = "Hello, World!".to_string();
        let bounded = BoundedString::new(s.clone()).unwrap();
        assert_eq!(bounded.value, s);
    }

    #[test]
    fn test_bounded_string_at_limit() {
        let s = "x".repeat(200);
        let bounded = BoundedString::new(s.clone()).unwrap();
        assert_eq!(bounded.value, s);
    }

    #[test]
    fn test_bounded_string_exceeds_limit() {
        let s = "x".repeat(201);
        let result = BoundedString::new(s);
        assert!(result.is_err());
    }

    #[test]
    fn test_bounded_string_from_option() {
        let s = Some("test".to_string());
        let bounded = BoundedString::from_option(s).unwrap();
        assert!(bounded.is_some());
        assert_eq!(bounded.unwrap().value, "test");
        
        let none: Option<String> = None;
        let bounded = BoundedString::from_option(none).unwrap();
        assert!(bounded.is_none());
    }

    #[test]
    fn test_bounded_string_to_option() {
        let bounded = BoundedString::new("test".to_string()).unwrap();
        let result = BoundedString::to_option(Some(bounded));
        assert_eq!(result, Some("test".to_string()));
        
        let result = BoundedString::to_option(None);
        assert_eq!(result, None);
    }

    #[test]
    fn test_bounded_string_space_calculation() {
        assert_eq!(BoundedString::space(), 204);
        assert_eq!(BoundedString::option_space(), 205);
    }

    proptest! {
        #[test]
        fn test_bounded_string_property_valid_strings(
            s in "[a-zA-Z0-9 ]{0,200}"
        ) {
            let result = BoundedString::new(s.clone());
            assert!(result.is_ok());
            assert_eq!(result.unwrap().value, s);
        }

        #[test]
        fn test_bounded_string_property_invalid_strings(
            s in "[a-zA-Z0-9 ]{201,300}"
        ) {
            let result = BoundedString::new(s);
            assert!(result.is_err());
        }
    }
}

#[cfg(test)]
mod bounded_state_history_tests {
    use super::*;


    #[test]
    fn test_circular_buffer_basic() {
        let mut buffer = BoundedStateHistory::new();
        assert_eq!(buffer.len(), 0);
        assert!(buffer.is_empty());
        
        let item = create_test_item(
            Pubkey::default(),
            TradeState::RequestCreated,
            1000,
        );
        
        buffer.push(item.clone()).unwrap();
        assert_eq!(buffer.len(), 1);
        assert!(!buffer.is_empty());
        
        let last = buffer.last().unwrap();
        assert_eq!(last.timestamp, 1000);
    }
    
    #[test]
    fn test_circular_buffer_overflow() {
        let mut buffer = BoundedStateHistory::new();
        
        // Push more than capacity
        for i in 0..30 {
            let item = create_test_item(
                Pubkey::default(),
                TradeState::RequestCreated,
                i,
            );
            buffer.push(item).unwrap();
        }
        
        // Should be capped at MAX_SIZE
        assert_eq!(buffer.len(), BoundedStateHistory::MAX_SIZE);
        assert_eq!(buffer.count, 20);
        
        // Last item should be the most recent
        let last = buffer.last().unwrap();
        assert_eq!(last.timestamp, 29);
    }
    
    #[test]
    fn test_circular_buffer_iterator() {
        let mut buffer = BoundedStateHistory::new();
        
        // Add 5 items
        for i in 0..5 {
            let item = create_test_item(
                Pubkey::default(),
                TradeState::RequestCreated,
                i,
            );
            buffer.push(item).unwrap();
        }
        
        // Iterate and check order
        let timestamps: Vec<i64> = buffer.iter().map(|item| item.timestamp).collect();
        assert_eq!(timestamps, vec![0, 1, 2, 3, 4]);
    }
    
    #[test]
    fn test_circular_buffer_iterator_after_overflow() {
        let mut buffer = BoundedStateHistory::new();
        
        // Push 25 items (more than capacity)
        for i in 0..25 {
            let item = create_test_item(
                Pubkey::default(),
                TradeState::RequestCreated,
                i,
            );
            buffer.push(item).unwrap();
        }
        
        // Should only have the last 20 items (5-24)
        let timestamps: Vec<i64> = buffer.iter().map(|item| item.timestamp).collect();
        assert_eq!(timestamps.len(), 20);
        assert_eq!(timestamps[0], 5);
        assert_eq!(timestamps[19], 24);
    }
    
    #[test]
    fn test_space_calculation() {
        let space = BoundedStateHistory::space();
        // Should be reasonable size for Solana account
        assert!(space < 10000); // Well under 10KB
    }

    #[test]
    fn test_different_states() {
        let mut buffer = BoundedStateHistory::new();
        
        let states = [
            TradeState::RequestCreated,
            TradeState::RequestAccepted,
            TradeState::EscrowFunded,
            TradeState::FiatDeposited,
            TradeState::EscrowReleased,
        ];
        
        for (i, state) in states.iter().enumerate() {
            let item = create_test_item(
                Pubkey::new_unique(),
                state.clone(),
                i as i64,
            );
            buffer.push(item).unwrap();
        }
        
        assert_eq!(buffer.len(), 5);
        
        let collected_states: Vec<TradeState> = buffer.iter()
            .map(|item| item.state.clone())
            .collect();
        
        assert_eq!(collected_states, states);
    }

    proptest! {
        #[test]
        fn test_circular_buffer_properties(
            items in prop::collection::vec(0i64..1000, 0..50)
        ) {
            let mut buffer = BoundedStateHistory::new();
            
            for timestamp in items.iter() {
                let item = create_test_item(
                    Pubkey::new_unique(),
                    TradeState::RequestCreated,
                    *timestamp,
                );
                buffer.push(item).unwrap();
            }
            
            // Buffer should never exceed max size
            assert!(buffer.len() <= BoundedStateHistory::MAX_SIZE);
            
            // If we have items, last should exist
            if !items.is_empty() {
                assert!(buffer.last().is_some());
                
                // Last item should have the most recent timestamp
                let last_timestamp = buffer.last().unwrap().timestamp;
                assert_eq!(last_timestamp, items[items.len() - 1]);
            }
        }
    }
}

#[cfg(test)]
mod dos_protection_tests {
    use super::*;

    #[test]
    fn test_dos_protection_string_overflow() {
        // Attempt to create extremely long strings
        let malicious_string = "a".repeat(10000);
        let result = BoundedString::new(malicious_string);
        assert!(result.is_err(), "Should reject strings over limit");
    }

    #[test]
    fn test_dos_protection_history_overflow() {
        let mut buffer = BoundedStateHistory::new();
        
        // Attempt to overflow with many state changes
        for i in 0..1000 {
            let item = create_test_item(
                Pubkey::new_unique(),
                TradeState::RequestCreated,
                i,
            );
            
            // This should never fail or cause memory issues
            let result = buffer.push(item);
            assert!(result.is_ok());
        }
        
        // Buffer should maintain its size limit
        assert_eq!(buffer.len(), BoundedStateHistory::MAX_SIZE);
        
        // Should have the most recent items
        let last = buffer.last().unwrap();
        assert_eq!(last.timestamp, 999);
        
        // First item should be from position 980 (1000 - 20)
        let first = buffer.iter().next().unwrap();
        assert_eq!(first.timestamp, 980);
    }

    #[test]
    fn test_memory_usage_bounded() {
        // Test that our structures have predictable memory usage
        let _buffer = BoundedStateHistory::new();
        let space = BoundedStateHistory::space();
        
        // Should be under 10KB for Solana constraints
        assert!(space < 10_000);
        
        let string_space = BoundedString::space();
        assert!(string_space < 1_000);
        
        let option_space = BoundedString::option_space();
        assert!(option_space < 1_000);
    }

    #[test]
    fn test_concurrent_operations_simulation() {
        let mut buffer = BoundedStateHistory::new();
        
        // Simulate rapid state changes that could happen in concurrent environment
        for batch in 0..10 {
            for i in 0..50 {
                let item = create_test_item(
                    Pubkey::new_unique(),
                    if i % 2 == 0 { TradeState::EscrowFunded } else { TradeState::FiatDeposited },
                    (batch * 50 + i) as i64,
                );
                
                buffer.push(item).unwrap();
            }
        }
        
        // Should maintain constraints
        assert_eq!(buffer.len(), BoundedStateHistory::MAX_SIZE);
        
        // Should have the last 20 items from the final batch
        let timestamps: Vec<i64> = buffer.iter().map(|item| item.timestamp).collect();
        
        // Items should be from the range [480, 499]
        assert!(timestamps[0] >= 480);
        assert_eq!(timestamps[19], 499);
    }
}

fn main() {
    // This is needed for the test executable
}