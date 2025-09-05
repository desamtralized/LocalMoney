# EVM to Solana Code Translation Examples

## 1. Escrow Implementation

### EVM (Solidity)
```solidity
contract Escrow {
    mapping(bytes32 => EscrowDeposit) public deposits;
    
    function deposit(
        bytes32 tradeId,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(deposits[tradeId].amount == 0, "Already deposited");
        
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        
        deposits[tradeId] = EscrowDeposit({
            depositor: msg.sender,
            token: token,
            amount: amount,
            timestamp: block.timestamp
        });
        
        emit Deposited(tradeId, msg.sender, amount);
    }
}
```

### Solana (Anchor)
```rust
#[program]
pub mod escrow {
    use anchor_spl::token::{self, Token, TokenAccount, Transfer};
    
    pub fn deposit(
        ctx: Context<Deposit>,
        trade_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        // Initialize escrow state
        escrow.trade_id = trade_id;
        escrow.depositor = ctx.accounts.depositor.key();
        escrow.token_mint = ctx.accounts.token_mint.key();
        escrow.amount = amount;
        escrow.timestamp = Clock::get()?.unix_timestamp;
        
        // Transfer tokens to escrow PDA
        let cpi_accounts = Transfer {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, amount)?;
        
        emit!(Deposited {
            trade_id,
            depositor: ctx.accounts.depositor.key(),
            amount,
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(trade_id: [u8; 32])]
pub struct Deposit<'info> {
    #[account(
        init,
        payer = depositor,
        space = 8 + EscrowState::SIZE,
        seeds = [b"escrow", trade_id.as_ref()],
        bump
    )]
    pub escrow: Account<'info, EscrowState>,
    
    #[account(
        init,
        payer = depositor,
        token::mint = token_mint,
        token::authority = escrow,
        seeds = [b"escrow-vault", trade_id.as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub depositor_token_account: Account<'info, TokenAccount>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub depositor: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

## 2. Access Control & Roles

### EVM (Solidity)
```solidity
contract Hub is AccessControlUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not admin");
        _;
    }
    
    function updateFees(uint256 newFee) external onlyAdmin {
        require(newFee <= MAX_FEE, "Fee too high");
        platformFee = newFee;
    }
}
```

### Solana (Anchor)
```rust
#[program]
pub mod hub {
    pub fn update_fees(
        ctx: Context<UpdateFees>,
        new_fee: u16,
    ) -> Result<()> {
        require!(new_fee <= MAX_FEE, ErrorCode::FeeTooHigh);
        
        let hub = &mut ctx.accounts.hub;
        hub.platform_fee = new_fee;
        
        emit!(FeesUpdated {
            old_fee: hub.platform_fee,
            new_fee,
            updated_by: ctx.accounts.admin.key(),
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateFees<'info> {
    #[account(
        mut,
        seeds = [b"hub"],
        bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub hub: Account<'info, HubState>,
    
    pub admin: Signer<'info>,
}

// Alternative: Custom constraint
fn check_admin(hub: &HubState, signer: Pubkey) -> Result<()> {
    require_keys_eq!(hub.admin, signer, ErrorCode::Unauthorized);
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFeesAlt<'info> {
    #[account(
        mut,
        seeds = [b"hub"],
        bump,
        constraint = check_admin(&hub, admin.key()).is_ok() @ ErrorCode::Unauthorized
    )]
    pub hub: Account<'info, HubState>,
    
    pub admin: Signer<'info>,
}
```

## 3. Timelock Implementation

### EVM (Solidity)
```solidity
contract Hub {
    TimelockController public timelockController;
    
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        view 
    {
        require(
            msg.sender == address(timelockController),
            "Only timelock can upgrade"
        );
    }
}
```

### Solana (Anchor)
```rust
#[account]
pub struct Timelock {
    pub admin: Pubkey,
    pub delay: i64,  // seconds
    pub proposal_count: u64,
}

#[account]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub target_program: Pubkey,
    pub instruction_data: Vec<u8>,
    pub eta: i64,  // execution time
    pub executed: bool,
    pub cancelled: bool,
}

#[program]
pub mod timelock {
    pub fn queue_transaction(
        ctx: Context<QueueTransaction>,
        target_program: Pubkey,
        instruction_data: Vec<u8>,
    ) -> Result<()> {
        let timelock = &mut ctx.accounts.timelock;
        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;
        
        proposal.id = timelock.proposal_count;
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.target_program = target_program;
        proposal.instruction_data = instruction_data;
        proposal.eta = clock.unix_timestamp + timelock.delay;
        proposal.executed = false;
        proposal.cancelled = false;
        
        timelock.proposal_count += 1;
        
        emit!(ProposalQueued {
            id: proposal.id,
            eta: proposal.eta,
        });
        
        Ok(())
    }
    
    pub fn execute_transaction(
        ctx: Context<ExecuteTransaction>,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;
        
        require!(!proposal.executed, ErrorCode::AlreadyExecuted);
        require!(!proposal.cancelled, ErrorCode::ProposalCancelled);
        require!(
            clock.unix_timestamp >= proposal.eta,
            ErrorCode::TimelockNotMet
        );
        
        // Execute the instruction via CPI
        let ix = Instruction {
            program_id: proposal.target_program,
            accounts: ctx.remaining_accounts.to_vec(),
            data: proposal.instruction_data.clone(),
        };
        
        invoke(&ix, ctx.remaining_accounts)?;
        
        proposal.executed = true;
        
        emit!(ProposalExecuted {
            id: proposal.id,
            executor: ctx.accounts.executor.key(),
        });
        
        Ok(())
    }
}
```

## 4. Oracle Integration

### EVM (Solidity)
```solidity
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract PriceOracle {
    mapping(address => AggregatorV3Interface) public priceFeeds;
    
    function getLatestPrice(address token) public view returns (uint256) {
        AggregatorV3Interface priceFeed = priceFeeds[token];
        (, int256 price,,,) = priceFeed.latestRoundData();
        return uint256(price);
    }
}
```

### Solana (Anchor)
```rust
use pyth_sdk_solana::load_price_feed_from_account_info;

#[program]
pub mod price_oracle {
    pub fn get_price(
        ctx: Context<GetPrice>,
    ) -> Result<PriceData> {
        let price_account_info = &ctx.accounts.price_feed;
        let price_feed = load_price_feed_from_account_info(price_account_info)
            .map_err(|_| ErrorCode::InvalidPriceFeed)?;
            
        let current_price = price_feed
            .get_current_price()
            .ok_or(ErrorCode::PriceUnavailable)?;
            
        Ok(PriceData {
            price: current_price.price,
            confidence: current_price.conf,
            expo: current_price.expo,
            timestamp: Clock::get()?.unix_timestamp,
        })
    }
}

#[derive(Accounts)]
pub struct GetPrice<'info> {
    /// CHECK: Validated by Pyth SDK
    pub price_feed: AccountInfo<'info>,
}

// Alternative: Switchboard Oracle
use switchboard_solana::AggregatorAccountData;

pub fn get_switchboard_price(
    ctx: Context<GetSwitchboardPrice>,
) -> Result<f64> {
    let feed = &ctx.accounts.aggregator.load()?;
    let price = feed.get_result()
        .map_err(|_| ErrorCode::PriceUnavailable)?;
    Ok(price)
}
```

## 5. Fee Distribution

### EVM (Solidity)
```solidity
library FeeCalculations {
    function calculateAndDistribute(
        uint256 amount,
        FeeStructure memory fees
    ) internal returns (uint256 remaining) {
        uint256 platformFee = (amount * fees.platformRate) / 10000;
        uint256 burnFee = (amount * fees.burnRate) / 10000;
        
        // Transfer platform fee
        IERC20(token).transfer(treasury, platformFee);
        
        // Burn tokens
        ILocalToken(token).burn(burnFee);
        
        return amount - platformFee - burnFee;
    }
}
```

### Solana (Anchor)
```rust
pub mod fee_utils {
    use anchor_spl::token::{self, Burn, Transfer};
    
    pub fn distribute_fees(
        amount: u64,
        fee_structure: &FeeStructure,
        token_program: AccountInfo,
        // Account references
        source: AccountInfo,
        treasury: AccountInfo,
        burn_account: AccountInfo,
        authority: AccountInfo,
    ) -> Result<u64> {
        let platform_fee = amount
            .checked_mul(fee_structure.platform_rate as u64)
            .unwrap()
            .checked_div(10000)
            .unwrap();
            
        let burn_fee = amount
            .checked_mul(fee_structure.burn_rate as u64)
            .unwrap()
            .checked_div(10000)
            .unwrap();
        
        // Transfer to treasury
        if platform_fee > 0 {
            let cpi_accounts = Transfer {
                from: source.clone(),
                to: treasury,
                authority: authority.clone(),
            };
            let cpi_ctx = CpiContext::new(token_program.clone(), cpi_accounts);
            token::transfer(cpi_ctx, platform_fee)?;
        }
        
        // Burn tokens
        if burn_fee > 0 {
            let cpi_accounts = Burn {
                mint: burn_account,
                from: source.clone(),
                authority: authority.clone(),
            };
            let cpi_ctx = CpiContext::new(token_program, cpi_accounts);
            token::burn(cpi_ctx, burn_fee)?;
        }
        
        Ok(amount - platform_fee - burn_fee)
    }
}
```

## 6. Trade State Machine

### EVM (Solidity)
```solidity
enum TradeStatus {
    INITIATED,
    ACCEPTED,
    FUNDED,
    PAID,
    RELEASED,
    DISPUTED,
    CANCELLED
}

contract Trade {
    function updateStatus(bytes32 tradeId, TradeStatus newStatus) internal {
        TradeData storage trade = trades[tradeId];
        
        require(isValidTransition(trade.status, newStatus), "Invalid transition");
        
        TradeStatus oldStatus = trade.status;
        trade.status = newStatus;
        trade.lastUpdate = block.timestamp;
        
        emit StatusChanged(tradeId, oldStatus, newStatus);
    }
}
```

### Solana (Anchor)
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TradeStatus {
    Initiated,
    Accepted,
    Funded,
    Paid,
    Released,
    Disputed,
    Cancelled,
}

impl TradeStatus {
    pub fn is_valid_transition(&self, new_status: &TradeStatus) -> bool {
        match (self, new_status) {
            (TradeStatus::Initiated, TradeStatus::Accepted) => true,
            (TradeStatus::Initiated, TradeStatus::Cancelled) => true,
            (TradeStatus::Accepted, TradeStatus::Funded) => true,
            (TradeStatus::Accepted, TradeStatus::Cancelled) => true,
            (TradeStatus::Funded, TradeStatus::Paid) => true,
            (TradeStatus::Funded, TradeStatus::Disputed) => true,
            (TradeStatus::Paid, TradeStatus::Released) => true,
            (TradeStatus::Paid, TradeStatus::Disputed) => true,
            _ => false,
        }
    }
}

#[program]
pub mod trade {
    pub fn update_status(
        ctx: Context<UpdateStatus>,
        new_status: TradeStatus,
    ) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        
        require!(
            trade.status.is_valid_transition(&new_status),
            ErrorCode::InvalidStatusTransition
        );
        
        let old_status = trade.status.clone();
        trade.status = new_status.clone();
        trade.last_update = Clock::get()?.unix_timestamp;
        
        emit!(StatusChanged {
            trade_id: trade.id,
            old_status,
            new_status,
            updated_by: ctx.accounts.signer.key(),
        });
        
        Ok(())
    }
}
```

## 7. Batch Operations

### EVM (Solidity)
```solidity
contract BatchOperations {
    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length == amounts.length, "Length mismatch");
        
        for (uint i = 0; i < recipients.length; i++) {
            IERC20(token).transferFrom(msg.sender, recipients[i], amounts[i]);
        }
    }
}
```

### Solana (Anchor)
```rust
#[program]
pub mod batch_operations {
    pub fn batch_transfer(
        ctx: Context<BatchTransfer>,
        transfers: Vec<TransferData>,
    ) -> Result<()> {
        require!(
            transfers.len() <= MAX_BATCH_SIZE,
            ErrorCode::BatchTooLarge
        );
        
        for transfer in transfers.iter() {
            // Use remaining_accounts for dynamic recipient accounts
            let recipient_index = transfer.recipient_index as usize;
            require!(
                recipient_index < ctx.remaining_accounts.len(),
                ErrorCode::InvalidRecipient
            );
            
            let recipient = &ctx.remaining_accounts[recipient_index];
            
            let cpi_accounts = Transfer {
                from: ctx.accounts.source.to_account_info(),
                to: recipient.clone(),
                authority: ctx.accounts.authority.to_account_info(),
            };
            
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            
            token::transfer(cpi_ctx, transfer.amount)?;
        }
        
        emit!(BatchTransferCompleted {
            count: transfers.len() as u32,
            total_amount: transfers.iter().map(|t| t.amount).sum(),
        });
        
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TransferData {
    pub recipient_index: u8,  // Index in remaining_accounts
    pub amount: u64,
}
```

## Key Differences Summary

| Feature | EVM | Solana |
|---------|-----|--------|
| State Storage | Contract storage slots | PDA accounts |
| Upgrades | Proxy patterns | Native upgrade authority |
| Access Control | Modifiers & roles | Constraints & has_one |
| Token Transfers | ERC20 interface | SPL Token CPI |
| Events | Event logs | Anchor events |
| Randomness | Chainlink VRF | Switchboard VRF |
| Cross-contract calls | External calls | Cross-Program Invocation |
| Reentrancy | Guards needed | Not possible |
| Gas optimization | Critical | Compute units |
| Account limits | None | 10MB per account |

---

*These examples demonstrate the core patterns for migrating from EVM to Solana. Each pattern maintains the same business logic while adapting to Solana's account-based architecture.*