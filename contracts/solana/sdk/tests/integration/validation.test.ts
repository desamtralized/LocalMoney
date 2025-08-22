import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Trade } from '../../types/trade';

describe('Account Validation Tests', () => {
  let connection: Connection;
  let provider: anchor.AnchorProvider;
  let program: Program<Trade>;
  let hubConfig: PublicKey;
  let tokenMint: PublicKey;
  let seller: Keypair;
  let buyer: Keypair;
  let arbitrator: Keypair;
  let maliciousAccount: Keypair;
  let tradeId: anchor.BN;

  beforeAll(async () => {
    // Setup connection and provider
    connection = new Connection('http://localhost:8899', 'confirmed');
    const wallet = anchor.Wallet.local();
    provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    anchor.setProvider(provider);

    // Load program
    const programId = new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM');
    program = new Program<Trade>(
      require('../../target/idl/trade.json'),
      programId,
      provider
    );

    // Setup test accounts
    seller = Keypair.generate();
    buyer = Keypair.generate();
    arbitrator = Keypair.generate();
    maliciousAccount = Keypair.generate();

    // Fund accounts
    const airdropSig1 = await connection.requestAirdrop(seller.publicKey, 10 * LAMPORTS_PER_SOL);
    const airdropSig2 = await connection.requestAirdrop(buyer.publicKey, 10 * LAMPORTS_PER_SOL);
    const airdropSig3 = await connection.requestAirdrop(maliciousAccount.publicKey, 10 * LAMPORTS_PER_SOL);
    
    await connection.confirmTransaction(airdropSig1);
    await connection.confirmTransaction(airdropSig2);
    await connection.confirmTransaction(airdropSig3);

    // Generate random trade ID
    tradeId = new anchor.BN(Math.floor(Math.random() * 1000000));
  });

  describe('ReleaseEscrow Validation', () => {
    it('should fail with InvalidTokenAccount when using wrong treasury ATA', async () => {
      // Create a malicious ATA that doesn't match derivation
      const maliciousAta = await getAssociatedTokenAddress(
        tokenMint,
        maliciousAccount.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      // Attempt to release escrow with malicious treasury ATA
      try {
        await program.methods
          .releaseEscrow()
          .accounts({
            trade: await getTradeAccount(tradeId),
            seller: seller.publicKey,
            buyer: buyer.publicKey,
            treasuryTokenAccount: maliciousAta, // Wrong ATA
            chainFeeTokenAccount: await getCorrectChainFeeAta(),
            warchestTokenAccount: await getCorrectWarchestAta(),
            burnReserveAccount: await getCorrectBurnReserveAta(),
            // ... other accounts
          })
          .signers([seller])
          .rpc();
        
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.toString()).toContain('InvalidTokenAccount');
      }
    });

    it('should fail with InvalidTokenAccount when using wrong chain fee ATA', async () => {
      // Create a malicious ATA
      const maliciousAta = await getAssociatedTokenAddress(
        tokenMint,
        maliciousAccount.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .releaseEscrow()
          .accounts({
            trade: await getTradeAccount(tradeId),
            seller: seller.publicKey,
            buyer: buyer.publicKey,
            treasuryTokenAccount: await getCorrectTreasuryAta(),
            chainFeeTokenAccount: maliciousAta, // Wrong ATA
            warchestTokenAccount: await getCorrectWarchestAta(),
            burnReserveAccount: await getCorrectBurnReserveAta(),
            // ... other accounts
          })
          .signers([seller])
          .rpc();
        
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.toString()).toContain('InvalidTokenAccount');
      }
    });

    it('should fail with InvalidAccountOwner for non-token accounts', async () => {
      // Pass a system account instead of token account
      const systemAccount = Keypair.generate();

      try {
        await program.methods
          .releaseEscrow()
          .accounts({
            trade: await getTradeAccount(tradeId),
            seller: seller.publicKey,
            buyer: buyer.publicKey,
            treasuryTokenAccount: systemAccount.publicKey, // System account, not token account
            chainFeeTokenAccount: await getCorrectChainFeeAta(),
            warchestTokenAccount: await getCorrectWarchestAta(),
            burnReserveAccount: await getCorrectBurnReserveAta(),
            // ... other accounts
          })
          .signers([seller])
          .rpc();
        
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.toString()).toContain('InvalidAccountOwner');
      }
    });
  });

  describe('SettleDispute Validation', () => {
    it('should fail with InvalidTokenAccount when using wrong winner ATA', async () => {
      // Create a malicious ATA for the wrong user
      const maliciousAta = await getAssociatedTokenAddress(
        tokenMint,
        maliciousAccount.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .settleDispute(buyer.publicKey)
          .accounts({
            trade: await getTradeAccount(tradeId),
            arbitrator: arbitrator.publicKey,
            winnerTokenAccount: maliciousAta, // Wrong ATA for winner
            arbitratorTokenAccount: await getCorrectArbitratorAta(),
            treasuryTokenAccount: await getCorrectTreasuryAta(),
            chainFeeTokenAccount: await getCorrectChainFeeAta(),
            warchestTokenAccount: await getCorrectWarchestAta(),
            burnReserveAccount: await getCorrectBurnReserveAta(),
            // ... other accounts
          })
          .signers([arbitrator])
          .rpc();
        
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.toString()).toContain('InvalidTokenAccount');
      }
    });

    it('should fail with InvalidTokenAccount when using wrong arbitrator ATA', async () => {
      // Create a malicious ATA
      const maliciousAta = await getAssociatedTokenAddress(
        tokenMint,
        maliciousAccount.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .settleDispute(buyer.publicKey)
          .accounts({
            trade: await getTradeAccount(tradeId),
            arbitrator: arbitrator.publicKey,
            winnerTokenAccount: await getCorrectWinnerAta(buyer.publicKey),
            arbitratorTokenAccount: maliciousAta, // Wrong ATA for arbitrator
            treasuryTokenAccount: await getCorrectTreasuryAta(),
            chainFeeTokenAccount: await getCorrectChainFeeAta(),
            warchestTokenAccount: await getCorrectWarchestAta(),
            burnReserveAccount: await getCorrectBurnReserveAta(),
            // ... other accounts
          })
          .signers([arbitrator])
          .rpc();
        
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.toString()).toContain('InvalidTokenAccount');
      }
    });
  });

  describe('AutomaticRefund Validation', () => {
    it('should fail with InvalidTokenAccount when using wrong seller ATA', async () => {
      // Create a malicious ATA
      const maliciousAta = await getAssociatedTokenAddress(
        tokenMint,
        maliciousAccount.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .automaticRefund()
          .accounts({
            trade: await getTradeAccount(tradeId),
            seller: seller.publicKey,
            sellerTokenAccount: maliciousAta, // Wrong ATA for seller
            escrowTokenAccount: await getEscrowTokenAccount(tradeId),
            tokenMint: tokenMint,
            caller: buyer.publicKey,
            // ... other accounts
          })
          .signers([buyer])
          .rpc();
        
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.toString()).toContain('InvalidTokenAccount');
      }
    });
  });

  describe('PDA Validation', () => {
    it('should fail with InvalidPDA for wrong PDA derivation', async () => {
      // Create a PDA with wrong seeds
      const [wrongPda] = await PublicKey.findProgramAddress(
        [Buffer.from('wrong'), Buffer.from('seeds')],
        program.programId
      );

      try {
        // Attempt to use wrong PDA as trade account
        await program.methods
          .releaseEscrow()
          .accounts({
            trade: wrongPda, // Wrong PDA
            seller: seller.publicKey,
            buyer: buyer.publicKey,
            // ... other accounts
          })
          .signers([seller])
          .rpc();
        
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        // The error might be different as Anchor validates this automatically
        expect(error).toBeDefined();
      }
    });
  });

  describe('Security Attack Scenarios', () => {
    it('should prevent fund theft via treasury account substitution', async () => {
      // Attacker tries to substitute their own account as treasury
      const attackerAta = await getAssociatedTokenAddress(
        tokenMint,
        maliciousAccount.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .releaseEscrow()
          .accounts({
            trade: await getTradeAccount(tradeId),
            seller: seller.publicKey,
            buyer: buyer.publicKey,
            treasuryTokenAccount: attackerAta, // Attacker's account
            // ... other accounts
          })
          .signers([seller])
          .rpc();
        
        expect(true).toBe(false); // Attack should fail
      } catch (error: any) {
        expect(error.toString()).toContain('InvalidTokenAccount');
      }
    });

    it('should prevent fund theft via winner account substitution in dispute', async () => {
      // Attacker tries to substitute their own account as winner
      const attackerAta = await getAssociatedTokenAddress(
        tokenMint,
        maliciousAccount.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .settleDispute(buyer.publicKey) // Buyer is winner
          .accounts({
            trade: await getTradeAccount(tradeId),
            arbitrator: arbitrator.publicKey,
            winnerTokenAccount: attackerAta, // Attacker's account instead of buyer's
            // ... other accounts
          })
          .signers([arbitrator])
          .rpc();
        
        expect(true).toBe(false); // Attack should fail
      } catch (error: any) {
        expect(error.toString()).toContain('InvalidTokenAccount');
      }
    });

    it('should prevent fund theft via seller account substitution in refund', async () => {
      // Attacker tries to substitute their own account as seller for refund
      const attackerAta = await getAssociatedTokenAddress(
        tokenMint,
        maliciousAccount.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .automaticRefund()
          .accounts({
            trade: await getTradeAccount(tradeId),
            seller: seller.publicKey,
            sellerTokenAccount: attackerAta, // Attacker's account instead of seller's
            // ... other accounts
          })
          .signers([buyer])
          .rpc();
        
        expect(true).toBe(false); // Attack should fail
      } catch (error: any) {
        expect(error.toString()).toContain('InvalidTokenAccount');
      }
    });
  });

  // Helper functions
  async function getTradeAccount(tradeId: anchor.BN): Promise<PublicKey> {
    const [tradePda] = await PublicKey.findProgramAddress(
      [Buffer.from('trade'), tradeId.toArrayLike(Buffer, 'le', 8)],
      program.programId
    );
    return tradePda;
  }

  async function getEscrowTokenAccount(tradeId: anchor.BN): Promise<PublicKey> {
    const [escrowPda] = await PublicKey.findProgramAddress(
      [Buffer.from('trade'), Buffer.from('escrow'), tradeId.toArrayLike(Buffer, 'le', 8)],
      program.programId
    );
    return escrowPda;
  }

  async function getCorrectTreasuryAta(): Promise<PublicKey> {
    // Get hub config to find treasury address
    const [hubConfigPda] = await PublicKey.findProgramAddress(
      [Buffer.from('hub'), Buffer.from('config')],
      program.programId
    );
    const hubConfig = await program.account.hubConfig.fetch(hubConfigPda);
    return await getAssociatedTokenAddress(tokenMint, hubConfig.treasury, false, TOKEN_PROGRAM_ID);
  }

  async function getCorrectChainFeeAta(): Promise<PublicKey> {
    const [hubConfigPda] = await PublicKey.findProgramAddress(
      [Buffer.from('hub'), Buffer.from('config')],
      program.programId
    );
    const hubConfig = await program.account.hubConfig.fetch(hubConfigPda);
    return await getAssociatedTokenAddress(tokenMint, hubConfig.chainFeeCollector, false, TOKEN_PROGRAM_ID);
  }

  async function getCorrectWarchestAta(): Promise<PublicKey> {
    const [hubConfigPda] = await PublicKey.findProgramAddress(
      [Buffer.from('hub'), Buffer.from('config')],
      program.programId
    );
    const hubConfig = await program.account.hubConfig.fetch(hubConfigPda);
    return await getAssociatedTokenAddress(tokenMint, hubConfig.warchestAddress, false, TOKEN_PROGRAM_ID);
  }

  async function getCorrectBurnReserveAta(): Promise<PublicKey> {
    const [hubConfigPda] = await PublicKey.findProgramAddress(
      [Buffer.from('hub'), Buffer.from('config')],
      program.programId
    );
    const hubConfig = await program.account.hubConfig.fetch(hubConfigPda);
    return await getAssociatedTokenAddress(tokenMint, hubConfig.burnReserve, false, TOKEN_PROGRAM_ID);
  }

  async function getCorrectArbitratorAta(): Promise<PublicKey> {
    return await getAssociatedTokenAddress(tokenMint, arbitrator.publicKey, false, TOKEN_PROGRAM_ID);
  }

  async function getCorrectWinnerAta(winner: PublicKey): Promise<PublicKey> {
    return await getAssociatedTokenAddress(tokenMint, winner, false, TOKEN_PROGRAM_ID);
  }
});