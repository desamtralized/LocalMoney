use anchor_lang::prelude::*;
use super::{FiatCurrency, SharedTypeError};

#[account]
pub struct ArbitratorPool {
    pub fiat_currency: FiatCurrency,
    pub authority: Pubkey,
    pub page_count: u32,           // Number of ArbitratorPage accounts
    pub total_arbitrators: u32,
    pub bump: u8,
}

impl ArbitratorPool {
    pub const SPACE: usize = 8 + // discriminator
        1 + 1 + // FiatCurrency enum (tag + variant)
        32 + // authority
        4 + // page_count
        4 + // total_arbitrators
        1; // bump
}

#[account]
pub struct ArbitratorPage {
    pub pool: Pubkey,               // Parent pool
    pub page_number: u32,
    pub arbitrators: Vec<Pubkey>,   // Max 10 per page
    pub bump: u8,
}

impl ArbitratorPage {
    pub const MAX_ARBITRATORS: usize = 10;
    pub const SPACE: usize = 8 + // discriminator
        32 + // pool
        4 + // page_number
        4 + (32 * Self::MAX_ARBITRATORS) + // arbitrators vector
        1; // bump
    
    pub fn add_arbitrator(&mut self, arbitrator: Pubkey) -> Result<()> {
        require!(
            self.arbitrators.len() < Self::MAX_ARBITRATORS,
            SharedTypeError::PageFull
        );
        
        // Check for duplicates
        require!(
            !self.arbitrators.contains(&arbitrator),
            SharedTypeError::InvalidPageNumber // Reusing error for duplicate
        );
        
        self.arbitrators.push(arbitrator);
        Ok(())
    }
    
    pub fn remove_arbitrator(&mut self, arbitrator: &Pubkey) -> Result<()> {
        if let Some(pos) = self.arbitrators.iter().position(|a| a == arbitrator) {
            self.arbitrators.remove(pos);
            Ok(())
        } else {
            Err(SharedTypeError::InvalidPageNumber.into()) // Reusing error for not found
        }
    }
    
    pub fn is_full(&self) -> bool {
        self.arbitrators.len() >= Self::MAX_ARBITRATORS
    }
    
    pub fn is_empty(&self) -> bool {
        self.arbitrators.is_empty()
    }
}

// Helper functions for pagination
pub fn get_page_index(total_items: usize, items_per_page: usize) -> usize {
    total_items.div_ceil(items_per_page)
}

pub fn get_page_for_item(item_index: usize, items_per_page: usize) -> usize {
    item_index / items_per_page
}

pub fn get_item_index_in_page(item_index: usize, items_per_page: usize) -> usize {
    item_index % items_per_page
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_arbitrator_page_add() {
        let mut page = ArbitratorPage {
            pool: Pubkey::default(),
            page_number: 0,
            arbitrators: vec![],
            bump: 0,
        };
        
        let arb1 = Pubkey::new_unique();
        page.add_arbitrator(arb1).unwrap();
        assert_eq!(page.arbitrators.len(), 1);
        assert!(page.arbitrators.contains(&arb1));
    }
    
    #[test]
    fn test_arbitrator_page_full() {
        let mut page = ArbitratorPage {
            pool: Pubkey::default(),
            page_number: 0,
            arbitrators: vec![],
            bump: 0,
        };
        
        // Fill the page
        for _ in 0..ArbitratorPage::MAX_ARBITRATORS {
            let arb = Pubkey::new_unique();
            page.add_arbitrator(arb).unwrap();
        }
        
        assert!(page.is_full());
        
        // Try to add one more
        let extra_arb = Pubkey::new_unique();
        assert!(page.add_arbitrator(extra_arb).is_err());
    }
    
    #[test]
    fn test_arbitrator_page_remove() {
        let mut page = ArbitratorPage {
            pool: Pubkey::default(),
            page_number: 0,
            arbitrators: vec![],
            bump: 0,
        };
        
        let arb1 = Pubkey::new_unique();
        let arb2 = Pubkey::new_unique();
        
        page.add_arbitrator(arb1).unwrap();
        page.add_arbitrator(arb2).unwrap();
        assert_eq!(page.arbitrators.len(), 2);
        
        page.remove_arbitrator(&arb1).unwrap();
        assert_eq!(page.arbitrators.len(), 1);
        assert!(!page.arbitrators.contains(&arb1));
        assert!(page.arbitrators.contains(&arb2));
    }
    
    #[test]
    fn test_no_duplicates() {
        let mut page = ArbitratorPage {
            pool: Pubkey::default(),
            page_number: 0,
            arbitrators: vec![],
            bump: 0,
        };
        
        let arb = Pubkey::new_unique();
        page.add_arbitrator(arb).unwrap();
        
        // Try to add the same arbitrator again
        assert!(page.add_arbitrator(arb).is_err());
        assert_eq!(page.arbitrators.len(), 1);
    }
    
    #[test]
    fn test_pagination_helpers() {
        assert_eq!(get_page_index(0, 10), 0);
        assert_eq!(get_page_index(5, 10), 1);
        assert_eq!(get_page_index(10, 10), 1);
        assert_eq!(get_page_index(11, 10), 2);
        assert_eq!(get_page_index(20, 10), 2);
        assert_eq!(get_page_index(21, 10), 3);
        
        assert_eq!(get_page_for_item(0, 10), 0);
        assert_eq!(get_page_for_item(9, 10), 0);
        assert_eq!(get_page_for_item(10, 10), 1);
        assert_eq!(get_page_for_item(19, 10), 1);
        assert_eq!(get_page_for_item(20, 10), 2);
        
        assert_eq!(get_item_index_in_page(0, 10), 0);
        assert_eq!(get_item_index_in_page(9, 10), 9);
        assert_eq!(get_item_index_in_page(10, 10), 0);
        assert_eq!(get_item_index_in_page(15, 10), 5);
        assert_eq!(get_item_index_in_page(20, 10), 0);
    }
    
    #[test]
    fn test_space_calculations() {
        // These are compile-time constants that should be reasonable
        const _POOL_SPACE: usize = ArbitratorPool::SPACE;
        const _PAGE_SPACE: usize = ArbitratorPage::SPACE;
        
        // Just verify they compile correctly by using them
        let _ = (_POOL_SPACE, _PAGE_SPACE);
    }
}