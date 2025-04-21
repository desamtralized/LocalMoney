import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { Hub } from "../target/types/hub"; 
import { setupTestEnvironment, TestContext } from "./setupTests";

describe("Hub Program Tests", () => {
    let context: TestContext;

    before(async () => {
        console.log("Setting up Hub test environment...");
        try {
            context = await setupTestEnvironment();
            console.log("Hub test environment setup complete.");
        } catch (error) {
            console.error("Failed to set up test environment:", error);
            throw error; // Fail fast if setup fails
        }
    });

    it("Initializes the Hub correctly", async () => {
        assert.ok(context, "Test context should be initialized");
        assert.ok(context.program.hub, "Hub program client should exist");
        assert.ok(context.hubPda, "Hub PDA should exist");

        // Fetch the created hub account
        const hubAccount = await context.program.hub.account.hub.fetch(context.hubPda);

        // Assertions
        assert.ok(hubAccount, "Hub account should exist on-chain");
        assert.equal(
            hubAccount.admin.toBase58(),
            context.users.admin.publicKey.toBase58(),
            "Hub admin should be the admin user set during initialization"
        );
        assert.equal(hubAccount.bump, context.hubBump, "Hub bump should match derived bump");

        // Check some config values (example)
        assert.equal(
            hubAccount.config.offerProgram.toBase58(),
            context.program.offer.programId.toBase58(),
            "Stored Offer program ID should match workspace program ID"
        );
         assert.equal(
            hubAccount.config.tradeProgram.toBase58(),
            context.program.trade.programId.toBase58(),
            "Stored Trade program ID should match workspace program ID"
        );
         assert.equal(
            hubAccount.config.profileProgram.toBase58(),
            context.program.profile.programId.toBase58(),
            "Stored Profile program ID should match workspace program ID"
        );
        assert.equal(
            hubAccount.config.localTokenMint.toBase58(),
            context.mints.mockUsdcMint.publicKey.toBase58(),
            "Stored local token mint should match the created mock USDC mint"
        );
         assert.equal(hubAccount.config.activeOffersLimit, 10, "Default active offers limit mismatch");

        console.log("Hub initialization test passed.");
    });

    // Add more tests for update_config, transfer_admin etc.
    it("Updates the Hub config", async () => {
        // TODO: Implement test for update_config instruction
         assert.fail("Test not implemented");
    });

    it("Transfers admin rights", async () => {
        // TODO: Implement test for transfer_admin instruction
        assert.fail("Test not implemented");
    });
}); 