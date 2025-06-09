use anchor_lang::prelude::*;

declare_id!("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");

#[program]
pub mod offer {
    use super::*;

    pub fn placeholder(_ctx: Context<Placeholder>) -> Result<()> {
        // Placeholder instruction to satisfy compiler
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Placeholder<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
}
