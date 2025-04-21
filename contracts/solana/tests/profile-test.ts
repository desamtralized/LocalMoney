import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from 'fs';
import * as path from 'path';

describe("Profile Creation Test", () => {
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
  };
  
  // Test accounts
  const user = Keypair.generate();
  let connection: anchor.web3.Connection;
  let hubPda: PublicKey;
  let profilePda: PublicKey;
  
  before(async () => {
    // Setup connection
    connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
    
    // Calculate Hub PDA
    [hubPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("hub")],
      programIds.hub
    );
    
    // Calculate Profile PDA
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
  });
  
  it("should create a profile", async () => {
    console.log("Creating profile for user:", user.publicKey.toString());
    console.log("Profile PDA:", profilePda.toString());
    
    // Load the profile IDL
    const profileIdl = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../target/idl/profile.json'), 
      'utf8'
    ));
    
    // Get the discriminator for update_contact method
    const discriminator = profileIdl.instructions.find(ix => ix.name === 'update_contact')?.discriminator;
    if (!discriminator) {
      console.log("Available instructions in profile.json:");
      profileIdl.instructions.forEach(ix => console.log(` - ${ix.name}`));
      throw new Error('Could not find discriminator for update_contact method');
    }
    
    // Get the correct args layout from the IDL
    const ixDef = profileIdl.instructions.find(ix => ix.name === 'update_contact');
    console.log("Instruction definition:", JSON.stringify(ixDef, null, 2));
    
    // Create the transaction instruction for update_contact - just using the discriminator
    // Without any parameters as a simple test
    const instruction = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: user.publicKey, isSigner: true, isWritable: true },
        { pubkey: hubPda, isSigner: false, isWritable: false },
        { pubkey: profilePda, isSigner: false, isWritable: true },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: programIds.profile,
      data: Buffer.from(discriminator),
    });
    
    // Create and send the transaction
    try {
      const tx = new anchor.web3.Transaction().add(instruction);
      const signature = await anchor.web3.sendAndConfirmTransaction(
        connection,
        tx,
        [user]
      );
      console.log("Transaction signature:", signature);
      
      // Verify the profile was created
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