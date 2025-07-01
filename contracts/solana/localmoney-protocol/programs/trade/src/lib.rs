use anchor_lang::prelude::*;

declare_id!("AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM");

#[program]
pub mod trade {
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
