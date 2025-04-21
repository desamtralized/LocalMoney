import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import { assert } from "chai";

describe("LocalMoney Protocol - Anchor Approach", () => {
  // Configure the client manually
  const connection = new Connection("http://localhost:8899", "confirmed");
  const wallet = new anchor.Wallet(Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    offer: new PublicKey("GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn"),
    price: new PublicKey("51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
    trade: new PublicKey("kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB")
  };
  
  // PDAs
  const [hubPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("hub")],
    programIds.hub
  );
  
  // Test keypairs
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  
  it("should verify connections", async () => {
    // This is just a simple test to verify we can connect to the programs
    const connection = provider.connection;
    const latestBlockhash = await connection.getLatestBlockhash();
    assert.ok(latestBlockhash, "Should get latest blockhash");
    console.log("Successfully connected to Solana");
  });
  
  // Add more tests as space permits
}); 