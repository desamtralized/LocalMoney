use anchor_lang::prelude::*;

declare_id!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

#[program]
pub mod price {
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
