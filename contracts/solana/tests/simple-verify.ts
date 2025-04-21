import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import { assert } from "chai";

describe("LocalMoney Simple Verification", () => {
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    offer: new PublicKey("GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn"),
    price: new PublicKey("51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
    trade: new PublicKey("kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB")
  };
  
  // Hub PDA
  let hubPda: PublicKey;
  
  // Connection
  let connection: Connection;
  
  before(async () => {
    // Setup connection to local validator
    connection = new Connection("http://localhost:8899", "confirmed");
    
    // Calculate Hub PDA
    [hubPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("hub")],
      programIds.hub
    );
    
    console.log("Hub PDA:", hubPda.toString());
  });
  
  it("should have all programs deployed with correct IDs", async () => {
    console.log("\nVerifying program deployments...");
    
    // For each program ID, check that an account exists on chain
    for (const [name, pubkey] of Object.entries(programIds)) {
      const programInfo = await connection.getAccountInfo(pubkey);
      assert(programInfo !== null, `Program ${name} not found at ${pubkey.toString()}`);
      assert(programInfo.executable, `Program ${name} is not executable`);
      console.log(`✓ ${name} program found at ${pubkey.toString()}`);
    }
  });
  
  it("should have hub initialized", async () => {
    console.log("\nVerifying hub initialization...");
    
    const hubAccount = await connection.getAccountInfo(hubPda);
    assert(hubAccount !== null, "Hub account not found");
    console.log("✓ Hub account found at", hubPda.toString());
  });
}); 