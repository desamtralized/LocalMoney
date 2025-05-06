use crate::{state::OfferConfig, Offer};
use anchor_lang::prelude::*;

/// CPI Context for fetching the Offer Configuration
#[derive(Accounts)]
pub struct GetOfferConfig<'info> {
    /// The offer config PDA account
    pub offer_config: Account<'info, OfferConfig>,
}

/// CPI Context for fetching an Offer
#[derive(Accounts)]
pub struct GetOffer<'info> {
    /// The offer PDA account
    pub offer: Account<'info, Offer>,
}

/// Helper functions to access Offer data from other programs via CPI
pub mod cpi {
    use super::*;

    /// Get the offer config PDA address
    pub fn get_offer_config_address(offer_program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"offer-config"], offer_program_id)
    }

    /// Get an offer PDA address by ID
    pub fn get_offer_address(offer_id: u64, offer_program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"offer", &offer_id.to_le_bytes()], offer_program_id)
    }
}
