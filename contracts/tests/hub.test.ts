import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hub } from "../target/types/hub";
import { expect } from "chai";
import { getHubConfigPda, getHubTreasuryPda } from "./utils"; // Assuming utils exist from setup

describe("hub", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Hub as Program<Hub>;
  const admin = provider.wallet as anchor.Wallet; // Use provider's wallet as admin for tests
  const newAdmin = anchor.web3.Keypair.generate();
  const nonAdmin = anchor.web3.Keypair.generate();

  let hubConfigPda: anchor.web3.PublicKey;
  let hubTreasuryPda: anchor.web3.PublicKey;
  let hubConfigBump: number;
  let hubTreasuryBump: number;

  before(async () => {
    // Derive PDAs
    [hubConfigPda, hubConfigBump] = getHubConfigPda(program.programId);
    [hubTreasuryPda, hubTreasuryBump] = getHubTreasuryPda(program.programId);

    // Fund non-admin account for transaction fees
    await provider.connection.requestAirdrop(
        nonAdmin.publicKey,
        1 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
        newAdmin.publicKey,
        1 * anchor.web3.LAMPORTS_PER_SOL
    );
    // Short delay to allow airdrop confirmation
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it("Is initialized!", async () => {
    const defaultFeeRateBps = 100; // Example: 1%
    const defaultDisputeFeeBps = 50; // Example: 0.5%

    await program.methods
      .initialize(defaultFeeRateBps, defaultDisputeFeeBps)
      .accounts({
        hubConfig: hubConfigPda,
        hubTreasury: hubTreasuryPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const hubConfigAccount = await program.account.hubConfig.fetch(hubConfigPda);
    expect(hubConfigAccount.admin.equals(admin.publicKey)).to.be.true;
    expect(hubConfigAccount.feeRateBps).to.equal(defaultFeeRateBps);
    expect(hubConfigAccount.disputeFeeBps).to.equal(defaultDisputeFeeBps);
    expect(hubConfigAccount.hubTreasury.equals(hubTreasuryPda)).to.be.true;
    expect(hubConfigAccount.bump).to.equal(hubConfigBump);

    // Check treasury balance (should be rent-exempt minimum)
    const treasuryInfo = await provider.connection.getAccountInfo(hubTreasuryPda);
    expect(treasuryInfo.lamports).to.be.greaterThan(0);
  });

  it("Updates config", async () => {
    const newFeeRateBps = 150; // Example: 1.5%
    const newDisputeFeeBps = 75; // Example: 0.75%

    await program.methods
      .updateConfig(newFeeRateBps, newDisputeFeeBps)
      .accounts({
        hubConfig: hubConfigPda,
        admin: admin.publicKey,
      })
      .rpc();

    const hubConfigAccount = await program.account.hubConfig.fetch(hubConfigPda);
    expect(hubConfigAccount.feeRateBps).to.equal(newFeeRateBps);
    expect(hubConfigAccount.disputeFeeBps).to.equal(newDisputeFeeBps);
  });

  it("Fails to update config with non-admin", async () => {
    const feeRateBps = 200;
    const disputeFeeBps = 100;

    try {
      await program.methods
        .updateConfig(feeRateBps, disputeFeeBps)
        .accounts({
          hubConfig: hubConfigPda,
          admin: nonAdmin.publicKey, // Use non-admin keypair
        })
        .signers([nonAdmin]) // Sign with non-admin keypair
        .rpc();
      expect.fail("Should have failed to update config with non-admin");
    } catch (err) {
      // Check for AnchorError and ConstraintHasOne error
      // Note: Specific error code might vary, adjust as needed based on actual program error
      expect(err).to.be.instanceOf(anchor.AnchorError);
      expect((err as anchor.AnchorError).error.errorCode.code).to.equal("ConstraintHasOne");
      // Or check error message: expect(err.message).to.include("A has_one constraint was violated");
    }

    // Verify config was not changed
    const hubConfigAccount = await program.account.hubConfig.fetch(hubConfigPda);
    expect(hubConfigAccount.feeRateBps).to.not.equal(feeRateBps);
    expect(hubConfigAccount.disputeFeeBps).to.not.equal(disputeFeeBps);
  });


  it("Updates admin", async () => {
    await program.methods
      .updateAdmin(newAdmin.publicKey)
      .accounts({
        hubConfig: hubConfigPda,
        admin: admin.publicKey, // Current admin signs
      })
      .rpc();

    const hubConfigAccount = await program.account.hubConfig.fetch(hubConfigPda);
    expect(hubConfigAccount.admin.equals(newAdmin.publicKey)).to.be.true;

    // --- Test new admin can perform admin actions ---
    const feeRateAfterAdminChange = 250;
    const disputeFeeAfterAdminChange = 125;
    await program.methods
      .updateConfig(feeRateAfterAdminChange, disputeFeeAfterAdminChange)
      .accounts({
          hubConfig: hubConfigPda,
          admin: newAdmin.publicKey, // New admin signs
        })
      .signers([newAdmin]) // Sign with the new admin keypair
      .rpc();

    const updatedConfig = await program.account.hubConfig.fetch(hubConfigPda);
    expect(updatedConfig.feeRateBps).to.equal(feeRateAfterAdminChange);

    // --- Revert admin back for subsequent tests if needed ---
    // Note: If other tests depend on the original admin, revert here.
    // Otherwise, keep the new admin.
    await program.methods
        .updateAdmin(admin.publicKey) // Revert back to original admin
        .accounts({
            hubConfig: hubConfigPda,
            admin: newAdmin.publicKey, // Current new admin signs
        })
        .signers([newAdmin])
        .rpc();
    const revertedConfig = await program.account.hubConfig.fetch(hubConfigPda);
    expect(revertedConfig.admin.equals(admin.publicKey)).to.be.true;

  });

  it("Fails to update admin with non-admin", async () => {
    const evenNewerAdmin = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .updateAdmin(evenNewerAdmin.publicKey)
        .accounts({
          hubConfig: hubConfigPda,
          admin: nonAdmin.publicKey, // Non-admin tries to sign
        })
        .signers([nonAdmin])
        .rpc();
      expect.fail("Should have failed to update admin with non-admin");
    } catch (err) {
      // Check for AnchorError and ConstraintHasOne error
      expect(err).to.be.instanceOf(anchor.AnchorError);
      expect((err as anchor.AnchorError).error.errorCode.code).to.equal("ConstraintHasOne");
    }

    // Verify admin was not changed
    const hubConfigAccount = await program.account.hubConfig.fetch(hubConfigPda);
    // Assumes admin was reverted in the previous test
    expect(hubConfigAccount.admin.equals(admin.publicKey)).to.be.true;
  });

  // Add tests for service program registration later when those programs exist
  // it("Registers service program", async () => { ... });
}); 