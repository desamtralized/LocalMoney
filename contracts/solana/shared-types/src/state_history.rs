use anchor_lang::prelude::*;
use crate::TradeState;
use std::collections::BTreeMap;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StateHistory<const N: usize> {
    entries: [Option<StateHistoryEntry>; N],
    head: u8,  // Points to oldest entry
    tail: u8,  // Points to next write position
    len: u8,   // Current number of entries
}

impl<const N: usize> StateHistory<N> {
    pub fn new() -> Self {
        const INIT: Option<StateHistoryEntry> = None;
        Self {
            entries: [INIT; N],
            head: 0,
            tail: 0,
            len: 0,
        }
    }
    
    pub fn push(&mut self, entry: StateHistoryEntry) -> Result<()> {
        // Add to tail position
        self.entries[self.tail as usize] = Some(entry);
        
        // Update tail
        self.tail = (self.tail + 1) % N as u8;
        
        // Update head if buffer is full
        if self.len == N as u8 {
            self.head = (self.head + 1) % N as u8;
        } else {
            self.len += 1;
        }
        
        Ok(())
    }
    
    pub fn iter(&self) -> StateHistoryIterator<N> {
        StateHistoryIterator {
            history: self,
            current: 0,
        }
    }
    
    pub fn get_last(&self) -> Option<&StateHistoryEntry> {
        if self.len == 0 {
            None
        } else {
            let last_idx = if self.tail == 0 {
                N - 1
            } else {
                (self.tail - 1) as usize
            };
            self.entries[last_idx].as_ref()
        }
    }
    
    pub fn find_by_actor(&self, actor: &Pubkey) -> Vec<&StateHistoryEntry> {
        self.iter()
            .filter(|entry| entry.actor == *actor)
            .collect()
    }
    
    pub fn find_by_state(&self, state: &TradeState) -> Vec<&StateHistoryEntry> {
        self.iter()
            .filter(|entry| entry.to_state == *state)
            .collect()
    }
    
    pub fn find_by_reason(&self, reason: &StateChangeReason) -> Vec<&StateHistoryEntry> {
        self.iter()
            .filter(|entry| entry.reason == *reason)
            .collect()
    }
    
    pub fn current_size(&self) -> usize {
        (self.len as usize) * std::mem::size_of::<StateHistoryEntry>()
    }
    
    pub fn len(&self) -> usize {
        self.len as usize
    }
    
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
    
    pub fn clear(&mut self) {
        for i in 0..N {
            self.entries[i] = None;
        }
        self.head = 0;
        self.tail = 0;
        self.len = 0;
    }
    
    pub fn get_transition_count(&self, from: &TradeState, to: &TradeState) -> usize {
        self.iter()
            .filter(|entry| entry.from_state == *from && entry.to_state == *to)
            .count()
    }
    
    pub fn get_average_transition_time(&self, from: &TradeState, to: &TradeState) -> Option<i64> {
        let transitions: Vec<_> = self.iter()
            .filter(|entry| entry.from_state == *from && entry.to_state == *to)
            .collect();
        
        if transitions.is_empty() {
            return None;
        }
        
        let mut total_time = 0i64;
        let mut count = 0;
        
        for i in 1..transitions.len() {
            let time_diff = transitions[i].timestamp - transitions[i-1].timestamp;
            total_time += time_diff;
            count += 1;
        }
        
        if count == 0 {
            None
        } else {
            Some(total_time / count as i64)
        }
    }
}

impl<const N: usize> Default for StateHistory<N> {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug, PartialEq)]
pub struct StateHistoryEntry {
    pub from_state: TradeState,
    pub to_state: TradeState,
    pub actor: Pubkey,
    pub timestamp: i64,
    pub reason: StateChangeReason,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum StateChangeReason {
    UserAction,
    Timeout,
    AdminIntervention,
    DisputeResolution,
    SystemMaintenance,
    AutomaticTransition,
}

impl Default for StateChangeReason {
    fn default() -> Self {
        Self::UserAction
    }
}

pub struct StateHistoryIterator<'a, const N: usize> {
    history: &'a StateHistory<N>,
    current: usize,
}

impl<'a, const N: usize> Iterator for StateHistoryIterator<'a, N> {
    type Item = &'a StateHistoryEntry;
    
    fn next(&mut self) -> Option<Self::Item> {
        if self.current >= self.history.len as usize {
            return None;
        }
        
        // Calculate the actual index in the circular buffer
        let start = if self.history.len < N as u8 {
            0
        } else {
            self.history.head as usize
        };
        
        let index = (start + self.current) % N;
        self.current += 1;
        
        self.history.entries[index].as_ref()
    }
}

// Audit trail functionality
#[derive(Clone, Debug)]
pub struct AuditTrail {
    entries: Vec<AuditEntry>,
    max_entries: usize,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AuditEntry {
    pub trade_id: u64,
    pub action: [u8; 32], // Fixed size for action string
    pub actor: Pubkey,
    pub timestamp: i64,
    pub metadata_hash: [u8; 32], // Hash of metadata for space efficiency
}

impl AuditTrail {
    pub fn new(max_entries: usize) -> Self {
        Self {
            entries: Vec::with_capacity(max_entries),
            max_entries,
        }
    }
    
    pub fn record_action(
        &mut self,
        trade_id: u64,
        action: &str,
        actor: Pubkey,
        metadata: &BTreeMap<String, String>,
    ) -> Result<()> {
        // Convert action to fixed-size array
        let mut action_bytes = [0u8; 32];
        let action_slice = action.as_bytes();
        let len = action_slice.len().min(32);
        action_bytes[..len].copy_from_slice(&action_slice[..len]);
        
        // Hash metadata for space efficiency - simple hash of concatenated key-value pairs
        let mut metadata_str = String::new();
        for (k, v) in metadata {
            metadata_str.push_str(k);
            metadata_str.push_str(v);
        }
        let metadata_hash = anchor_lang::solana_program::hash::hash(metadata_str.as_bytes());
        
        let entry = AuditEntry {
            trade_id,
            action: action_bytes,
            actor,
            timestamp: Clock::get()?.unix_timestamp,
            metadata_hash: metadata_hash.to_bytes(),
        };
        
        // Maintain max size by removing oldest if necessary
        if self.entries.len() >= self.max_entries {
            self.entries.remove(0);
        }
        
        self.entries.push(entry);
        Ok(())
    }
    
    pub fn get_entries_for_trade(&self, trade_id: u64) -> Vec<&AuditEntry> {
        self.entries
            .iter()
            .filter(|entry| entry.trade_id == trade_id)
            .collect()
    }
    
    pub fn get_entries_by_actor(&self, actor: &Pubkey) -> Vec<&AuditEntry> {
        self.entries
            .iter()
            .filter(|entry| entry.actor == *actor)
            .collect()
    }
    
    pub fn get_entries_in_range(&self, start: i64, end: i64) -> Vec<&AuditEntry> {
        self.entries
            .iter()
            .filter(|entry| entry.timestamp >= start && entry.timestamp <= end)
            .collect()
    }
    
    pub fn export_json(&self) -> String {
        // Simplified export - in production would use proper JSON serialization
        let mut result = String::from("[");
        for (i, entry) in self.entries.iter().enumerate() {
            if i > 0 {
                result.push_str(",");
            }
            let action = String::from_utf8_lossy(&entry.action)
                .trim_end_matches('\0')
                .to_string();
            result.push_str(&format!(
                r#"{{"trade_id":{},"action":"{}","actor":"{}","timestamp":{}}}"#,
                entry.trade_id,
                action,
                entry.actor.to_string(),
                entry.timestamp
            ));
        }
        result.push(']');
        result
    }
}

impl Default for AuditTrail {
    fn default() -> Self {
        Self::new(1000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_state_history_basic() {
        let mut history = StateHistory::<10>::new();
        
        let entry = StateHistoryEntry {
            from_state: TradeState::RequestCreated,
            to_state: TradeState::RequestAccepted,
            actor: Pubkey::new_unique(),
            timestamp: 1000,
            reason: StateChangeReason::UserAction,
        };
        
        history.push(entry.clone()).unwrap();
        assert_eq!(history.len(), 1);
        
        let last = history.get_last().unwrap();
        assert_eq!(last.timestamp, 1000);
    }
    
    #[test]
    fn test_state_history_overflow() {
        let mut history = StateHistory::<5>::new();
        
        // Push more than capacity
        for i in 0..10 {
            let entry = StateHistoryEntry {
                from_state: TradeState::RequestCreated,
                to_state: TradeState::RequestAccepted,
                actor: Pubkey::new_unique(),
                timestamp: i,
                reason: StateChangeReason::UserAction,
            };
            history.push(entry).unwrap();
        }
        
        // Should be capped at capacity
        assert_eq!(history.len(), 5);
        
        // Oldest entries should be overwritten
        let entries: Vec<_> = history.iter().collect();
        assert_eq!(entries[0].timestamp, 5);
        assert_eq!(entries[4].timestamp, 9);
    }
    
    #[test]
    fn test_audit_trail() {
        let mut trail = AuditTrail::new(100);
        let mut metadata = BTreeMap::new();
        metadata.insert("key".to_string(), "value".to_string());
        
        trail.record_action(
            1,
            "CREATE_TRADE",
            Pubkey::new_unique(),
            &metadata,
        ).unwrap();
        
        assert_eq!(trail.entries.len(), 1);
        
        let entries = trail.get_entries_for_trade(1);
        assert_eq!(entries.len(), 1);
    }
}