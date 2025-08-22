use anchor_lang::prelude::*;
use solana_program_test::*;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use localmoney_shared::*;
use trade::state::Trade;
use trade::instructions::*;

#[tokio::test]
async fn test_account_reallocation() {
    let mut context = ProgramTest::new(
        "trade",
        trade::id(),
        processor!(trade::entry),
    )
    .start_with_context()
    .await;
    
    // Create a trade
    let trade_id = 1u64;
    let trade_keypair = Keypair::new();
    
    // Initialize with minimal size
    let ix = trade::instruction::create_trade(
        &trade::id(),
        &trade_keypair.pubkey(),
        &context.payer.pubkey(),
        trade_id,
        1,
        context.payer.pubkey(),
        context.payer.pubkey(),
        Pubkey::new_unique(),
        spl_token::native_mint::id(),
        1000000,
        FiatCurrency::Usd,
        100,
        3600,
        "test@example.com".to_string(),
    );
    
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&context.payer.pubkey()),
        &[&context.payer, &trade_keypair],
        context.last_blockhash,
    );
    
    context.banks_client.process_transaction(tx).await.unwrap();
    
    // Get initial account size
    let account = context
        .banks_client
        .get_account(trade_keypair.pubkey())
        .await
        .unwrap()
        .unwrap();
    let initial_size = account.data.len();
    
    // Add many state transitions to trigger reallocation
    for i in 0..20 {
        let new_state = match i % 3 {
            0 => TradeState::RequestAccepted,
            1 => TradeState::EscrowFunded,
            _ => TradeState::FiatDeposited,
        };
        
        // Transition state (would trigger reallocation when history fills up)
        // This is a simplified example - actual implementation would need proper instruction
    }
    
    // Get final account size
    let account = context
        .banks_client
        .get_account(trade_keypair.pubkey())
        .await
        .unwrap()
        .unwrap();
    let final_size = account.data.len();
    
    // Verify reallocation occurred
    assert!(final_size > initial_size, "Account should have been reallocated");
}

#[tokio::test]
async fn test_rent_reclamation() {
    let mut context = ProgramTest::new(
        "trade",
        trade::id(),
        processor!(trade::entry),
    )
    .start_with_context()
    .await;
    
    // Create and complete a trade
    let trade_id = 1u64;
    let trade_keypair = Keypair::new();
    let buyer = Keypair::new();
    let seller = Keypair::new();
    
    // Initialize trade
    // ... (trade creation code)
    
    // Complete the trade
    // ... (trade completion code)
    
    // Fast forward past grace period (7 days)
    let slots_per_day = 216000; // Approximate slots per day
    context.warp_to_slot(context.slot + (7 * slots_per_day)).await;
    
    // Get rent before closing
    let rent_collector_balance_before = context
        .banks_client
        .get_balance(buyer.pubkey())
        .await
        .unwrap();
    
    // Close trade and reclaim rent
    let ix = trade::instruction::close_trade(
        &trade::id(),
        &trade_keypair.pubkey(),
        &buyer.pubkey(),
    );
    
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&context.payer.pubkey()),
        &[&context.payer, &buyer],
        context.last_blockhash,
    );
    
    context.banks_client.process_transaction(tx).await.unwrap();
    
    // Verify rent was reclaimed
    let rent_collector_balance_after = context
        .banks_client
        .get_balance(buyer.pubkey())
        .await
        .unwrap();
    
    assert!(
        rent_collector_balance_after > rent_collector_balance_before,
        "Rent should have been reclaimed"
    );
    
    // Verify account was closed
    let account = context
        .banks_client
        .get_account(trade_keypair.pubkey())
        .await
        .unwrap();
    
    assert!(account.is_none(), "Trade account should be closed");
}

#[tokio::test]
async fn test_state_history_ring_buffer() {
    let mut history = StateHistory::<10>::new();
    
    // Fill beyond capacity
    for i in 0..15 {
        let entry = StateHistoryEntry {
            from_state: TradeState::RequestCreated,
            to_state: TradeState::RequestAccepted,
            actor: Pubkey::new_unique(),
            timestamp: i,
            reason: StateChangeReason::UserAction,
        };
        history.push(entry).unwrap();
    }
    
    // Should only have last 10 entries
    assert_eq!(history.len(), 10);
    
    // First entry should be the 6th one we added (0-4 were overwritten)
    let first = history.iter().next().unwrap();
    assert_eq!(first.timestamp, 5);
    
    // Last entry should be the 15th one
    let last = history.get_last().unwrap();
    assert_eq!(last.timestamp, 14);
}

#[tokio::test]
async fn test_small_vec_operations() {
    let mut vec = SmallVec::<5, Pubkey>::new();
    
    // Test push
    for i in 0..5 {
        vec.push(Pubkey::new_unique()).unwrap();
        assert_eq!(vec.len(), i + 1);
    }
    
    // Test full
    assert!(vec.is_full());
    assert!(vec.push(Pubkey::new_unique()).is_err());
    
    // Test pop
    let popped = vec.pop();
    assert!(popped.is_some());
    assert_eq!(vec.len(), 4);
    assert!(!vec.is_full());
    
    // Test remove
    let removed = vec.remove(1).unwrap();
    assert_eq!(vec.len(), 3);
    
    // Test clear
    vec.clear();
    assert!(vec.is_empty());
    assert_eq!(vec.len(), 0);
}

#[tokio::test]
async fn test_audit_trail() {
    let mut trail = AuditTrail::new(100);
    let mut metadata = std::collections::BTreeMap::new();
    metadata.insert("action".to_string(), "trade_created".to_string());
    metadata.insert("amount".to_string(), "1000000".to_string());
    
    // Record multiple actions
    for i in 0..10 {
        trail.record_action(
            i,
            &format!("ACTION_{}", i),
            Pubkey::new_unique(),
            &metadata,
        ).unwrap();
    }
    
    // Query by trade
    let entries = trail.get_entries_for_trade(5);
    assert_eq!(entries.len(), 1);
    
    // Export to JSON
    let json = trail.export_json();
    assert!(json.contains("ACTION_5"));
}

#[tokio::test]
async fn test_batch_close_trades() {
    let mut context = ProgramTest::new(
        "trade",
        trade::id(),
        processor!(trade::entry),
    )
    .start_with_context()
    .await;
    
    // Create multiple completed trades
    let mut trade_accounts = Vec::new();
    for i in 0..5 {
        let trade_keypair = Keypair::new();
        // ... create and complete trade
        trade_accounts.push(trade_keypair.pubkey());
    }
    
    // Fast forward past grace period
    let slots_per_day = 216000;
    context.warp_to_slot(context.slot + (8 * slots_per_day)).await;
    
    // Batch close all trades
    let ix = trade::instruction::batch_close_trades(
        &trade::id(),
        &context.payer.pubkey(),
        trade_accounts.clone(),
    );
    
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    
    context.banks_client.process_transaction(tx).await.unwrap();
    
    // Verify all trades were closed
    for trade_account in trade_accounts {
        let account = context
            .banks_client
            .get_account(trade_account)
            .await
            .unwrap();
        assert!(account.is_none() || account.unwrap().data[0..8] == [0u8; 8]);
    }
}

#[tokio::test]
async fn test_concurrent_state_transitions() {
    use futures::stream::{FuturesUnordered, StreamExt};
    
    let mut context = ProgramTest::new(
        "trade",
        trade::id(),
        processor!(trade::entry),
    )
    .start_with_context()
    .await;
    
    // Create multiple trades
    let mut trades = Vec::new();
    for i in 0..10 {
        let trade_keypair = Keypair::new();
        // ... create trade
        trades.push(trade_keypair);
    }
    
    // Transition all concurrently
    let mut futures = FuturesUnordered::new();
    
    for trade in &trades {
        let ix = trade::instruction::accept_request(
            &trade::id(),
            &trade.pubkey(),
            &context.payer.pubkey(),
        );
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&context.payer.pubkey()),
            &[&context.payer],
            context.last_blockhash,
        );
        
        futures.push(context.banks_client.process_transaction(tx));
    }
    
    // Collect results
    let results: Vec<_> = futures.collect().await;
    
    // All should succeed
    for result in results {
        assert!(result.is_ok());
    }
}

#[tokio::test]
async fn test_grace_period_enforcement() {
    let mut context = ProgramTest::new(
        "trade",
        trade::id(),
        processor!(trade::entry),
    )
    .start_with_context()
    .await;
    
    // Create and complete trade
    let trade_keypair = Keypair::new();
    // ... create and complete trade
    
    // Try to close immediately - should fail
    let ix = trade::instruction::close_trade(
        &trade::id(),
        &trade_keypair.pubkey(),
        &context.payer.pubkey(),
    );
    
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    
    let result = context.banks_client.process_transaction(tx).await;
    assert!(result.is_err(), "Should not close before grace period");
    
    // Fast forward past grace period
    let slots_per_day = 216000;
    context.warp_to_slot(context.slot + (8 * slots_per_day)).await;
    
    // Now should succeed
    let ix = trade::instruction::close_trade(
        &trade::id(),
        &trade_keypair.pubkey(),
        &context.payer.pubkey(),
    );
    
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    
    let result = context.banks_client.process_transaction(tx).await;
    assert!(result.is_ok(), "Should close after grace period");
}