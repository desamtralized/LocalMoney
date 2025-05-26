import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { Hub } from "../target/types/hub";
import { expect } from "chai";

describe("hub minimal test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Hub as Program<Hub>;
  const adminWallet = provider.wallet as anchor.Wallet;

  it("Initializes Hub config", async () => {
    // Derive PDA for HubConfig
    const [hubConfigPda, hubConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("hub")],
      program.programId
    );

    console.log("Program ID:", program.programId.toString());
    console.log("Hub Config PDA:", hubConfigPda.toString());
    console.log("Admin:", adminWallet.publicKey.toString());

    // Check if account already exists
    try {
      const existingAccount = await program.account.hubConfig.fetch(hubConfigPda);
      console.log("Account already exists:", existingAccount);
      return; // Skip initialization if already exists
    } catch (e) {
      console.log("Account doesn't exist, proceeding with initialization");
    }

    const dummyPubkey = () => Keypair.generate().publicKey;

    try {
      const tx = await program.methods
        .initialize(
          dummyPubkey(), // offerAddr
          dummyPubkey(), // tradeAddr
          dummyPubkey(), // profileAddr
          dummyPubkey(), // priceAddr
          dummyPubkey(), // priceProviderAddr
          dummyPubkey(), // localMarketAddr
          dummyPubkey(), // localDenomMint
          dummyPubkey(), // chainFeeCollectorAddr
          dummyPubkey(), // warchestAddr
          10,            // activeOffersLimit
          5,             // activeTradesLimit
          100,           // arbitrationFeeBps
          50,            // burnFeeBps
          100,           // chainFeeBps
          50,            // warchestFeeBps
          new anchor.BN(3600 * 24 * 7), // tradeExpirationTimer
          new anchor.BN(3600 * 24 * 3), // tradeDisputeTimer
          new anchor.BN(10),             // tradeLimitMinUsd
          new anchor.BN(1000)            // tradeLimitMaxUsd
        )
        .accounts({
          hubConfig: hubConfigPda,
          admin: adminWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([adminWallet.payer])
        .rpc();

      console.log("Transaction signature:", tx);

      // Verify the account was created
      const hubConfigAccount = await program.account.hubConfig.fetch(hubConfigPda);
      console.log("Hub config created successfully:", hubConfigAccount.admin.toString());
      expect(hubConfigAccount.admin.equals(adminWallet.publicKey)).to.be.true;
    } catch (error) {
      console.error("Error during initialization:", error);
      throw error;
    }
  });
}); 