import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { LocalMoneyClient } from './client';
import { Offer, PaymentMethod } from './types';
import { serialize } from 'borsh';

export class OfferClient extends LocalMoneyClient {
  /**
   * Create a new offer
   */
  async createOffer(
    offerAccount: Keypair,
    tokenMint: PublicKey,
    amount: bigint,
    pricePerToken: bigint,
    minAmount: bigint,
    maxAmount: bigint,
    paymentMethod: PaymentMethod,
  ): Promise<string> {
    const instruction = await this.createOfferInstruction(
      offerAccount.publicKey,
      tokenMint,
      amount,
      pricePerToken,
      minAmount,
      maxAmount,
      paymentMethod,
    );

    return await this.sendTransaction([instruction], [offerAccount]);
  }

  /**
   * Update an offer
   */
  async updateOffer(
    offerAccount: PublicKey,
    pricePerToken?: bigint,
    minAmount?: bigint,
    maxAmount?: bigint,
    paymentMethod?: PaymentMethod,
  ): Promise<string> {
    const instruction = await this.updateOfferInstruction(
      offerAccount,
      pricePerToken,
      minAmount,
      maxAmount,
      paymentMethod,
    );

    return await this.sendTransaction([instruction]);
  }

  /**
   * Pause an offer
   */
  async pauseOffer(offerAccount: PublicKey): Promise<string> {
    const instruction = await this.pauseOfferInstruction(offerAccount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Resume an offer
   */
  async resumeOffer(offerAccount: PublicKey): Promise<string> {
    const instruction = await this.resumeOfferInstruction(offerAccount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Close an offer
   */
  async closeOffer(offerAccount: PublicKey): Promise<string> {
    const instruction = await this.closeOfferInstruction(offerAccount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Take an offer
   */
  async takeOffer(offerAccount: PublicKey, amount: bigint): Promise<string> {
    const instruction = await this.takeOfferInstruction(offerAccount, amount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Get offer data
   */
  async getOffer(offerAccount: PublicKey): Promise<Offer> {
    const data = await this.getAccountData(offerAccount);
    // Deserialize the offer data here
    // This is a placeholder - you'll need to implement proper deserialization
    return {} as Offer;
  }

  private async createOfferInstruction(
    offerAccount: PublicKey,
    tokenMint: PublicKey,
    amount: bigint,
    pricePerToken: bigint,
    minAmount: bigint,
    maxAmount: bigint,
    paymentMethod: PaymentMethod,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      {
        struct: {
          variant: 'string',
          amount: 'u64',
          pricePerToken: 'u64',
          minAmount: 'u64',
          maxAmount: 'u64',
          paymentMethod: {
            struct: {
              type: 'string',
              bankName: 'string?',
              accountInfo: 'string?',
              provider: 'string?',
              phoneNumber: 'string?',
              name: 'string?',
              details: 'string?',
            },
          },
        },
      },
      {
        variant: 'CreateOffer',
        amount,
        pricePerToken,
        minAmount,
        maxAmount,
        paymentMethod,
      },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: offerAccount, isSigner: true, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.OFFER_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async updateOfferInstruction(
    offerAccount: PublicKey,
    pricePerToken?: bigint,
    minAmount?: bigint,
    maxAmount?: bigint,
    paymentMethod?: PaymentMethod,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      {
        struct: {
          variant: 'string',
          pricePerToken: 'u64?',
          minAmount: 'u64?',
          maxAmount: 'u64?',
          paymentMethod: {
            struct: {
              type: 'string?',
              bankName: 'string?',
              accountInfo: 'string?',
              provider: 'string?',
              phoneNumber: 'string?',
              name: 'string?',
              details: 'string?',
            },
          },
        },
      },
      {
        variant: 'UpdateOffer',
        pricePerToken,
        minAmount,
        maxAmount,
        paymentMethod,
      },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: offerAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.OFFER_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async pauseOfferInstruction(offerAccount: PublicKey): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'PauseOffer' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: offerAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.OFFER_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async resumeOfferInstruction(offerAccount: PublicKey): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'ResumeOffer' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: offerAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.OFFER_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async closeOfferInstruction(offerAccount: PublicKey): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'CloseOffer' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: offerAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.OFFER_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async takeOfferInstruction(
    offerAccount: PublicKey,
    amount: bigint,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string', amount: 'u64' } },
      { variant: 'TakeOffer', amount },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: offerAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: true },
        { pubkey: this.TRADE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.OFFER_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }
} 