import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { LocalMoneyClient } from './client';
import { HubConfig } from './types';
import { serialize } from 'borsh';

export class HubClient extends LocalMoneyClient {
  /**
   * Initialize hub
   */
  async initialize(
    configAccount: Keypair,
    priceProgram: PublicKey,
    tradeProgram: PublicKey,
    profileProgram: PublicKey,
    offerProgram: PublicKey,
    feeAccount: PublicKey,
    feeBasisPoints: number,
  ): Promise<string> {
    const instruction = await this.initializeInstruction(
      configAccount.publicKey,
      priceProgram,
      tradeProgram,
      profileProgram,
      offerProgram,
      feeAccount,
      feeBasisPoints,
    );

    return await this.sendTransaction([instruction], [configAccount]);
  }

  /**
   * Update hub configuration
   */
  async updateConfig(
    configAccount: PublicKey,
    feeBasisPoints?: number,
    feeAccount?: PublicKey,
  ): Promise<string> {
    const instruction = await this.updateConfigInstruction(
      configAccount,
      feeBasisPoints,
      feeAccount,
    );

    return await this.sendTransaction([instruction]);
  }

  /**
   * Pause operations
   */
  async pauseOperations(configAccount: PublicKey): Promise<string> {
    const instruction = await this.pauseOperationsInstruction(configAccount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Resume operations
   */
  async resumeOperations(configAccount: PublicKey): Promise<string> {
    const instruction = await this.resumeOperationsInstruction(configAccount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Transfer admin
   */
  async transferAdmin(
    configAccount: PublicKey,
    newAdmin: PublicKey,
  ): Promise<string> {
    const instruction = await this.transferAdminInstruction(configAccount, newAdmin);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Collect fees
   */
  async collectFees(
    configAccount: PublicKey,
    feeAccount: PublicKey,
  ): Promise<string> {
    const instruction = await this.collectFeesInstruction(configAccount, feeAccount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Get hub config
   */
  async getConfig(configAccount: PublicKey): Promise<HubConfig> {
    const data = await this.getAccountData(configAccount);
    // Deserialize the config data here
    // This is a placeholder - you'll need to implement proper deserialization
    return {} as HubConfig;
  }

  private async initializeInstruction(
    configAccount: PublicKey,
    priceProgram: PublicKey,
    tradeProgram: PublicKey,
    profileProgram: PublicKey,
    offerProgram: PublicKey,
    feeAccount: PublicKey,
    feeBasisPoints: number,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      {
        struct: {
          variant: 'string',
          priceProgram: 'pubkey',
          tradeProgram: 'pubkey',
          profileProgram: 'pubkey',
          offerProgram: 'pubkey',
          feeAccount: 'pubkey',
          feeBasisPoints: 'u16',
        },
      },
      {
        variant: 'Initialize',
        priceProgram,
        tradeProgram,
        profileProgram,
        offerProgram,
        feeAccount,
        feeBasisPoints,
      },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: configAccount, isSigner: true, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.HUB_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async updateConfigInstruction(
    configAccount: PublicKey,
    feeBasisPoints?: number,
    feeAccount?: PublicKey,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      {
        struct: {
          variant: 'string',
          feeBasisPoints: 'u16?',
          feeAccount: 'pubkey?',
        },
      },
      {
        variant: 'UpdateConfig',
        feeBasisPoints,
        feeAccount,
      },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: configAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.HUB_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async pauseOperationsInstruction(configAccount: PublicKey): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'PauseOperations' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: configAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.HUB_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async resumeOperationsInstruction(configAccount: PublicKey): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'ResumeOperations' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: configAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.HUB_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async transferAdminInstruction(
    configAccount: PublicKey,
    newAdmin: PublicKey,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      {
        struct: {
          variant: 'string',
          newAdmin: 'pubkey',
        },
      },
      {
        variant: 'TransferAdmin',
        newAdmin,
      },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: configAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
        { pubkey: newAdmin, isSigner: false, isWritable: false },
      ],
      programId: this.HUB_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async collectFeesInstruction(
    configAccount: PublicKey,
    feeAccount: PublicKey,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      { struct: { variant: 'string' } },
      { variant: 'CollectFees' },
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: configAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
        { pubkey: feeAccount, isSigner: false, isWritable: true },
      ],
      programId: this.HUB_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }
} 