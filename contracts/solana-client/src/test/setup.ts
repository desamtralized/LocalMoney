import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export class TestSetup {
  connection: Connection;
  payer: Keypair;
  usdc: Token;
  usdcMint: PublicKey;
  payerUsdcAccount: PublicKey;

  constructor() {
    this.connection = new Connection('http://localhost:8899', 'confirmed');
    this.payer = new Keypair();
  }

  async initialize() {
    // Fund payer account
    const signature = await this.connection.requestAirdrop(
      this.payer.publicKey,
      10 * LAMPORTS_PER_SOL,
    );
    await this.connection.confirmTransaction(signature);

    // Create USDC mint
    this.usdc = await Token.createMint(
      this.connection,
      this.payer,
      this.payer.publicKey,
      null,
      6,
      TOKEN_PROGRAM_ID,
    );
    this.usdcMint = this.usdc.publicKey;

    // Create USDC account for payer
    this.payerUsdcAccount = await this.usdc.createAccount(this.payer.publicKey);

    // Mint some USDC to payer
    await this.usdc.mintTo(
      this.payerUsdcAccount,
      this.payer,
      [],
      1_000_000_000, // 1000 USDC
    );
  }

  async createUserWithBalance(): Promise<{ keypair: Keypair; usdcAccount: PublicKey }> {
    const user = new Keypair();
    
    // Fund with SOL
    const signature = await this.connection.requestAirdrop(
      user.publicKey,
      LAMPORTS_PER_SOL,
    );
    await this.connection.confirmTransaction(signature);

    // Create USDC account
    const usdcAccount = await this.usdc.createAccount(user.publicKey);

    // Mint USDC
    await this.usdc.mintTo(
      usdcAccount,
      this.payer,
      [],
      100_000_000, // 100 USDC
    );

    return { keypair: user, usdcAccount };
  }

  async createTokenAccount(owner: PublicKey): Promise<PublicKey> {
    return await this.usdc.createAccount(owner);
  }

  async mintTokens(account: PublicKey, amount: number) {
    await this.usdc.mintTo(
      account,
      this.payer,
      [],
      amount,
    );
  }
} 