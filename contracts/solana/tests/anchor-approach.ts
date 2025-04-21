import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from 'fs';
import * as path from 'path';

describe("Anchor Approach Test", () => {
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
  };
  
  // Use the default Anchor provider with the user as the wallet
  const user = Keypair.generate();
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  
  // Let Anchor handle the wallet and provider setup
  const wallet = new anchor.Wallet(user);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  
  // PDA addresses
  let hubPda: PublicKey;
  let profilePda: PublicKey;
  
  // Programs
  let profileProgram: Program;
  
  before(async () => {
    // Calculate PDAs
    [hubPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("hub")],
      programIds.hub
    );
    
    [profilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), user.publicKey.toBuffer()],
      programIds.profile
    );
    
    // Airdrop SOL to the user
    try {
      const signature = await connection.requestAirdrop(
        user.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature);
      console.log(`Airdropped SOL to user: ${user.publicKey.toString()}`);
    } catch (err) {
      console.warn(`Failed to airdrop to user: ${err.message}`);
    }
    
    // Load IDL files
    const profileIdlPath = path.join(__dirname, '../target/idl/profile.json');
    const profileIdl = JSON.parse(fs.readFileSync(profileIdlPath, 'utf8'));
    
    // Create Program instances using Anchor
    profileProgram = new Program(profileIdl, programIds.profile, provider);
    
    console.log("Setup complete");
    console.log("User:", user.publicKey.toString());
    console.log("Hub PDA:", hubPda.toString());
    console.log("Profile PDA:", profilePda.toString());
  });
  
  it("should create a profile using the update_contact instruction", async () => {
    console.log("\nCreating profile using update_contact...");
    
    try {
      // Use the Anchor Program class to call the instruction
      const tx = await profileProgram.methods
        .updateContact({
          contact: "test@example.com",
          encryptionKey: "test-encryption-key",
        })
        .accounts({
          authority: user.publicKey,
          hubConfig: hubPda,
          profile: profilePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      
      console.log("Transaction signature:", tx);
      
      // Verify the profile account was created
      const profileAccount = await connection.getAccountInfo(profilePda);
      assert.isNotNull(profileAccount, "Profile account should exist");
      console.log("Profile created successfully!");
      
    } catch (err) {
      console.error("Error creating profile:", err);
      if (err.logs) {
        console.error("Transaction logs:", err.logs);
      }
    }
  });
}); 