use anchor_lang::prelude::*;

// PDA seed constants
pub const SEED_PREFIX: &[u8] = b"localmoney";
pub const SEED_TRADE: &[u8] = b"trade";
pub const SEED_ESCROW: &[u8] = b"escrow";
pub const SEED_HISTORY: &[u8] = b"history";
pub const SEED_VRF: &[u8] = b"vrf";
pub const SEED_ARBITRATOR_POOL: &[u8] = b"arbitrator_pool";
pub const SEED_CONVERSION_ROUTE: &[u8] = b"conversion_route";
pub const SEED_TRADE_QUERY: &[u8] = b"trade_query";
pub const SEED_PAGINATED_TRADES: &[u8] = b"paginated_trades";

// Helper functions for PDA derivation
pub fn derive_trade_pda(trade_id: u64, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SEED_PREFIX,
            SEED_TRADE,
            trade_id.to_le_bytes().as_ref(),
        ],
        program_id,
    )
}

pub fn derive_escrow_pda(trade_id: u64, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SEED_PREFIX,
            SEED_TRADE,
            trade_id.to_le_bytes().as_ref(),
            SEED_ESCROW,
        ],
        program_id,
    )
}

pub fn derive_history_pda(trade_id: u64, page: u8, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SEED_PREFIX,
            SEED_TRADE,
            trade_id.to_le_bytes().as_ref(),
            SEED_HISTORY,
            &[page],
        ],
        program_id,
    )
}

pub fn derive_arbitrator_pool_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SEED_PREFIX,
            SEED_ARBITRATOR_POOL,
        ],
        program_id,
    )
}

pub fn derive_conversion_route_pda(source_mint: &Pubkey, target_mint: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SEED_PREFIX,
            SEED_CONVERSION_ROUTE,
            source_mint.as_ref(),
            target_mint.as_ref(),
        ],
        program_id,
    )
}

pub fn derive_vrf_pda(trade_id: u64, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SEED_PREFIX,
            SEED_VRF,
            trade_id.to_le_bytes().as_ref(),
        ],
        program_id,
    )
}

pub fn derive_paginated_trades_pda(participant: &Pubkey, page: u32, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SEED_PREFIX,
            SEED_PAGINATED_TRADES,
            participant.as_ref(),
            page.to_le_bytes().as_ref(),
        ],
        program_id,
    )
}