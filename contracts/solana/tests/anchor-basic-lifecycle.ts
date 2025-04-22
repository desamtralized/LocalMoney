import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from 'fs';
import * as path from 'path';

describe("LocalMoney Basic Lifecycle Test", () => {
  // Configure the client
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  const wallet = new anchor.Wallet(Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  
  // Admin keypair for initialization
  const admin = Keypair.generate();
  
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    offer: new PublicKey("GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn"),
    price: new PublicKey("51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
    trade: new PublicKey("kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB")
  };
  
  // PDAs
  const hubPda = PublicKey.findProgramAddressSync(
    [Buffer.from("hub")],
    programIds.hub
  )[0];
  
  before(async () => {
    // Fund the admin account
    try {
      const airdropAmount = 10 * anchor.web3.LAMPORTS_PER_SOL;
      const signature = await provider.connection.requestAirdrop(
        admin.publicKey, 
        airdropAmount
      );
      await provider.connection.confirmTransaction(signature);
      console.log(`Airdropped ${airdropAmount / anchor.web3.LAMPORTS_PER_SOL} SOL to admin: ${admin.publicKey.toString()}`);
    } catch (err) {
      console.error("Error funding admin account:", err);
    }
  });
  
  it("should connect to the programs and verify they exist", async () => {
    // Verify all programs are deployed
    const connection = provider.connection;
    
    // Check hub program
    const hubInfo = await connection.getAccountInfo(programIds.hub);
    assert.ok(hubInfo, "Hub program should exist on-chain");
    console.log("Hub program verified");
    
    // Check offer program
    const offerInfo = await connection.getAccountInfo(programIds.offer);
    assert.ok(offerInfo, "Offer program should exist on-chain");
    console.log("Offer program verified");
    
    // Check trade program
    const tradeInfo = await connection.getAccountInfo(programIds.trade);
    assert.ok(tradeInfo, "Trade program should exist on-chain");
    console.log("Trade program verified");
    
    // Check price program
    const priceInfo = await connection.getAccountInfo(programIds.price);
    assert.ok(priceInfo, "Price program should exist on-chain");
    console.log("Price program verified");
    
    // Check profile program
    const profileInfo = await connection.getAccountInfo(programIds.profile);
    assert.ok(profileInfo, "Profile program should exist on-chain");
    console.log("Profile program verified");
  });
  
  it("should initialize hub with proper configuration", async () => {
    try {
      // Load the hub program
      const idlFile = fs.readFileSync(
        path.join(__dirname, '../target/idl/hub.json'),
        'utf8'
      );
      const idl = JSON.parse(idlFile);
      const hubProgram = new anchor.Program(idl, programIds.hub, provider);
      
      // Check if hub is already initialized
      try {
        const hubAccount = await provider.connection.getAccountInfo(hubPda);
        if (hubAccount) {
          console.log("Hub account already exists, skipping initialization");
          return;
        }
      } catch (err) {
        console.log("Hub account doesn't exist, proceeding with initialization");
      }
      
      // Create a dummy token mint for testing
      const tokenMint = Keypair.generate().publicKey;
      
      // Create hub config
      const hubConfig = {
        offerProgram: programIds.offer,
        tradeProgram: programIds.trade,
        profileProgram: programIds.profile,
        priceProgram: programIds.price,
        priceProvider: admin.publicKey,
        localMarket: admin.publicKey,
        localTokenMint: tokenMint,
        chainFeeCollector: admin.publicKey,
        warchest: admin.publicKey,
        activeOffersLimit: 10,
        activeTradesLimit: 10,
        arbitrationFeePct: 1,
        burnFeePct: 1,
        chainFeePct: 1,
        warchestFeePct: 1,
        disputeTime: new anchor.BN(86400),
        tradeTime: new anchor.BN(3600),
        minTradeAmount: new anchor.BN(1000000),
        minOfferAmount: new anchor.BN(1000000),
        versionMajor: 0,
        versionMinor: 1,
        versionPatch: 0
      };
      
      // Initialize hub
      const tx = await hubProgram.methods
        .initialize(hubConfig)
        .accounts({
          admin: admin.publicKey,
          hub: hubPda,
          systemProgram: SystemProgram.programId
        })
        .signers([admin])
        .rpc();
      
      console.log("Hub initialized successfully! Transaction:", tx);
    } catch (err) {
      console.error("Error initializing hub:", err);
      throw err;
    }
  });
}); 