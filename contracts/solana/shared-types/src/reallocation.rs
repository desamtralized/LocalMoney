use anchor_lang::prelude::*;
use anchor_lang::system_program;

pub trait Reallocatable {
    const MIN_SIZE: usize;
    const GROWTH_FACTOR: usize = 256; // Grow by 256 bytes
    
    fn required_size(&self) -> usize;
    fn can_reallocate(&self) -> bool;
}

pub struct ReallocContext<'info> {
    pub account: AccountInfo<'info>,
    pub payer: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
}

impl<'info> ReallocContext<'info> {
    pub fn realloc_if_needed<T: Reallocatable>(
        &self,
        data: &T,
        zero_init: bool,
    ) -> Result<bool> {
        let current_size = self.account.data_len();
        let required_size = data.required_size();
        
        if required_size <= current_size {
            return Ok(false);
        }
        
        // Calculate new size with growth factor
        let new_size = required_size
            .checked_add(T::GROWTH_FACTOR)
            .ok_or(ErrorCode::ConstraintRaw)?;
        
        // Ensure we don't exceed max account size (10MB)
        require!(
            new_size <= 10 * 1024 * 1024,
            ErrorCode::AccountDidNotSerialize
        );
        
        // Reallocate account
        self.account.realloc(new_size, zero_init)?;
        
        // Calculate additional rent needed
        let rent = Rent::get()?;
        let new_minimum = rent.minimum_balance(new_size);
        let current_lamports = self.account.lamports();
        
        if new_minimum > current_lamports {
            let difference = new_minimum
                .checked_sub(current_lamports)
                .ok_or(ErrorCode::ConstraintRaw)?;
            
            // Transfer additional rent
            system_program::transfer(
                CpiContext::new(
                    self.system_program.clone(),
                    system_program::Transfer {
                        from: self.payer.clone(),
                        to: self.account.clone(),
                    },
                ),
                difference,
            )?;
        }
        
        msg!("Reallocated account from {} to {} bytes", current_size, new_size);
        Ok(true)
    }
    
    pub fn shrink_if_possible<T: Reallocatable>(
        &self,
        data: &T,
    ) -> Result<bool> {
        let current_size = self.account.data_len();
        let required_size = data.required_size();
        
        // Only shrink if we can save significant space (>1KB)
        if current_size <= required_size + 1024 {
            return Ok(false);
        }
        
        let new_size = required_size
            .checked_add(T::GROWTH_FACTOR)
            .ok_or(ErrorCode::ConstraintRaw)?;
        
        if new_size >= current_size {
            return Ok(false);
        }
        
        // Reallocate to smaller size
        self.account.realloc(new_size, false)?;
        
        // Calculate rent to refund
        let rent = Rent::get()?;
        let old_minimum = rent.minimum_balance(current_size);
        let new_minimum = rent.minimum_balance(new_size);
        
        if old_minimum > new_minimum {
            let refund = old_minimum
                .checked_sub(new_minimum)
                .ok_or(ErrorCode::ConstraintRaw)?;
            
            // Transfer refund to payer
            **self.account.try_borrow_mut_lamports()? -= refund;
            **self.payer.try_borrow_mut_lamports()? += refund;
        }
        
        msg!("Shrank account from {} to {} bytes", current_size, new_size);
        Ok(true)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ReallocStats {
    pub total_reallocations: u32,
    pub total_bytes_allocated: u64,
    pub total_bytes_freed: u64,
    pub last_realloc_timestamp: i64,
}

impl Default for ReallocStats {
    fn default() -> Self {
        Self {
            total_reallocations: 0,
            total_bytes_allocated: 0,
            total_bytes_freed: 0,
            last_realloc_timestamp: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_realloc_stats() {
        let mut stats = ReallocStats::default();
        assert_eq!(stats.total_reallocations, 0);
        
        stats.total_reallocations += 1;
        stats.total_bytes_allocated += 1024;
        assert_eq!(stats.total_reallocations, 1);
        assert_eq!(stats.total_bytes_allocated, 1024);
    }
}