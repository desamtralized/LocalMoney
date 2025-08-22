use anchor_lang::prelude::*;
use crate::errors::ErrorCode;

/// Enhanced fee information with multi-destination support
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct FeeInfo {
    // Core fee components
    pub burn_amount: u64,     // Amount to burn as LOCAL tokens
    pub chain_amount: u64,    // Amount for chain fee sharing
    pub warchest_amount: u64, // Amount for warchest/treasury
    
    // Token conversion fees
    pub conversion_fee: u64,   // Fee for DEX conversion operations
    pub slippage_reserve: u64, // Reserve for slippage protection
    
    // Metadata
    pub original_amount: u64,      // Original trade amount before fees
    pub requires_conversion: bool, // Whether token needs to be converted
    pub fee_calculation_method: FeeCalculationMethod,
}

impl FeeInfo {
    /// Total fees across all destinations
    pub fn total_fees(&self) -> u64 {
        self.burn_amount
            .saturating_add(self.chain_amount)
            .saturating_add(self.warchest_amount)
            .saturating_add(self.conversion_fee)
            .saturating_add(self.slippage_reserve)
    }
    
    /// Protocol fees only (excluding conversion fees)
    pub fn protocol_fees(&self) -> u64 {
        self.burn_amount
            .saturating_add(self.chain_amount)
            .saturating_add(self.warchest_amount)
    }
    
    /// Net amount after all fees
    pub fn net_amount(&self) -> u64 {
        self.original_amount.saturating_sub(self.total_fees())
    }
    
    /// Validate fee amounts don't exceed original amount
    pub fn validate(&self) -> Result<()> {
        require!(
            self.total_fees() <= self.original_amount,
            ErrorCode::ExcessiveFees
        );
        
        // Individual fee validation (max 10% each component)
        let max_individual_fee = self.original_amount / 10;
        
        require!(
            self.burn_amount <= max_individual_fee,
            ErrorCode::ExcessiveBurnFee
        );
        
        require!(
            self.chain_amount <= max_individual_fee,
            ErrorCode::ExcessiveChainFee
        );
        
        require!(
            self.warchest_amount <= max_individual_fee,
            ErrorCode::ExcessiveWarchestFee
        );
        
        require!(
            self.conversion_fee <= max_individual_fee,
            ErrorCode::ExcessiveConversionFee
        );
        
        Ok(())
    }
    
    /// Create new FeeInfo with validation
    pub fn new(
        original_amount: u64,
        burn_amount: u64,
        chain_amount: u64,
        warchest_amount: u64,
        conversion_fee: u64,
        slippage_reserve: u64,
        requires_conversion: bool,
        fee_calculation_method: FeeCalculationMethod,
    ) -> Result<Self> {
        let fee_info = Self {
            burn_amount,
            chain_amount,
            warchest_amount,
            conversion_fee,
            slippage_reserve,
            original_amount,
            requires_conversion,
            fee_calculation_method,
        };
        
        fee_info.validate()?;
        Ok(fee_info)
    }
}

/// Fee calculation methods
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum FeeCalculationMethod {
    /// Standard percentage-based fees
    Percentage,
    /// Dynamic fees based on trade parameters
    Dynamic,
    /// Tiered fees based on amount ranges
    Tiered,
    /// Market maker vs taker differentiated fees
    MakerTaker,
    /// Token-specific fee structure
    TokenSpecific,
}

/// Arbitration settlement fees
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct ArbitrationSettlementFees {
    pub winner_amount: u64,  // Amount distributed to dispute winner
    pub arbitrator_fee: u64, // Fee paid to arbitrator
    pub protocol_fee: u64,   // Protocol fees (burn + chain + warchest)
    
    // Additional fee components
    pub conversion_fee: u64,   // Fee for token conversions during settlement
    pub gas_compensation: u64, // Compensation for transaction costs
    pub penalty_fee: u64,      // Penalty fee for frivolous disputes
}

impl ArbitrationSettlementFees {
    pub fn total_distributed(&self) -> u64 {
        self.winner_amount
            .saturating_add(self.arbitrator_fee)
            .saturating_add(self.protocol_fee)
            .saturating_add(self.conversion_fee)
            .saturating_add(self.gas_compensation)
            .saturating_add(self.penalty_fee)
    }
    
    /// Validate arbitration fees
    pub fn validate(&self, original_amount: u64) -> Result<()> {
        require!(
            self.total_distributed() <= original_amount,
            ErrorCode::ExcessiveArbitrationFees
        );
        
        // Arbitrator fee should not exceed 10% of trade amount
        require!(
            self.arbitrator_fee <= original_amount / 10,
            ErrorCode::ExcessiveArbitratorFee
        );
        
        Ok(())
    }
}

/// Calculate standard fees for a trade amount
pub fn calculate_standard_fees(amount: u64) -> Result<FeeInfo> {
    // 1% burn fee
    let burn_amount = amount / 100;
    
    // 0.5% chain fee
    let chain_amount = amount / 200;
    
    // 0.5% warchest fee
    let warchest_amount = amount / 200;
    
    FeeInfo::new(
        amount,
        burn_amount,
        chain_amount,
        warchest_amount,
        0, // No conversion fee for LOCAL tokens
        0, // No slippage reserve for LOCAL tokens
        false, // No conversion required
        FeeCalculationMethod::Percentage,
    )
}

/// Calculate dynamic fees based on trade parameters
pub fn calculate_dynamic_fees(
    amount: u64,
    is_maker: bool,
    volume_tier: u8,
    requires_conversion: bool,
) -> Result<FeeInfo> {
    // Base fees with maker/taker differentiation
    let base_fee_bps = if is_maker { 15 } else { 25 }; // 0.15% maker, 0.25% taker
    
    // Volume discount
    let discount_bps = match volume_tier {
        0 => 0,
        1 => 5,  // 0.05% discount
        2 => 10, // 0.10% discount
        3 => 15, // 0.15% discount
        _ => 20, // 0.20% max discount
    };
    
    let effective_fee_bps = base_fee_bps.saturating_sub(discount_bps);
    let total_protocol_fee = (amount * effective_fee_bps as u64) / 10000;
    
    // Split protocol fee into components
    let burn_amount = total_protocol_fee * 50 / 100; // 50% burn
    let chain_amount = total_protocol_fee * 25 / 100; // 25% chain
    let warchest_amount = total_protocol_fee * 25 / 100; // 25% warchest
    
    // Add conversion fees if needed
    let (conversion_fee, slippage_reserve) = if requires_conversion {
        let conv_fee = amount * 10 / 10000; // 0.10% conversion fee
        let slippage = amount * 50 / 10000; // 0.50% slippage reserve
        (conv_fee, slippage)
    } else {
        (0, 0)
    };
    
    FeeInfo::new(
        amount,
        burn_amount,
        chain_amount,
        warchest_amount,
        conversion_fee,
        slippage_reserve,
        requires_conversion,
        FeeCalculationMethod::Dynamic,
    )
}