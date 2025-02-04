import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { LocalMoneyClient } from './client';
import { Profile, DecodedProfile, CreateProfileArgs, UpdateProfileArgs, UpdateReputationArgs, SimpleInstructionArgs } from './types';
import { serialize, deserialize } from 'borsh';
import { 
  CreateProfileSchema, 
  UpdateProfileSchema, 
  UpdateReputationSchema,
  SimpleInstructionSchema,
  ProfileSchema,
  BorshTypeDefinition,
} from './schema';

export class ProfileClient extends LocalMoneyClient {
  /**
   * Create a new profile
   */
  async createProfile(
    profileAccount: Keypair,
    username: string,
  ): Promise<string> {
    const instruction = await this.createProfileInstruction(
      profileAccount.publicKey,
      username,
    );

    return await this.sendTransaction([instruction], [profileAccount]);
  }

  /**
   * Update profile
   */
  async updateProfile(
    profileAccount: PublicKey,
    username?: string,
  ): Promise<string> {
    const instruction = await this.updateProfileInstruction(
      profileAccount,
      username,
    );

    return await this.sendTransaction([instruction]);
  }

  /**
   * Update profile reputation
   */
  async updateReputation(
    profileAccount: PublicKey,
    scoreDelta: number,
  ): Promise<string> {
    const instruction = await this.updateReputationInstruction(
      profileAccount,
      scoreDelta,
    );

    return await this.sendTransaction([instruction]);
  }

  /**
   * Verify profile
   */
  async verifyProfile(profileAccount: PublicKey): Promise<string> {
    const instruction = await this.verifyProfileInstruction(profileAccount);
    return await this.sendTransaction([instruction]);
  }

  /**
   * Record trade completion
   */
  async recordTradeCompletion(
    profileAccount: PublicKey,
    tradeProgramAccount: PublicKey,
  ): Promise<string> {
    const instruction = await this.recordTradeCompletionInstruction(
      profileAccount,
      tradeProgramAccount,
    );
    return await this.sendTransaction([instruction]);
  }

  /**
   * Record trade dispute
   */
  async recordTradeDispute(
    profileAccount: PublicKey,
    tradeProgramAccount: PublicKey,
  ): Promise<string> {
    const instruction = await this.recordTradeDisputeInstruction(
      profileAccount,
      tradeProgramAccount,
    );
    return await this.sendTransaction([instruction]);
  }

  /**
   * Get profile data
   */
  async getProfile(profileAccount: PublicKey): Promise<Profile> {
    const data = await this.getAccountData(profileAccount);
    const decoded = deserialize(ProfileSchema as any, data) as DecodedProfile;
    
    return {
      username: decoded.username,
      reputation: decoded.reputation,
      tradesCompleted: decoded.tradesCompleted,
      tradesDisputed: decoded.tradesDisputed,
      isVerified: decoded.isVerified === 1,
    };
  }

  private async createProfileInstruction(
    profileAccount: PublicKey,
    username: string,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      CreateProfileSchema as any,
      {
        variant: 'CreateProfile',
        username,
      } as CreateProfileArgs,
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: profileAccount, isSigner: true, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.PROFILE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async updateProfileInstruction(
    profileAccount: PublicKey,
    username?: string,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      UpdateProfileSchema as any,
      {
        variant: 'UpdateProfile',
        username,
      } as UpdateProfileArgs,
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: profileAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.PROFILE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async updateReputationInstruction(
    profileAccount: PublicKey,
    scoreDelta: number,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      UpdateReputationSchema as any,
      {
        variant: 'UpdateReputation',
        scoreDelta,
      } as UpdateReputationArgs,
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: profileAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.PROFILE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async verifyProfileInstruction(profileAccount: PublicKey): Promise<TransactionInstruction> {
    const data = serialize(
      SimpleInstructionSchema as any,
      { variant: 'VerifyProfile' } as SimpleInstructionArgs,
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: profileAccount, isSigner: false, isWritable: true },
        { pubkey: this.getPayer().publicKey, isSigner: true, isWritable: false },
      ],
      programId: this.PROFILE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async recordTradeCompletionInstruction(
    profileAccount: PublicKey,
    tradeProgramAccount: PublicKey,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      SimpleInstructionSchema as any,
      { variant: 'RecordTradeCompletion' } as SimpleInstructionArgs,
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: profileAccount, isSigner: false, isWritable: true },
        { pubkey: tradeProgramAccount, isSigner: false, isWritable: false },
      ],
      programId: this.PROFILE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }

  private async recordTradeDisputeInstruction(
    profileAccount: PublicKey,
    tradeProgramAccount: PublicKey,
  ): Promise<TransactionInstruction> {
    const data = serialize(
      SimpleInstructionSchema as any,
      { variant: 'RecordTradeDispute' } as SimpleInstructionArgs,
    );

    return new TransactionInstruction({
      keys: [
        { pubkey: profileAccount, isSigner: false, isWritable: true },
        { pubkey: tradeProgramAccount, isSigner: false, isWritable: false },
      ],
      programId: this.PROFILE_PROGRAM_ID,
      data: Buffer.from(data),
    });
  }
} 