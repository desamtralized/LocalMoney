## FEATURE:

- Integrate SPL Token and Token-2022 programs for all token operations
- Implement multi-token support (USDC, USDT, native SOL wrapping)
- Create token account management and initialization patterns
- Build Associated Token Account (ATA) creation and management
- Implement transfer fees and royalty mechanisms using Token-2022 extensions
- Create token swap integration for cross-token trades
- Handle token decimal normalization and amount calculations
- Implement token metadata integration for verified token lists

## EXAMPLES:

```rust
// Token transfer with escrow
pub fn escrow_token_transfer(
    ctx: Context<EscrowTransfer>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = Transfer {
        from: ctx.accounts.seller_token_account.to_account_info(),
        to: ctx.accounts.escrow_token_account.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;
    Ok(())
}

// ATA initialization pattern
let (ata_pubkey, _) = Pubkey::find_program_address(
    &[
        user.key().as_ref(),
        token_program.key().as_ref(),
        mint.key().as_ref(),
    ],
    &associated_token::ID,
);
```

## DOCUMENTATION:

SPL Token Program: https://spl.solana.com/token
Token-2022 Program: https://spl.solana.com/token-2022
Associated Token Account: https://spl.solana.com/associated-token-account
Token Metadata: https://docs.metaplex.com/programs/token-metadata/
Jupiter Aggregator Docs: https://docs.jup.ag/
Orca Whirlpool: https://orca-so.gitbook.io/orca-developer-portal/
Token List Standard: https://github.com/solana-labs/token-list
Transfer Hooks: https://github.com/solana-labs/solana-program-library/tree/master/token/transfer-hook

## OTHER CONSIDERATIONS:

- **Token Validation**: Maintain allowlist of verified token mints to prevent scams
- **Decimal Handling**: Store token decimals on-chain for proper amount calculations
- **Frozen Accounts**: Check for frozen token accounts before initiating transfers
- **Close Authority**: Properly handle token account closure and rent reclamation
- **Token-2022 Extensions**: Leverage transfer fees, interest bearing tokens where applicable
- **Minimum Balance**: Ensure token accounts maintain rent-exempt minimum balance
- **Oracle Price Feeds**: Integrate Pyth or Switchboard for token price discovery
- **Slippage Protection**: Implement maximum slippage checks for swap operations
- **MEV Protection**: Use commitment levels and transaction ordering to prevent front-running

## RELATED PROJECTS:

- **Raydium**: AMM with comprehensive token swap and liquidity provision patterns. https://github.com/raydium-io/raydium-sdk
- **Saber**: Stablecoin exchange demonstrating efficient stable swap algorithms. https://github.com/saber-hq/stable-swap
- **Port Finance**: Lending protocol with sophisticated token collateral management. https://github.com/port-finance/variable-rate-lending