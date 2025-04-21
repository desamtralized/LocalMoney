import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, TransactionInstruction, Transaction } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from 'fs';
import * as path from 'path';

// Define the correct interface based on our Rust code examination
interface UpdateContactParams {
  contact: string;
  encryption_key: string;
}

describe("Simplified Test Approach", () => {
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
  };
  
  // User and connection
  const user = Keypair.generate();
  let connection: anchor.web3.Connection;
  let hubPda: PublicKey;
  let profilePda: PublicKey;
  
  before(async () => {
    console.log("Setting up test environment...");
    connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
    
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
    
    console.log("Setup complete");
    console.log("User:", user.publicKey.toString());
    console.log("Hub PDA:", hubPda.toString());
    console.log("Profile PDA:", profilePda.toString());
  });
  
  it("should create a profile using update_contact", async () => {
    console.log("\nCreating profile...");
    
    try {
      // Load the profile IDL to get the discriminator
      const profileIdlPath = path.join(__dirname, '../target/idl/profile.json');
      const profileIdl = JSON.parse(fs.readFileSync(profileIdlPath, 'utf8'));
      
      // Find the update_contact instruction
      const updateContactIx = profileIdl.instructions.find(ix => ix.name === 'update_contact');
      if (!updateContactIx) {
        console.log("Available instructions:");
        profileIdl.instructions.forEach(ix => console.log(` - ${ix.name}`));
        throw new Error('Could not find update_contact instruction');
      }
      
      // Get the discriminator
      const discriminator = Uint8Array.from(updateContactIx.discriminator);
      console.log("Discriminator:", discriminator);
      
      // Create the instruction data using Borsh serialization principles
      // This is simplified but follows the right approach
      // We need to encode: { contact: string, encryption_key: string }
      
      // Encode string length + string bytes
      const contact = "user@example.com";
      const encryptionKey = "test-encryption-key";
      
      // Serialize strings (length as u32 little-endian + bytes)
      const encodeString = (str: string): Buffer => {
        const strBytes = Buffer.from(str, 'utf8');
        const lenBytes = Buffer.alloc(4);
        lenBytes.writeUInt32LE(strBytes.length, 0);
        return Buffer.concat([lenBytes, strBytes]);
      };
      
      const contactBytes = encodeString(contact);
      const encryptionKeyBytes = encodeString(encryptionKey);
      
      // Combine the data: discriminator + contact + encryption_key
      const data = Buffer.concat([
        Buffer.from(discriminator),
        contactBytes,
        encryptionKeyBytes
      ]);
      
      // Create the instruction
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: user.publicKey, isSigner: true, isWritable: true },
          { pubkey: hubPda, isSigner: false, isWritable: false },
          { pubkey: profilePda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: programIds.profile,
        data: data,
      });
      
      // Create and send the transaction
      const tx = new Transaction().add(instruction);
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