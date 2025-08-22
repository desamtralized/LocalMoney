import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, BN, Wallet } from '@coral-xyz/anchor';
import { 
  createTradeInstruction,
  acceptRequestInstruction,
  fundEscrowInstruction,
  markFiatDepositedInstruction,
  releaseEscrowInstruction,
  refundEscrowInstruction,
  cancelRequestInstruction
} from '../instructions/trade';
import { deriveTradeAddress, deriveEscrowAddress } from '../pdas';
import { Trade } from '../types/trade';
import { PROGRAM_IDS } from '../generated';

const TradeIDL = require('../types/trade.json');

export interface CreateTradeTransactionParams {
  tradeId: BN;
  offerId: BN;
  amount: BN;
  buyer: PublicKey;
  seller: PublicKey;
  offer: PublicKey;
  tokenMint: PublicKey;
  hubConfig: PublicKey;
  buyerContact: string;
  lockedPrice: BN;
  expiryDuration: BN;
  arbitrator: PublicKey;
}

export interface AcceptTradeTransactionParams {
  tradeId: BN;
  trade: PublicKey;
  seller: PublicKey;
  sellerProfile: PublicKey;
}

export interface FundEscrowTransactionParams {
  tradeId: BN;
  trade: PublicKey;
  escrow: PublicKey;
  seller: PublicKey;
  sellerTokenAccount: PublicKey;
  amount: BN;
}

export interface ReleaseEscrowTransactionParams {
  tradeId: BN;
  trade: PublicKey;
  escrow: PublicKey;
  seller: PublicKey;
  buyer: PublicKey;
  buyerTokenAccount: PublicKey;
  hubConfig: PublicKey;
  hubFeeAccount: PublicKey;
}

export async function buildCreateTradeTransaction(
  connection: Connection,
  wallet: Wallet,
  params: CreateTradeTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Trade>(TradeIDL, PROGRAM_IDS.trade, provider);
  
  const tx = new Transaction();
  
  // Derive trade PDA
  const [tradeAddress] = deriveTradeAddress(params.tradeId);
  
  // Add instruction
  tx.add(
    createTradeInstruction(
      program,
      {
        trade: tradeAddress,
        buyer: params.buyer,
        offer: params.offer,
        seller: params.seller,
        tokenMint: params.tokenMint,
        hubConfig: params.hubConfig,
        profileProgram: new PublicKey(PROGRAM_IDS.profile),
        offerProgram: new PublicKey(PROGRAM_IDS.offer),
        priceProgram: new PublicKey(PROGRAM_IDS.price),
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      },
      {
        tradeId: params.tradeId,
        offerId: params.offerId,
        amount: params.amount,
        lockedPrice: params.lockedPrice,
        expiryDuration: params.expiryDuration,
        buyerContact: params.buyerContact,
        arbitrator: params.arbitrator,
      }
    )
  );
  
  // Set recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.buyer;
  
  return tx;
}

export async function buildAcceptTradeTransaction(
  connection: Connection,
  wallet: Wallet,
  params: AcceptTradeTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Trade>(TradeIDL, PROGRAM_IDS.trade, provider);
  
  const tx = new Transaction();
  
  tx.add(
    acceptRequestInstruction(
      program,
      {
        trade: params.trade,
        seller: params.seller,
        sellerProfile: params.sellerProfile,
        profileProgram: new PublicKey(PROGRAM_IDS.profile),
      },
      {
        tradeId: params.tradeId,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.seller;
  
  return tx;
}

export async function buildFundEscrowTransaction(
  connection: Connection,
  wallet: Wallet,
  params: FundEscrowTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Trade>(TradeIDL, PROGRAM_IDS.trade, provider);
  
  const tx = new Transaction();
  
  tx.add(
    fundEscrowInstruction(
      program,
      {
        trade: params.trade,
        escrow: params.escrow,
        seller: params.seller,
        sellerTokenAccount: params.sellerTokenAccount,
        tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      },
      {
        tradeId: params.tradeId,
        amount: params.amount,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.seller;
  
  return tx;
}

export async function buildReleaseEscrowTransaction(
  connection: Connection,
  wallet: Wallet,
  params: ReleaseEscrowTransactionParams
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Trade>(TradeIDL, PROGRAM_IDS.trade, provider);
  
  const tx = new Transaction();
  
  tx.add(
    releaseEscrowInstruction(
      program,
      {
        trade: params.trade,
        escrow: params.escrow,
        seller: params.seller,
        buyer: params.buyer,
        buyerTokenAccount: params.buyerTokenAccount,
        tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        hubConfig: params.hubConfig,
        hubFeeAccount: params.hubFeeAccount,
      },
      {
        tradeId: params.tradeId,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = params.seller;
  
  return tx;
}

export async function buildCompleteTradingFlowTransactions(
  connection: Connection,
  wallet: Wallet,
  params: {
    tradeId: BN;
    offerId: BN;
    amount: BN;
    buyer: PublicKey;
    seller: PublicKey;
    offer: PublicKey;
    tokenMint: PublicKey;
    hubConfig: PublicKey;
    buyerContact: string;
    lockedPrice: BN;
    expiryDuration: BN;
    arbitrator: PublicKey;
    sellerProfile: PublicKey;
    sellerTokenAccount: PublicKey;
    buyerTokenAccount: PublicKey;
    hubFeeAccount: PublicKey;
  }
): Promise<Transaction[]> {
  const transactions: Transaction[] = [];
  
  // Derive PDAs
  const [tradeAddress] = deriveTradeAddress(params.tradeId);
  const [escrowAddress] = deriveEscrowAddress(params.tradeId);
  
  // Transaction 1: Create trade
  transactions.push(
    await buildCreateTradeTransaction(connection, wallet, {
      tradeId: params.tradeId,
      offerId: params.offerId,
      amount: params.amount,
      buyer: params.buyer,
      seller: params.seller,
      offer: params.offer,
      tokenMint: params.tokenMint,
      hubConfig: params.hubConfig,
      buyerContact: params.buyerContact,
      lockedPrice: params.lockedPrice,
      expiryDuration: params.expiryDuration,
      arbitrator: params.arbitrator,
    })
  );
  
  // Transaction 2: Accept trade and fund escrow
  const acceptAndFundTx = new Transaction();
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<Trade>(TradeIDL, PROGRAM_IDS.trade, provider);
  
  acceptAndFundTx.add(
    acceptRequestInstruction(
      program,
      {
        trade: tradeAddress,
        seller: params.seller,
        sellerProfile: params.sellerProfile,
        profileProgram: new PublicKey(PROGRAM_IDS.profile),
      },
      {
        tradeId: params.tradeId,
      }
    )
  );
  
  acceptAndFundTx.add(
    fundEscrowInstruction(
      program,
      {
        trade: tradeAddress,
        escrow: escrowAddress,
        seller: params.seller,
        sellerTokenAccount: params.sellerTokenAccount,
        tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      },
      {
        tradeId: params.tradeId,
        amount: params.amount,
      }
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash();
  acceptAndFundTx.recentBlockhash = blockhash;
  acceptAndFundTx.feePayer = params.seller;
  transactions.push(acceptAndFundTx);
  
  // Transaction 3: Mark fiat deposited
  const markDepositedTx = new Transaction();
  markDepositedTx.add(
    markFiatDepositedInstruction(
      program,
      {
        trade: tradeAddress,
        buyer: params.buyer,
      },
      {
        tradeId: params.tradeId,
      }
    )
  );
  markDepositedTx.recentBlockhash = blockhash;
  markDepositedTx.feePayer = params.buyer;
  transactions.push(markDepositedTx);
  
  // Transaction 4: Release escrow
  transactions.push(
    await buildReleaseEscrowTransaction(connection, wallet, {
      tradeId: params.tradeId,
      trade: tradeAddress,
      escrow: escrowAddress,
      seller: params.seller,
      buyer: params.buyer,
      buyerTokenAccount: params.buyerTokenAccount,
      hubConfig: params.hubConfig,
      hubFeeAccount: params.hubFeeAccount,
    })
  );
  
  return transactions;
}