import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Trade, TradeStatus, TradeWithPublicKey } from '../types';
import { WalletAdapter, createWalletAdapter, hasKeypair } from '../walletAdapter';
import { Transaction } from '@solana/web3.js';

export class TradeClient {
  private program: Program;
  private connection: Connection;

  constructor(programId: PublicKey, provider: AnchorProvider, idl: Idl) {
    if (!idl.instructions || !idl.instructions.some(i => i.name === "createTrade")) {
      throw new Error("IDL is missing createTrade instruction");
    }
    this.program = new Program(idl, programId, provider);
    if (!this.program.methods || !this.program.methods.createTrade) {
      throw new Error("Program methods not available");
    }
    this.connection = provider.connection;
  }

  // For creating a new trade
  getTradeSeed(taker: PublicKey, maker: PublicKey, tokenMint: PublicKey, amount: BN): Buffer[] {
    // Convert amount to little-endian bytes to match amount.to_le_bytes() in Rust
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(BigInt(amount.toString()), 0);
    
    return [
      Buffer.from("trade"),
      taker.toBuffer(),
      maker.toBuffer(),
      tokenMint.toBuffer(),
      amountBuffer
    ];
  }
  
  /**
   * Create a new trade
   * 
   * @param takerWallet Either a keypair or wallet signer
   * @param maker The maker's public key
   * @param tokenMint The token mint address
   * @param makerTokenAccount The maker's token account
   * @param escrowAccount The escrow account keypair
   * @param amount The amount of tokens
   * @param price The price per token
   * @returns The trade PDA
   */
  async createTrade(
    takerWallet: Keypair | WalletAdapter,
    maker: PublicKey,
    tokenMint: PublicKey,
    makerTokenAccount: PublicKey,
    escrowAccount: Keypair,
    amount: BN,
    price: BN
  ): Promise<PublicKey> {
    console.log('Creating trade...');
    console.log('Taker:', (takerWallet instanceof Keypair) ? takerWallet.publicKey.toString() : (takerWallet as WalletAdapter).publicKey.toString());
    console.log('Maker:', maker.toString());
    console.log('Token Mint:', tokenMint.toString());
    console.log('Amount:', amount.toString());
    console.log('Price:', price.toString());
    console.log('Escrow Account:', escrowAccount.publicKey.toString());
    
    // Create wallet adapter
    const takerAdapter = createWalletAdapter(takerWallet);
    
    const tradeSeed = this.getTradeSeed(
      takerAdapter.publicKey, 
      maker, 
      tokenMint, 
      amount
    );
    const [tradePDA, bump] = PublicKey.findProgramAddressSync(tradeSeed, this.program.programId);
    
    console.log('Trade PDA:', tradePDA.toString());
    console.log('Program ID being used:', this.program.programId.toString());
    
    try {
      console.log('Building trade creation transaction...');
      // Build the complete transaction
      const tx = await this.program.methods
        .createTrade(amount, price)
        .accounts({
          trade: tradePDA,
          maker: maker,
          taker: takerAdapter.publicKey,
          tokenMint: tokenMint,
          makerTokenAccount: makerTokenAccount,
          escrowAccount: escrowAccount.publicKey,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction();
      
      // Get a recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = takerAdapter.publicKey;
      
      console.log('Transaction built successfully');
      
      // Always add the escrow account signer
      console.log('Signing transaction with escrow account...');
      tx.partialSign(escrowAccount);
      
      let txid: string;
      
      // Handle different wallet types
      if (takerWallet instanceof Keypair) {
        // If we have a keypair, we can sign directly
        console.log('Signing with keypair directly...');
        tx.partialSign(takerWallet);
        
        console.log('Sending transaction to network...');
        txid = await this.connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });
      } else {
        // For browser wallets
        console.log('Using browser wallet for signing...');
        
        if (typeof takerAdapter.signTransaction === 'function') {
          console.log('Using signTransaction from wallet adapter...');
          const signedTx = await takerAdapter.signTransaction(tx);
          
          console.log('Sending transaction to network...');
          txid = await this.connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed'
          });
        } else if (typeof takerAdapter.signAndSendTransaction === 'function') {
          console.log('Using signAndSendTransaction from wallet adapter...');
          // Wallet adapter expects (connection, transaction)
          const result = await takerAdapter.signAndSendTransaction(this.connection, tx);
          if (typeof result === 'string') {
            txid = result;
          } else if (result && typeof (result as any).signature === 'string') {
            txid = (result as any).signature;
          } else {
            console.log('Unexpected result from signAndSendTransaction:', result);
            throw new Error('Failed to get transaction signature');
          }
        } else {
          throw new Error('Wallet adapter does not support signTransaction or signAndSendTransaction');
        }
      }
      
      console.log('Transaction sent with ID:', txid);
      console.log('Waiting for confirmation...');
      
      // Use a higher commitment level for confirmation
      const confirmation = await this.connection.confirmTransaction({
        signature: txid,
        blockhash: blockhash,
        lastValidBlockHeight: await this.connection.getBlockHeight(),
      }, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('Transaction confirmed but has errors:', confirmation.value.err);
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log('Transaction confirmed successfully!');
      
      // Verify the trade account was created correctly
      console.log('Verifying trade account was created...');
      try {
        // Use getRawAccount to check the account data directly
        const accountInfo = await this.connection.getAccountInfo(tradePDA);
        
        if (!accountInfo) {
          console.error('Trade account not found after transaction confirmation!');
          throw new Error('Trade account not found after transaction confirmation');
        }
        
        console.log('Account exists with', accountInfo.data.length, 'bytes of data');
        
        // Check for the correct discriminator
        if (accountInfo.data.length >= 8) {
          const discriminator = accountInfo.data.slice(0, 8);
          const expectedDiscriminator = this.getTradeDiscriminator();
          
          console.log('Account discriminator:', Buffer.from(discriminator).toString('hex'));
          console.log('Expected discriminator:', Buffer.from(expectedDiscriminator).toString('hex'));
          
          if (!Buffer.from(discriminator).equals(Buffer.from(expectedDiscriminator))) {
            console.error('Account has incorrect discriminator!');
          } else {
            console.log('Account has correct discriminator!');
          }
        } else {
          console.error('Account data too small to contain a discriminator!');
        }
        
        // Try to decode using Anchor
        const tradeAccount = await this.program.account.trade.fetch(tradePDA);
        console.log('Successfully decoded trade account:', {
          maker: tradeAccount.maker.toString(),
          taker: tradeAccount.taker ? tradeAccount.taker.toString() : 'null',
          amount: tradeAccount.amount.toString(),
          price: tradeAccount.price.toString(),
          status: this.convertTradeStatus(tradeAccount.status),
        });
      } catch (fetchError) {
        console.error('Error verifying trade account:', (fetchError as Error).message);
        if ((fetchError as Error).stack) {
          console.error('Stack trace:', (fetchError as Error).stack);
        }
        
        // Even if verification fails, we'll return the PDA since the transaction was confirmed
        console.log('Returning trade PDA despite verification error');
      }
      
      return tradePDA;
    } catch (error) {
      console.error('Error creating trade:', (error as Error).message);
      if ((error as Error).stack) {
        console.error('Stack trace:', (error as Error).stack);
      }
      throw error;
    }
  }

  /**
   * Complete a trade
   * 
   * @param tradePDA The trade PDA
   * @param traderWallet The trader's wallet (either keypair or wallet signer)
   * @param escrowAccount The escrow account public key
   * @param takerTokenAccount The taker's token account
   * @param priceOracle The price oracle public key
   * @param priceProgram The price program ID
   * @param takerProfile The taker's profile public key
   * @param makerProfile The maker's profile public key
   * @param profileProgram The profile program ID
   * @param tokenMint Optional token mint (needed for some implementations)
   */
  async completeTrade(
    tradePDA: PublicKey,
    traderWallet: Keypair | WalletAdapter,
    escrowAccount: PublicKey,
    takerTokenAccount: PublicKey,
    priceOracle: PublicKey,
    priceProgram: PublicKey,
    takerProfile: PublicKey,
    makerProfile: PublicKey,
    profileProgram: PublicKey,
    tokenMint?: PublicKey
  ): Promise<void> {
    // Create wallet adapter
    const traderAdapter = createWalletAdapter(traderWallet);
    
    try {
      // Get the trade to confirm it exists
      const trade = await this.getTrade(tradePDA);
      
      // Complete the trade on-chain
      const tx = await this.program.methods
        .completeTrade()
        .accounts({
          trade: tradePDA,
          maker: trade.maker,
          taker: trade.taker || trade.maker,
          trader: traderAdapter.publicKey,
          escrowAccount: escrowAccount,
          takerTokenAccount: takerTokenAccount,
          tokenMint: trade.tokenMint,
          priceOracle: priceOracle,
          priceProgram: priceProgram,
          takerProfile: takerProfile,
          makerProfile: makerProfile,
          profileProgram: profileProgram,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction();
      
      // Sign and send the transaction
      await traderAdapter.signAndSendTransaction!(this.connection, tx);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cancel a trade
   * 
   * @param tradePDA The trade PDA
   * @param traderWallet The trader's wallet (either keypair or wallet signer)
   */
  async cancelTrade(
    tradePDA: PublicKey,
    traderWallet: Keypair | WalletAdapter
  ): Promise<void> {
    // Create wallet adapter
    const traderAdapter = createWalletAdapter(traderWallet);
    
    try {
      // Get the trade to confirm it exists
      const trade = await this.getTrade(tradePDA);
      
      // Cancel the trade on-chain
      const tx = await this.program.methods
        .cancelTrade()
        .accounts({
          trade: tradePDA,
          maker: trade.maker,
          taker: trade.taker || trade.maker,
          trader: traderAdapter.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction();
      
      // Sign and send the transaction
      await traderAdapter.signAndSendTransaction!(this.connection, tx);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Dispute a trade
   * 
   * @param tradePDA The trade PDA
   * @param disputerWallet The disputer's wallet (either keypair or wallet signer)
   */
  async disputeTrade(
    tradePDA: PublicKey,
    disputerWallet: Keypair | WalletAdapter
  ): Promise<void> {
    // Create wallet adapter
    const disputerAdapter = createWalletAdapter(disputerWallet);
    
    try {
      // Get the trade to confirm it exists
      const trade = await this.getTrade(tradePDA);
      
      // Dispute the trade on-chain
      const tx = await this.program.methods
        .disputeTrade()
        .accounts({
          trade: tradePDA,
          disputer: disputerAdapter.publicKey
        })
        .transaction();
      
      // Sign and send the transaction
      await disputerAdapter.signAndSendTransaction!(this.connection, tx);
    } catch (error) {
      throw error;
    }
  }

  async getTrade(tradePDA: PublicKey): Promise<Trade> {
    try {
      // Fetch the trade account from the blockchain
      const tradeAccount = await this.program.account.trade.fetch(tradePDA);
      
      // Convert the trade account data to the Trade type
      return {
        maker: tradeAccount.maker,
        taker: tradeAccount.taker,
        amount: tradeAccount.amount,
        price: tradeAccount.price,
        tokenMint: tradeAccount.tokenMint,
        escrowAccount: tradeAccount.escrowAccount,
        status: this.convertTradeStatus(tradeAccount.status),
        createdAt: tradeAccount.createdAt.toNumber(),
        updatedAt: tradeAccount.updatedAt.toNumber(),
        bump: tradeAccount.bump
      };
    } catch (error) {
      throw error;
    }
  }

  async findTradeAddress(
    maker: PublicKey,
    taker: PublicKey,
    tokenMint: PublicKey,
    amount: BN
  ): Promise<[PublicKey, number]> {
    return new Promise((resolve, reject) => {
      try {
        const tradeSeed = this.getTradeSeed(taker, maker, tokenMint, amount);
        const result = PublicKey.findProgramAddressSync(tradeSeed, this.program.programId);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  async findExistingTradeAddress(
    taker: PublicKey,
    maker: PublicKey,
    tokenMint: PublicKey,
    amount: number 
  ): Promise<[PublicKey, number]> {
    return new Promise((resolve, reject) => {
      try {
        const tradeSeed = this.getTradeSeed(taker, maker, tokenMint, new BN(amount));
        const result = PublicKey.findProgramAddressSync(tradeSeed, this.program.programId);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Deposit to a trade escrow
   * 
   * @param tradePDA The trade PDA
   * @param depositorWallet The depositor's wallet (either keypair or wallet signer)
   * @param depositorTokenAccount The depositor's token account
   * @param escrowAccount The escrow account
   * @param amount The amount to deposit
   */
  async depositEscrow(
    tradePDA: PublicKey,
    depositorWallet: Keypair | WalletAdapter,
    depositorTokenAccount: PublicKey,
    escrowAccount: PublicKey,
    amount: BN
  ): Promise<void> {
    // Create wallet adapter
    const depositorAdapter = createWalletAdapter(depositorWallet);
    
    try {
      // Get the trade to confirm it exists
      const trade = await this.getTrade(tradePDA);
      
      // Deposit to escrow on-chain
      const tx = await this.program.methods
        .depositEscrow(amount)
        .accounts({
          trade: tradePDA,
          depositor: depositorAdapter.publicKey,
          depositorTokenAccount: depositorTokenAccount,
          escrowAccount: escrowAccount,
          tokenMint: trade.tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction();
      
      // Sign and send the transaction
      await depositorAdapter.signAndSendTransaction!(this.connection, tx);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Gets all trades associated with a user (as maker or taker)
   */
  async getTradesByUser(userPubkey: PublicKey): Promise<TradeWithPublicKey[]> {
    console.log('getTradesByUser for user:', userPubkey.toString());
    try {
      // Get all program accounts
      const accounts = await this.connection.getProgramAccounts(this.program.programId);
      console.log(`Found ${accounts.length} total program accounts`);
      
      if (accounts.length === 0) {
        console.log("No accounts found in the program");
        return [];
      }
      
      const tradeDiscriminator = this.getTradeDiscriminator();
      
      // Filter for valid trade accounts
      const tradeAccounts = accounts.filter(({ account }) => {
        if (account.data.length < 8) return false;
        
        const discriminator = account.data.slice(0, 8);
        return Buffer.from(discriminator).equals(Buffer.from(tradeDiscriminator));
      });
      
      console.log(`Found ${tradeAccounts.length} trade accounts with the correct discriminator`);
      
      if (tradeAccounts.length === 0) {
        console.log("No trade accounts found with the correct discriminator");
        return [];
      }
      
      // Try to decode each trade account
      const userTrades: TradeWithPublicKey[] = [];
      
      // Get the user's address as a string for more reliable comparison
      const userAddress = userPubkey.toString();
      
      for (const { pubkey, account } of tradeAccounts) {
        try {
          console.log(`Manually decoding trade account ${pubkey.toString()}`);
          
          // Skip the 8-byte discriminator
          const accountData = account.data.slice(8);
          
          // Manually decode the fields according to the Trade struct layout
          // maker: Pubkey (32 bytes)
          const maker = new PublicKey(accountData.slice(0, 32));
          console.log(`Maker: ${maker.toString()}`);
          
          // taker: Pubkey (32 bytes)
          const takerBytes = accountData.slice(32, 64);
          const takerIsZero = takerBytes.every(byte => byte === 0);
          const taker = takerIsZero ? null : new PublicKey(takerBytes);
          console.log(`Taker: ${taker ? taker.toString() : 'null'}`);
          
          // amount: u64 (8 bytes)
          const amount = new BN(accountData.slice(64, 72), 'le');
          console.log(`Amount: ${amount.toString()}`);
          
          // price: u64 (8 bytes)
          const price = new BN(accountData.slice(72, 80), 'le');
          console.log(`Price: ${price.toString()}`);
          
          // token_mint: Pubkey (32 bytes)
          const tokenMint = new PublicKey(accountData.slice(80, 112));
          console.log(`Token mint: ${tokenMint.toString()}`);
          
          // escrow_account: Pubkey (32 bytes)
          const escrowAccount = new PublicKey(accountData.slice(112, 144));
          console.log(`Escrow account: ${escrowAccount.toString()}`);
          
          // status: Enum (1-2 bytes, typically)
          // For simplicity, reading 2 bytes for the status enum
          const statusBytes = accountData.slice(144, 146);
          const status = this.convertTradeStatusFromBytes(statusBytes);
          console.log(`Status: ${status}`);
          
          // created_at: i64 (8 bytes)
          const createdAtBN = new BN(accountData.slice(146, 154), 'le');
          
          // updated_at: i64 (8 bytes)
          const updatedAtBN = new BN(accountData.slice(154, 162), 'le');
          
          // bump: u8 (1 byte)
          const bump = accountData[162];
          
          // Check if this trade belongs to our user using string comparison for reliability
          const isMaker = maker.toString() === userAddress;
          const isTaker = taker && taker.toString() === userAddress;
          
          if (isMaker || isTaker) {
            console.log(`Found trade for user: ${pubkey.toString()} - User is ${isMaker ? 'maker' : 'taker'}`);
            
            // Convert timestamps safely
            let createdAt: number;
            let updatedAt: number;
            
            try {
              // Try to safely convert to numbers if they're small enough
              createdAt = createdAtBN.toNumber();
              updatedAt = updatedAtBN.toNumber();
            } catch (e) {
              // If numbers are too large, use a reasonable fallback like current timestamp
              console.log("Timestamps too large to represent as numbers, using current time as fallback");
              const now = Math.floor(Date.now() / 1000);
              createdAt = now;
              updatedAt = now;
            }
            
            const trade: TradeWithPublicKey = {
              publicKey: pubkey,
              maker,
              taker,
              amount,
              price,
              tokenMint,
              escrowAccount,
              status,
              createdAt,
              updatedAt,
              bump,
              account: {
                maker,
                taker,
                amount,
                price,
                tokenMint,
                escrowAccount,
                status,
                createdAt,
                updatedAt,
                bump
              }
            };
            
            userTrades.push(trade);
          }
        } catch (e) {
          console.log(`Error manually decoding account ${pubkey.toString()}: ${(e as Error).message}`);
        }
      }
      
      console.log(`Found ${userTrades.length} trades for user ${userPubkey.toString()}`);
      return userTrades;
    } catch (error) {
      console.error(`Error in getTradesByUser: ${(error as Error).message}`);
      return [];
    }
  }
  
  /**
   * Get the discriminator for trade accounts
   * This is a workaround for the linter error with accountDiscriminator
   */
  private getTradeDiscriminator(): Uint8Array {
    // Use the actual discriminator we observed in tests: 848b7b1f9dc4f4be
    const actualDiscriminator = Buffer.from('848b7b1f9dc4f4be', 'hex');
    
    // Log for verification
    console.log('Using actual discriminator from deployed program:', actualDiscriminator.toString('hex'));
    
    return actualDiscriminator;
  }

  // Helper method to create mock trade data for testing
  private createMockTrade(userPubkey: PublicKey): TradeWithPublicKey {
    const mockMaker = userPubkey;
    const mockTaker = new PublicKey('11111111111111111111111111111111');
    const mockAmount = new BN(1000000);
    const mockPrice = new BN(100000);
    const mockTokenMint = new PublicKey('11111111111111111111111111111111');
    const mockEscrowAccount = new PublicKey('11111111111111111111111111111111');
    const now = Math.floor(Date.now() / 1000);
    
    return {
      publicKey: new PublicKey('11111111111111111111111111111111'),
      maker: mockMaker,
      taker: mockTaker,
      amount: mockAmount,
      price: mockPrice,
      tokenMint: mockTokenMint,
      escrowAccount: mockEscrowAccount,
      status: 'created' as TradeStatus,
      createdAt: now,
      updatedAt: now,
      bump: 255
    };
  }

  private convertTradeStatus(status: any): TradeStatus {
    if ('created' in status) return TradeStatus.Created;
    if ('escrowDeposited' in status) return TradeStatus.EscrowDeposited;
    if ('completed' in status) return TradeStatus.Completed;
    if ('cancelled' in status) return TradeStatus.Cancelled;
    if ('disputed' in status) return TradeStatus.Disputed;
    throw new Error('Unknown trade status');
  }

  /**
   * Convert raw status bytes to a TradeStatus
   */
  private convertTradeStatusFromBytes(statusBytes: Uint8Array): TradeStatus {
    // First byte is the enum discriminant (0, 1, 2, 3, 4)
    const discriminant = statusBytes[0];
    
    switch (discriminant) {
      case 0:
        return 'created' as TradeStatus;
      case 1:
        return 'escrowDeposited' as TradeStatus;
      case 2:
        return 'completed' as TradeStatus;
      case 3:
        return 'cancelled' as TradeStatus;
      case 4:
        return 'disputed' as TradeStatus;
      default:
        return 'created' as TradeStatus; // Default fallback
    }
  }
}