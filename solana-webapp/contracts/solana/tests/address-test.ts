import * as anchor from "@project-serum/anchor";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { TradeClient } from "../sdk/src/clients/trade";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

async function main() {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  if (!process.env.TRADE_PROGRAM_ID) {
    throw new Error("TRADE_PROGRAM_ID not found in environment");
  }
  
  const TRADE_PROGRAM_ID = new PublicKey(process.env.TRADE_PROGRAM_ID);
  
  // Create a trade client
  const connection = new Connection("http://localhost:8899", "confirmed");
  
  // Load the IDL from file
  const idlPath = path.join(__dirname, "../target/idl/trade.json");
  console.log("Loading IDL from:", idlPath);
  
  if (!fs.existsSync(idlPath)) {
    throw new Error(`IDL file not found at ${idlPath}`);
  }
  
  const idlFile = fs.readFileSync(idlPath, "utf8");
  const idl = JSON.parse(idlFile);
  
  const tradeClient = new TradeClient(TRADE_PROGRAM_ID, provider, idl);
  
  // The specific address to test
  const specificAddress = new PublicKey("p1DWhN5r8ifoZmUyJfqjH96twyeGFejsWoBb8BdtaXB");
  console.log("Testing address:", specificAddress.toString());
  
  // Create a trade for this address
  console.log("Creating a test trade for the specific address...");
  
  // Generate keypairs for the test
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  console.log("Maker public key:", maker.publicKey.toString());
  console.log("Taker public key:", taker.publicKey.toString());
  
  // Airdrop SOL to the maker and taker
  const airdropSig1 = await connection.requestAirdrop(maker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
  await connection.confirmTransaction(airdropSig1);
  
  const airdropSig2 = await connection.requestAirdrop(taker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
  await connection.confirmTransaction(airdropSig2);
  
  // Create a token mint
  const tokenMint = Keypair.generate();
  console.log("Token mint:", tokenMint.publicKey.toString());
  
  // Create a trade
  try {
    // First check if there are any existing trades for the specific address
    console.log("Getting all program accounts...");
    const programAccounts = await connection.getProgramAccounts(TRADE_PROGRAM_ID);
    console.log(`Found ${programAccounts.length} program accounts`);
    
    // Check if any account has the specific address as maker or taker
    for (const { pubkey, account } of programAccounts) {
      console.log(`Account ${pubkey.toString()} with ${account.data.length} bytes`);
      
      if (account.data.length >= 8 + 32 * 2) {
        // Try to extract maker and taker public keys
        const makerPubkey = new PublicKey(account.data.slice(8, 8 + 32));
        const takerBytes = account.data.slice(8 + 32, 8 + 32 * 2);
        const takerIsZero = takerBytes.every(byte => byte === 0);
        const takerPubkey = takerIsZero ? null : new PublicKey(takerBytes);
        
        console.log(`  Maker: ${makerPubkey.toString()}`);
        console.log(`  Taker: ${takerPubkey ? takerPubkey.toString() : 'null'}`);
        
        if (makerPubkey.equals(specificAddress) || (takerPubkey && takerPubkey.equals(specificAddress))) {
          console.log("FOUND MATCH!");
        }
      }
    }
    
    // Now create a trade with the specific address as the maker
    console.log("Creating a new trade with the specific address as the maker...");
    
    // Create a new trade
    const escrowKeypair = Keypair.generate();
    const amount = new anchor.BN(1000000); // 1 SOL
    const price = new anchor.BN(100000); // $1.00
    
    // Create a fake maker token account
    const makerTokenAccount = Keypair.generate().publicKey;
    
    // Create the trade with the specific address as the maker
    // We need to swap maker and taker since we want the specific address as maker
    const tradePDA = await tradeClient.createTrade(
      taker, // Use the taker keypair
      specificAddress, // Use the specific address as the maker
      tokenMint.publicKey,
      makerTokenAccount,
      escrowKeypair,
      amount,
      price
    );
    
    console.log("Created trade with PDA:", tradePDA.toString());
    
    // Try to get trades for the specific address
    console.log("Getting trades for specific address...");
    const trades = await tradeClient.getTradesByUser(specificAddress);
    console.log(`Found ${trades.length} trades for specific address`);
    
    if (trades.length > 0) {
      trades.forEach((trade, index) => {
        console.log(`Trade ${index + 1}:`);
        console.log(`  PDA: ${trade.publicKey.toString()}`);
        console.log(`  Maker: ${trade.maker.toString()}`);
        console.log(`  Taker: ${trade.taker ? trade.taker.toString() : 'null'}`);
        console.log(`  Amount: ${trade.amount.toString()}`);
        console.log(`  Status: ${trade.status}`);
      });
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
); 