import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

export class LocalMoneyClient {
  private connection: Connection;
  private payer: Keypair;

  // Program IDs
  public readonly PRICE_PROGRAM_ID = new PublicKey('LocalMoneyPriceProgram11111111111111111111111');
  public readonly TRADE_PROGRAM_ID = new PublicKey('LocalMoneyTradeProgram11111111111111111111111');
  public readonly PROFILE_PROGRAM_ID = new PublicKey('LocalMoneyProfileProgram1111111111111111111111');
  public readonly HUB_PROGRAM_ID = new PublicKey('LocalMoneyHubProgram111111111111111111111111');
  public readonly OFFER_PROGRAM_ID = new PublicKey('LocalMoneyOfferProgram11111111111111111111111');

  constructor(connection: Connection, payer: Keypair) {
    this.connection = connection;
    this.payer = payer;
  }

  /**
   * Send and confirm a transaction
   */
  protected async sendTransaction(
    instructions: TransactionInstruction[],
    signers: Keypair[] = [],
  ): Promise<string> {
    const transaction = new Transaction().add(...instructions);
    transaction.feePayer = this.payer.publicKey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    if (signers.length > 0) {
      transaction.sign(...signers);
    }

    const signature = await sendAndConfirmTransaction(this.connection, transaction, [
      this.payer,
      ...signers,
    ]);

    return signature;
  }

  /**
   * Get the program derived address
   */
  protected async findProgramAddress(
    seeds: (Buffer | Uint8Array)[],
    programId: PublicKey,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(seeds, programId);
  }

  /**
   * Get account data
   */
  protected async getAccountData(address: PublicKey): Promise<Buffer> {
    const account = await this.connection.getAccountInfo(address);
    if (!account) {
      throw new Error('Account not found');
    }
    return account.data;
  }

  /**
   * Get connection
   */
  public getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get payer
   */
  public getPayer(): Keypair {
    return this.payer;
  }
} 