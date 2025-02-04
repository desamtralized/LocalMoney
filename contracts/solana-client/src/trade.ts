import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { LocalMoneyClient } from './client';
import { Trade } from './types';
import { serialize } from 'borsh';

export class TradeClient extends LocalMoneyClient {
  /**
   * Create a new trade
   */
  async createTrade(
    tradeAccount: Keypair,
    tokenMint: PublicKey,
    escrowAccount: PublicKey,
    amount: bigint,
    price: bigint,
  ): Promise<string> {
    const instruction = await this.createTradeInstruction(
      tradeAccount.publicKey,
      tokenMint,
      escrowAccount,
      amount,
      price,
    );

    return await this.sendTransaction([instruction], [tradeAccount]);
  }

  /**
   * Accept a trade
   */
  async acceptTrade(tradeAccount: PublicKey): Promise<string> {
    const instruction = await this.acceptTradeInstruction(tradeAccount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Complete a trade
   */
  async completeTrade(
    tradeAccount: PublicKey,
    escrowAccount: PublicKey,
    sellerTokenAccount: PublicKey,
  ): Promise<string> {
    const instruction = await this.completeTradeInstruction(
      tradeAccount,
      escrowAccount,
      sellerTokenAccount,
    );
    return await this.sendTransaction([instruction]);
  }

  /**
   * Cancel a trade
   */
  async cancelTrade(
    tradeAccount: PublicKey,
    escrowAccount: PublicKey,
    sellerTokenAccount: PublicKey,
  ): Promise<string> {
    const instruction = await this.cancelTradeInstruction(
      tradeAccount,
      escrowAccount,
      sellerTokenAccount,
    );
    return await this.sendTransaction([instruction]);
  }

  /**
   * Dispute a trade
   */
  async disputeTrade(tradeAccount: PublicKey): Promise<string> {
    const instruction = await this.disputeTradeInstruction(tradeAccount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Get trade data
   */
  async getTrade(tradeAccount: PublicKey): Promise<Trade> {
    const data = await this.getAccountData(tradeAccount);
    // Deserialize the trade data here
    // This is a placeholder - you'll need to implement proper deserialization
    return {} as Trade;
  }

  private async createTradeInstruction(
    tradeAccount: PublicKey,
    tokenMint: PublicKey,
    escrowAccount: PublicKey,
    amount: bigint,
    price: bigint,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      {
        struct: {
          variant: 'string',
          amount: 'u64',
          price: 'u64',
        },
      },
      {
        variant: 'CreateTrade',
        amount,
        price,
      },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: tradeAccount, isSigner: true, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: escrowAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.TRADE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async acceptTradeInstruction(tradeAccount: PublicKey): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'AcceptTrade' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: tradeAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.TRADE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async completeTradeInstruction(
    tradeAccount: PublicKey,
    escrowAccount: PublicKey,
    sellerTokenAccount: PublicKey,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'CompleteTrade' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: tradeAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowAccount, isSigner: false, isWritable: true },
        { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.TRADE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async cancelTradeInstruction(
    tradeAccount: PublicKey,
    escrowAccount: PublicKey,
    sellerTokenAccount: PublicKey,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'CancelTrade' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: tradeAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowAccount, isSigner: false, isWritable: true },
        { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.TRADE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async disputeTradeInstruction(tradeAccount: PublicKey): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'DisputeTrade' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: tradeAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.TRADE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }
} 