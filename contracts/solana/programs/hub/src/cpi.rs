use crate::HubConfig;
use anchor_lang::prelude::*;

/// CPI Context for fetching the Hub Configuration
#[derive(Accounts)]
pub struct GetHubConfig<'info> {
    /// The hub config PDA account
    pub hub_config: Account<'info, HubConfig>,
}

/// Helper functions to access Hub data from other programs via CPI
pub mod cpi {
    use super::*;

    /// Get the hub PDA address
    pub fn get_hub_address(hub_program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"hub"], hub_program_id)
    }

    /// Check if a PDA belongs to the Hub program's expected address pattern
    pub fn verify_hub_address(address: &Pubkey, hub_program_id: &Pubkey) -> Result<()> {
        let (expected_address, _) = get_hub_address(hub_program_id);
        require!(
            *address == expected_address,
            crate::HubError::InvalidHubAddress
        );
        Ok(())
    }
}
