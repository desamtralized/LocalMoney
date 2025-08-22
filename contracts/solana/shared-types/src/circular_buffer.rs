use anchor_lang::prelude::*;
use super::TradeStateItem;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BoundedStateHistory {
    pub items: [Option<TradeStateItem>; 20], // Fixed size array
    pub head: u8,                            // Current write position
    pub count: u8,                           // Total items (max 20)
}

impl BoundedStateHistory {
    pub const MAX_SIZE: usize = 20;
    
    pub fn new() -> Self {
        Self {
            items: Default::default(),
            head: 0,
            count: 0,
        }
    }
    
    pub fn push(&mut self, item: TradeStateItem) -> Result<()> {
        // Circular buffer - overwrites oldest when full
        self.items[self.head as usize] = Some(item);
        self.head = (self.head + 1) % Self::MAX_SIZE as u8;
        if self.count < Self::MAX_SIZE as u8 {
            self.count += 1;
        }
        Ok(())
    }
    
    pub fn last(&self) -> Option<&TradeStateItem> {
        if self.count == 0 {
            return None;
        }
        
        // Get the index of the most recently added item
        let last_index = if self.head == 0 {
            (self.count - 1) as usize
        } else {
            (self.head - 1) as usize
        };
        
        self.items[last_index].as_ref()
    }
    
    pub fn iter(&self) -> BoundedHistoryIterator {
        BoundedHistoryIterator {
            history: self,
            current: 0,
        }
    }
    
    pub fn len(&self) -> usize {
        self.count as usize
    }
    
    pub fn is_empty(&self) -> bool {
        self.count == 0
    }
    
    pub const fn space() -> usize {
        8 + // discriminator
        (1 + 32 + 1 + 8) * Self::MAX_SIZE + // items array (Option<TradeStateItem>)
        1 + // head
        1   // count
    }
}

impl Default for BoundedStateHistory {
    fn default() -> Self {
        Self::new()
    }
}

pub struct BoundedHistoryIterator<'a> {
    history: &'a BoundedStateHistory,
    current: usize,
}

impl<'a> Iterator for BoundedHistoryIterator<'a> {
    type Item = &'a TradeStateItem;
    
    fn next(&mut self) -> Option<Self::Item> {
        if self.current >= self.history.count as usize {
            return None;
        }
        
        // Calculate the actual index in the circular buffer
        let start = if self.history.count < BoundedStateHistory::MAX_SIZE as u8 {
            0
        } else {
            self.history.head as usize
        };
        
        let index = (start + self.current) % BoundedStateHistory::MAX_SIZE;
        self.current += 1;
        
        self.history.items[index].as_ref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TradeState;

    #[test]
    fn test_circular_buffer_basic() {
        let mut buffer = BoundedStateHistory::new();
        assert_eq!(buffer.len(), 0);
        assert!(buffer.is_empty());
        
        let item = TradeStateItem {
            actor: Pubkey::default(),
            state: TradeState::RequestCreated,
            timestamp: 1000,
        };
        
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
            let item = TradeStateItem {
                actor: Pubkey::default(),
                state: TradeState::RequestCreated,
                timestamp: i,
            };
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
            let item = TradeStateItem {
                actor: Pubkey::default(),
                state: TradeState::RequestCreated,
                timestamp: i,
            };
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
            let item = TradeStateItem {
                actor: Pubkey::default(),
                state: TradeState::RequestCreated,
                timestamp: i,
            };
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
}