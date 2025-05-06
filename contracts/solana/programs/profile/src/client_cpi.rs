use crate::instruction;
use crate::{state::ProfileConfig, ProfileData};
use anchor_lang::prelude::*;

pub mod accounts_def {
    use anchor_lang::prelude::*;

    #[derive(Accounts)]
    pub struct GetProfileConfig<'info> {
        /// CHECK: The profile config PDA account, type checked by a getter or the callee.
        pub profile_config: AccountInfo<'info>,
    }

    #[derive(Accounts)]
    pub struct GetProfile<'info> {
        /// CHECK: The profile PDA account, type checked by a getter or the callee.
        pub profile: AccountInfo<'info>,
    }

    #[derive(Accounts)]
    pub struct UpdateContact<'info> {
        /// CHECK: Authority for the CPI, typically the user signer. Verified by the callee program.
        pub authority: AccountInfo<'info>,
        /// CHECK: This is the account of the profile owner, used for PDA derivation and potentially as payer for init_if_needed.
        pub profile_owner: AccountInfo<'info>,
        /// CHECK: Profile config account. Type checked by callee (Profile program).
        pub profile_config: AccountInfo<'info>,
        /// CHECK: Profile data account (PDA). Type checked by callee.
        #[account(mut)]
        pub profile: AccountInfo<'info>,
        /// CHECK: System program. Type checked by callee.
        pub system_program: AccountInfo<'info>,
    }

    #[derive(Accounts)]
    pub struct UpdateTradesCount<'info> {
        /// CHECK: Authority for the CPI, typically the user signer. Verified by the callee program.
        pub authority: AccountInfo<'info>,
        /// CHECK: This is the account of the profile owner, used for PDA derivation.
        pub profile_owner: AccountInfo<'info>,
        /// CHECK: Profile config account. Type checked by callee.
        pub profile_config: AccountInfo<'info>,
        /// CHECK: Hub configuration account, read by the profile program to enforce limits.
        pub hub_config: AccountInfo<'info>,
        /// CHECK: Profile data account (PDA). Type checked by callee.
        #[account(mut)]
        pub profile: AccountInfo<'info>,
        /// CHECK: System program. Type checked by callee.
        pub system_program: AccountInfo<'info>,
    }

    #[derive(Accounts)]
    pub struct UpdateActiveOffers<'info> {
        /// CHECK: Authority for the CPI, typically the user signer. Verified by the callee program.
        pub authority: AccountInfo<'info>,
        /// CHECK: This is the account of the profile owner, used for PDA derivation.
        pub profile_owner: AccountInfo<'info>,
        /// CHECK: Profile config account. Type checked by callee.
        pub profile_config: AccountInfo<'info>,
        /// CHECK: Hub configuration account, read by the profile program to enforce limits.
        pub hub_config: AccountInfo<'info>,
        /// CHECK: Profile data account (PDA). Type checked by callee.
        #[account(mut)]
        pub profile: AccountInfo<'info>,
        /// CHECK: System program. Type checked by callee.
        pub system_program: AccountInfo<'info>,
    }
}

/// Get the profile config PDA address
pub fn get_profile_config_address(profile_program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"profile-config"], profile_program_id)
}

/// Get a profile PDA address by owner
pub fn get_profile_address(owner: &Pubkey, profile_program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"profile", owner.as_ref()], profile_program_id)
}

/// CPI to update contact
pub fn update_contact<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, accounts_def::UpdateContact<'info>>,
    contact: String,
    encryption_key: String,
) -> Result<()> {
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: *ctx.program.key,
        accounts: anchor_lang::ToAccountMetas::to_account_metas(&ctx.accounts, None),
        data: anchor_lang::InstructionData::data(&instruction::UpdateContact {
            contact,
            encryption_key,
        }),
    };
    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &ToAccountInfos::to_account_infos(&ctx.accounts),
        ctx.signer_seeds,
    )?;
    Ok(())
}

/// CPI to update trades count
pub fn update_trades_count<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, accounts_def::UpdateTradesCount<'info>>,
    trade_state: u8,
) -> Result<()> {
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: *ctx.program.key,
        accounts: anchor_lang::ToAccountMetas::to_account_metas(&ctx.accounts, None),
        data: anchor_lang::InstructionData::data(&instruction::UpdateTradesCount { trade_state }),
    };
    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &ToAccountInfos::to_account_infos(&ctx.accounts),
        ctx.signer_seeds,
    )?;
    Ok(())
}

/// CPI to update active offers
pub fn update_active_offers<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, accounts_def::UpdateActiveOffers<'info>>,
    offer_state: u8,
) -> Result<()> {
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: *ctx.program.key,
        accounts: anchor_lang::ToAccountMetas::to_account_metas(&ctx.accounts, None),
        data: anchor_lang::InstructionData::data(&instruction::UpdateActiveOffers { offer_state }),
    };
    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &ToAccountInfos::to_account_infos(&ctx.accounts),
        ctx.signer_seeds,
    )?;
    Ok(())
}
