import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from 'fs';
import * as path from 'path';

// Define interfaces based on what we saw in the Rust code
interface UpdateContactParams {
  contact: string;
  encryptionKey: string;
}

describe("Step by Step Test Suite", () => {
  // Program IDs from Anchor.toml
  const programIds = {
    hub: new PublicKey("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG"),
    offer: new PublicKey("GaupCSNN86LpjFQYiLhYGBsXPwWxUW3XmRGdBLkr1tMn"),
    price: new PublicKey("51GmuXVNFTveMq1UtrmzWT8q564YjBKD5Zx2zbsMaWHG"),
    profile: new PublicKey("3FDN5CZQZrBydRA9wW2UAif4p3xmP1VQwkg97Bc8CrNq"),
    trade: new PublicKey("kXcoGbvG1ib18vK6YLdkbEdnc9NsqrhAS256yhreacB")
  };
  
  // Use Anchor provider with the user as the wallet
  const user = Keypair.generate();
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  
  const wallet = new anchor.Wallet(user);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  
  // PDA accounts
  let hubPda: PublicKey;
  let profilePda: PublicKey;
  
  // Programs
  let hubProgram: Program;
  let profileProgram: Program;
  let offerProgram: Program;
  let tradeProgram: Program;
  let priceProgram: Program;
  
  before(async () => {
    console.log("Setting up test environment...");
    
    // Calculate Hub PDA
    [hubPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("hub")],
      programIds.hub
    );
    
    // Calculate Profile PDA for the user
    [profilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), user.publicKey.toBuffer()],
      programIds.profile
    );
    
    // Airdrop SOL to the test user
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
    
    // Load all IDL files
    const hubIdlPath = path.join(__dirname, '../target/idl/hub.json');
    const offerIdlPath = path.join(__dirname, '../target/idl/offer.json');
    const tradeIdlPath = path.join(__dirname, '../target/idl/trade.json');
    const priceIdlPath = path.join(__dirname, '../target/idl/price.json');
    const profileIdlPath = path.join(__dirname, '../target/idl/profile.json');
    
    const hubIdl = JSON.parse(fs.readFileSync(hubIdlPath, 'utf8'));
    const offerIdl = JSON.parse(fs.readFileSync(offerIdlPath, 'utf8'));
    const tradeIdl = JSON.parse(fs.readFileSync(tradeIdlPath, 'utf8'));
    const priceIdl = JSON.parse(fs.readFileSync(priceIdlPath, 'utf8'));
    const profileIdl = JSON.parse(fs.readFileSync(profileIdlPath, 'utf8'));
    
    // Create Program instances
    hubProgram = new Program(hubIdl, programIds.hub, provider);
    offerProgram = new Program(offerIdl, programIds.offer, provider);
    tradeProgram = new Program(tradeIdl, programIds.trade, provider);
    priceProgram = new Program(priceIdl, programIds.price, provider);
    profileProgram = new Program(profileIdl, programIds.profile, provider);
    
    console.log("Setup complete");
  });
  
  // Step 1: Create a profile 
  it("Step 1: should create a profile using update_contact", async () => {
    console.log("\nStep 1: Creating a profile...");
    console.log("User:", user.publicKey.toString());
    console.log("Profile PDA:", profilePda.toString());
    
    try {
      // The updateContact method name might be camelCase in Anchor's generated client
      // Based on our examination of the Rust code:
      // Params: { contact: string, encryption_key: string }
      // Accounts: { authority, hub_config, profile, system_program }
      
      // First try with camelCase method name (Anchor convention)
      try {
        const updateContactMethod = profileProgram.methods.updateContact ?
          profileProgram.methods.updateContact : profileProgram.methods.update_contact;
        
        if (!updateContactMethod) {
          console.log("Methods available on profileProgram.methods:");
          console.log(Object.keys(profileProgram.methods));
          throw new Error("Could not find updateContact method");
        }
        
        // Pass the parameters according to the Rust struct definition
        const params: UpdateContactParams = {
          contact: "user@example.com",
          encryptionKey: "test-encryption-key"
        };
        
        const tx = await updateContactMethod(params)
          .accounts({
            authority: user.publicKey,
            hubConfig: hubPda,
            profile: profilePda,
            systemProgram: SystemProgram.programId
          })
          .signers([user])
          .rpc();
        
        console.log("Transaction signature:", tx);
        
        // Verify the profile was created
        const profileAccount = await connection.getAccountInfo(profilePda);
        assert.isNotNull(profileAccount, "Profile account should exist");
        console.log("Profile created successfully!");
        
      } catch (err) {
        console.error("Error with camelCase method:", err);
        
        // If camelCase doesn't work, try the exact method name from the IDL
        console.log("Trying with exact IDL method name...");
        
        // Load the IDL again to get the exact method name
        const profileIdlPath = path.join(__dirname, '../target/idl/profile.json');
        const profileIdl = JSON.parse(fs.readFileSync(profileIdlPath, 'utf8'));
        
        // Find the update_contact instruction to see its exact name
        const updateContactIx = profileIdl.instructions.find(ix => 
          ix.name.includes('update') && ix.name.includes('contact')
        );
        
        if (!updateContactIx) {
          console.error("Could not find update_contact instruction in IDL");
          throw err;
        }
        
        console.log(`Found instruction name: ${updateContactIx.name}`);
        
        // Try with the exact name from the IDL
        const methodName = updateContactIx.name;
        const tx = await profileProgram.methods[methodName]({
          contact: "user@example.com",
          encryptionKey: "test-encryption-key"
        })
        .accounts({
          authority: user.publicKey,
          hubConfig: hubPda,
          profile: profilePda,
          systemProgram: SystemProgram.programId
        })
        .signers([user])
        .rpc();
        
        console.log("Transaction signature:", tx);
        
        // Verify the profile was created
        const profileAccount = await connection.getAccountInfo(profilePda);
        assert.isNotNull(profileAccount, "Profile account should exist");
        console.log("Profile created successfully!");
      }
    } catch (err) {
      console.error("Failed to create profile:", err);
      if (err.logs) {
        console.error("Transaction logs:", err.logs);
      }
      throw err;
    }
  });
}); 