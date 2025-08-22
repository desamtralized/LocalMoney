#![deny(arithmetic_overflow)]
#![deny(unused_must_use)]
#![deny(clippy::arithmetic_side_effects)]
#![forbid(unsafe_code)]

use anchor_lang::prelude::*;

declare_id!("5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM");

pub mod instructions;
pub mod state;
pub mod utils;
pub mod errors;
pub mod events;
pub mod vrf;
pub mod validation;

pub use instructions::*;
pub use state::*;
pub use errors::ErrorCode;
pub use events::*;

#[program]
pub mod trade {
    use super::*;

    pub fn create_trade(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
        instructions::create_trade::handler(ctx, params)
    }

    pub fn accept_request(ctx: Context<AcceptRequest>, seller_contact: String) -> Result<()> {
        instructions::accept_request::handler(ctx, seller_contact)
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        instructions::fund_escrow::handler(ctx)
    }

    pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
        instructions::release_escrow::handler(ctx)
    }

    // Note: Additional instructions like cancel_request, settle_dispute, etc. 
    // need to be extracted and added to the instructions module
}