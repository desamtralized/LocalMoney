import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LocalmoneyHub } from "../target/types/localmoney_hub";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";

describe("localmoney-hub", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LocalmoneyHub as Program<LocalmoneyHub>;
  
  // Use provider.wallet as the consistent admin
  const adminPublicKey = provider.wallet.publicKey;
  // const newAdmin = Keypair.generate(); // Keep this if testing admin updates
  const newAdmin = Keypair.generate(); 
  // Payer is implicitly provider.wallet
  
  // Mock addresses for other modules
  const offerAddr = Keypair.generate().publicKey;
  const tradeAddr = Keypair.generate().publicKey;
  const profileAddr = Keypair.generate().publicKey;
  const priceAddr = Keypair.generate().publicKey;
  const priceProviderAddr = Keypair.generate().publicKey;
  const localMarketAddr = Keypair.generate().publicKey;
  const chainFeeCollectorAddr = Keypair.generate().publicKey;
  const warchestAddr = Keypair.generate().publicKey;
  
  // Hub PDA
  let hubConfigPda: PublicKey;
  let hubConfigBump: number;
  
  before(async () => {
    // Fund the admin account (provider.wallet) - usually funded on localnet, but good practice
    try {
      const balance = await provider.connection.getBalance(adminPublicKey);
      console.log(`Admin (${adminPublicKey.toBase58()}) balance: ${balance}`);
      if (balance < 2 * anchor.web3.LAMPORTS_PER_SOL) {
          console.log("Airdropping to admin...");
          const airdropSig = await provider.connection.requestAirdrop(
            adminPublicKey,
            2 * anchor.web3.LAMPORTS_PER_SOL
          );
          await provider.connection.confirmTransaction(airdropSig, "confirmed");
          console.log("Admin airdrop confirmed.");
      } else {
          console.log("Admin has sufficient balance.");
      }
    } catch (e) {
        console.error("Failed to check/fund admin balance:", e);
        // Might fail if local validator is not running, proceed cautiously
    }
    
    // Fund newAdmin for the updateAdmin test
    const newAdminAirdrop = await provider.connection.requestAirdrop(newAdmin.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(newAdminAirdrop, "confirmed");

    // Derive the hub config PDA
    const [hubPda, bump] = await PublicKey.findProgramAddress(
      [Buffer.from("hub")],
      program.programId
    );
    hubConfigPda = hubPda;
    hubConfigBump = bump;
  });

  it("Initializes the hub with proper defaults", async () => {
    // Call the initialize instruction
    await program.methods
      .initialize(adminPublicKey) // Pass admin pubkey as argument
      .accounts({
        payer: adminPublicKey, // Payer is the admin
        hubConfig: hubConfigPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      // No explicit .signers() needed, provider.wallet signs for payer=adminPublicKey
      .rpc();
    
    // Fetch the hub config account
    const hubConfig = await program.account.hubConfig.fetch(hubConfigPda);
    
    // Verify initial values
    expect(hubConfig.admin.toString()).to.equal(adminPublicKey.toString());
    expect(hubConfig.isFullyConfigured).to.be.false;
    
    // Verify default limits
    expect(hubConfig.activeOffersLimit).to.equal(10);
    expect(hubConfig.activeTradesLimit).to.equal(10);
    
    // Verify default fees (using basis points)
    expect(hubConfig.arbitrationFeePct).to.equal(100); // 1%
    expect(hubConfig.burnFeePct).to.equal(50); // 0.5%
    expect(hubConfig.chainFeePct).to.equal(150); // 1.5%
    expect(hubConfig.warchestFeePct).to.equal(200); // 2%
    
    // Verify default timers
    expect(hubConfig.tradeExpirationTimer.toNumber()).to.equal(86400); // 24 hours
    expect(hubConfig.tradeDisputeTimer.toNumber()).to.equal(43200); // 12 hours
    
    // Verify default trade limits
    expect(hubConfig.tradeLimitMin.toNumber()).to.equal(10);
    expect(hubConfig.tradeLimitMax.toNumber()).to.equal(1000);
  });

  it("Updates the hub configuration", async () => {
    // Sample configuration parameters
    const activeOffersLimit = 20;
    const activeTradesLimit = 15;
    const arbitrationFeePct = 150; // 1.5%
    const burnFeePct = 75; // 0.75%
    const chainFeePct = 175; // 1.75%
    const warchestFeePct = 100; // 1%
    const tradeExpirationTimer = 172800; // 48 hours
    const tradeDisputeTimer = 86400; // 24 hours
    const tradeLimitMin = 5;
    const tradeLimitMax = 2000;
    const localDenom = "SOL";
    
    // Update the hub config
    await program.methods
      .updateConfig(
        offerAddr,
        tradeAddr,
        profileAddr,
        priceAddr,
        priceProviderAddr,
        localMarketAddr,
        localDenom,
        chainFeeCollectorAddr,
        warchestAddr,
        activeOffersLimit,
        activeTradesLimit,
        arbitrationFeePct,
        burnFeePct,
        chainFeePct,
        warchestFeePct,
        new anchor.BN(tradeExpirationTimer),
        new anchor.BN(tradeDisputeTimer),
        new anchor.BN(tradeLimitMin),
        new anchor.BN(tradeLimitMax)
      )
      .accounts({
        admin: adminPublicKey, // Account field is admin
        hubConfig: hubConfigPda,
      })
      // No explicit .signers() needed, provider.wallet signs for admin=adminPublicKey
      .rpc();
    
    // Fetch the updated hub config
    const hubConfig = await program.account.hubConfig.fetch(hubConfigPda);
    
    // Verify updated module addresses
    expect(hubConfig.offerAddr.toString()).to.equal(offerAddr.toString());
    expect(hubConfig.tradeAddr.toString()).to.equal(tradeAddr.toString());
    expect(hubConfig.profileAddr.toString()).to.equal(profileAddr.toString());
    expect(hubConfig.priceAddr.toString()).to.equal(priceAddr.toString());
    
    // Verify updated limits and fees
    expect(hubConfig.activeOffersLimit).to.equal(activeOffersLimit);
    expect(hubConfig.activeTradesLimit).to.equal(activeTradesLimit);
    expect(hubConfig.arbitrationFeePct).to.equal(arbitrationFeePct);
    expect(hubConfig.burnFeePct).to.equal(burnFeePct);
    
    // Verify updated timers and limits
    expect(hubConfig.tradeExpirationTimer.toNumber()).to.equal(tradeExpirationTimer);
    expect(hubConfig.tradeDisputeTimer.toNumber()).to.equal(tradeDisputeTimer);
    expect(hubConfig.tradeLimitMin.toNumber()).to.equal(tradeLimitMin);
    expect(hubConfig.tradeLimitMax.toNumber()).to.equal(tradeLimitMax);
    
    // Verify configuration state
    expect(hubConfig.isFullyConfigured).to.be.true;
    expect(hubConfig.localDenom).to.equal(localDenom);
  });

  it("Rejects update with excessive fees", async () => {
    try {
      await program.methods
        .updateConfig(
          offerAddr,
          tradeAddr,
          profileAddr,
          priceAddr,
          priceProviderAddr,
          localMarketAddr,
          "SOL",
          chainFeeCollectorAddr,
          warchestAddr,
          20, // activeOffersLimit 
          15, // activeTradesLimit
          300, // arbitrationFeePct (3%)
          300, // burnFeePct (3%)
          300, // chainFeePct (3%)
          300, // warchestFeePct (3%)
          new anchor.BN(172800), // tradeExpirationTimer
          new anchor.BN(86400), // tradeDisputeTimer
          new anchor.BN(5), // tradeLimitMin
          new anchor.BN(2000) // tradeLimitMax
        )
        .accounts({
          admin: adminPublicKey,
          hubConfig: hubConfigPda,
        })
        // No explicit .signers() needed
        .rpc();
      
      expect.fail("Expected transaction to fail due to excessive fees");
    } catch (error) {
      expect(error.message).to.include("FeeTooHigh");
    }
  });

  it("Updates the admin address", async () => {
    // Update admin
    await program.methods
      .updateAdmin(newAdmin.publicKey)
      .accounts({
        admin: adminPublicKey, // Current admin is provider.wallet
        hubConfig: hubConfigPda,
      })
      // No explicit .signers() needed
      .rpc();
    
    // Fetch the hub config and verify the admin was updated
    const hubConfig = await program.account.hubConfig.fetch(hubConfigPda);
    expect(hubConfig.admin.toString()).to.equal(newAdmin.publicKey.toString());
  });

  it("Rejects unauthorized config updates", async () => {
    try {
      // Try to update config with old admin (provider.wallet), but current admin is newAdmin
      await program.methods
        .updateConfig(
          offerAddr,
          tradeAddr,
          profileAddr,
          priceAddr,
          priceProviderAddr,
          localMarketAddr,
          "SOL",
          chainFeeCollectorAddr,
          warchestAddr,
          20, // activeOffersLimit 
          15, // activeTradesLimit
          100, // arbitrationFeePct
          100, // burnFeePct
          100, // chainFeePct
          100, // warchestFeePct
          new anchor.BN(172800), // tradeExpirationTimer
          new anchor.BN(86400), // tradeDisputeTimer
          new anchor.BN(5), // tradeLimitMin
          new anchor.BN(2000) // tradeLimitMax
        )
        .accounts({
          admin: adminPublicKey, // Trying provider.wallet as admin
          hubConfig: hubConfigPda,
        })
        // No explicit .signers() needed
        .rpc();
      
      expect.fail("Expected transaction to fail due to unauthorized access");
    } catch (error) {
      expect(error.message).to.include("Unauthorized");
    }
    
    // ***** Important: Change admin back for subsequent tests *****
    // Use the 'newAdmin' keypair (which now holds admin authority) to change it back to provider.wallet
    console.log("Changing admin back to original provider wallet...");
    await program.methods
      .updateAdmin(adminPublicKey) // Set admin back to provider.wallet
      .accounts({
        admin: newAdmin.publicKey, // Current admin is newAdmin
        hubConfig: hubConfigPda,
      })
      .signers([newAdmin]) // newAdmin MUST sign this
      .rpc();
    console.log("Admin changed back.");
    const finalConfig = await program.account.hubConfig.fetch(hubConfigPda);
    expect(finalConfig.admin.toString()).to.equal(adminPublicKey.toString()); // Verify it's back
  });
}); 