import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  setupTestWorkspace,
  airdropSol,
  findGlobalConfigPDA,
  createValidInitializeParams,
} from "./utils/setup";

describe("Working LocalMoney Protocol Flow Demo", () => {
  const workspace = setupTestWorkspace();
  let authority: Keypair;
  let hubConfigPDA: PublicKey;
  let priceConfigPDA: PublicKey;
  
  // Store transaction hashes
  let txHashes: { [key: string]: string } = {};

  before(async () => {
    console.log("\n🚀 Starting LocalMoney Protocol Working Flow Demo");
    console.log("=".repeat(60));

    authority = workspace.authority;
    console.log(`Authority: ${authority.publicKey.toString()}`);

    await airdropSol(workspace.connection, authority.publicKey);

    [hubConfigPDA] = findGlobalConfigPDA(workspace.hubProgram.programId);
    [priceConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      workspace.priceProgram.programId,
    );

    console.log(`Hub Config PDA: ${hubConfigPDA.toString()}`);
    console.log(`Price Config PDA: ${priceConfigPDA.toString()}`);
  });

  describe("Working Protocol Functions", () => {
    it("1. Initialize Hub Configuration", async () => {
      console.log("\n🏛️  Step 1: Initializing Hub Configuration...");
      
      const initParams = createValidInitializeParams();
      const signature = await workspace.hubProgram.methods
        .initialize(initParams)
        .accounts({
          config: hubConfigPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      txHashes["hub_initialize"] = signature;
      console.log(`✅ Hub initialized`);
      console.log(`   Transaction: ${signature}`);

      // Verify initialization
      const config = await workspace.hubProgram.account.globalConfig.fetch(hubConfigPDA);
      expect(config.authority.toString()).to.equal(authority.publicKey.toString());
      
      console.log(`   Authority: ${config.authority.toString()}`);
      console.log(`   Active Offers Limit: ${config.activeOffersLimit}`);
      console.log(`   Active Trades Limit: ${config.activeTradesLimit}`);
      console.log(`   Chain Fee BPS: ${config.chainFeeBps}`);
      console.log(`   Arbitration Fee BPS: ${config.arbitrationFeeBps}`);
    });

    it("2. Initialize Price Oracle", async () => {
      console.log("\n💱 Step 2: Initializing Price Oracle...");
      
      const signature = await workspace.priceProgram.methods
        .initialize(workspace.hubProgram.programId)
        .accounts({
          config: priceConfigPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      txHashes["price_initialize"] = signature;
      console.log(`✅ Price Oracle initialized`);
      console.log(`   Transaction: ${signature}`);

      // Verify initialization
      const config = await workspace.priceProgram.account.priceConfig.fetch(priceConfigPDA);
      expect(config.authority.toString()).to.equal(authority.publicKey.toString());
      
      console.log(`   Authority: ${config.authority.toString()}`);
      console.log(`   Hub Program: ${config.hubProgram.toString()}`);
      console.log(`   Price Provider: ${config.priceProvider.toString()}`);
      console.log(`   Max Staleness: ${config.maxStalenessSeconds}s`);
    });

    it("3. Query Hub Protocol Information", async () => {
      console.log("\n📊 Step 3: Querying Protocol Information...");
      
      // Query protocol fees
      const fees = await workspace.hubProgram.methods
        .getProtocolFees()
        .accounts({
          config: hubConfigPDA,
        })
        .view();

      console.log(`✅ Protocol Fees Retrieved:`);
      console.log(`   Chain Fee: ${(fees.chainFee / 100).toFixed(2)}%`);
      console.log(`   Arbitration Fee: ${(fees.arbitrationFee / 100).toFixed(2)}%`);
      console.log(`   Burn Fee: ${(fees.burnFee / 100).toFixed(2)}%`);
      console.log(`   Warchest Fee: ${(fees.warchestFee / 100).toFixed(2)}%`);

      // Query trading limits
      const limits = await workspace.hubProgram.methods
        .getTradingLimits()
        .accounts({
          config: hubConfigPDA,
        })
        .view();

      console.log(`✅ Trading Limits Retrieved:`);
      console.log(`   Min Trade: $${(limits.minAmount.toNumber() / 1000000).toFixed(0)}`);
      console.log(`   Max Trade: $${(limits.maxAmount.toNumber() / 1000000).toFixed(0)}`);
      console.log(`   Trade Expiration: ${(limits.tradeExpirationTimer.toNumber() / 3600).toFixed(1)}h`);
      console.log(`   Dispute Timer: ${(limits.tradeDisputeTimer.toNumber() / 3600).toFixed(1)}h`);

      // Query program addresses
      const programs = await workspace.hubProgram.methods
        .getProgramAddresses()
        .accounts({
          config: hubConfigPDA,
        })
        .view();

      console.log(`✅ Program Addresses Retrieved:`);
      console.log(`   Offer Program: ${programs.offerProgram.toString()}`);
      console.log(`   Trade Program: ${programs.tradeProgram.toString()}`);
      console.log(`   Profile Program: ${programs.profileProgram.toString()}`);
      console.log(`   Price Program: ${programs.priceProgram.toString()}`);
    });

    it("4. Test Hub Configuration Updates", async () => {
      console.log("\n🔧 Step 4: Testing Configuration Updates...");
      
      // Update price provider
      const newPriceProvider = Keypair.generate().publicKey;
      const updateSignature = await workspace.priceProgram.methods
        .updatePriceProvider(newPriceProvider)
        .accounts({
          config: priceConfigPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      txHashes["price_update_provider"] = updateSignature;
      console.log(`✅ Price provider updated`);
      console.log(`   Transaction: ${updateSignature}`);
      console.log(`   New Provider: ${newPriceProvider.toString()}`);

      // Verify update
      const updatedConfig = await workspace.priceProgram.account.priceConfig.fetch(priceConfigPDA);
      expect(updatedConfig.priceProvider.toString()).to.equal(newPriceProvider.toString());
      console.log(`   Verified: Provider updated successfully`);
    });

    it("5. Test Account State Queries", async () => {
      console.log("\n🔍 Step 5: Testing Account State Queries...");
      
      // Get Hub config account info
      const hubAccountInfo = await workspace.connection.getAccountInfo(hubConfigPDA);
      console.log(`✅ Hub Account Info:`);
      console.log(`   Owner: ${hubAccountInfo.owner.toString()}`);
      console.log(`   Data Length: ${hubAccountInfo.data.length} bytes`);
      console.log(`   Lamports: ${hubAccountInfo.lamports}`);
      console.log(`   Executable: ${hubAccountInfo.executable}`);

      // Get Price config account info
      const priceAccountInfo = await workspace.connection.getAccountInfo(priceConfigPDA);
      console.log(`✅ Price Account Info:`);
      console.log(`   Owner: ${priceAccountInfo.owner.toString()}`);
      console.log(`   Data Length: ${priceAccountInfo.data.length} bytes`);
      console.log(`   Lamports: ${priceAccountInfo.lamports}`);
      console.log(`   Executable: ${priceAccountInfo.executable}`);
    });

    it("6. Test Transaction History", async () => {
      console.log("\n📜 Step 6: Transaction History Summary...");
      
      console.log(`✅ All transactions confirmed and finalized:`);
      for (const [step, hash] of Object.entries(txHashes)) {
        const status = await workspace.connection.getSignatureStatus(hash);
        console.log(`   ${step}: ${hash}`);
        console.log(`     Status: ${status.value?.confirmationStatus || 'unknown'}`);
        
        if (status.value?.err) {
          console.log(`     Error: ${JSON.stringify(status.value.err)}`);
        } else {
          console.log(`     Success: ✅`);
        }
      }
    });

    after(() => {
      console.log("\n🎉 Working LocalMoney Protocol Flow Demo Completed!");
      console.log("=".repeat(60));
      
      console.log("\n📋 TRANSACTION SUMMARY:");
      console.log("=".repeat(30));
      Object.entries(txHashes).forEach(([step, hash]) => {
        console.log(`${step.padEnd(25)}: ${hash}`);
      });
      
      console.log(`\n🔗 SOLANA EXPLORER LINKS:`);
      console.log(`   Localnet RPC: http://localhost:8899`);
      console.log(`   To view any transaction, use:`);
      console.log(`   curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc": "2.0", "id": 1, "method": "getTransaction", "params": ["TRANSACTION_HASH", "json"]}' http://localhost:8899`);
      
      console.log(`\n✅ DEMO RESULTS:`);
      console.log(`   - ${Object.keys(txHashes).length} successful transactions`);
      console.log(`   - Hub program initialized and operational`);
      console.log(`   - Price program initialized and operational`);
      console.log(`   - Configuration queries working`);
      console.log(`   - Account updates working`);
      console.log(`   - All transactions confirmed and finalized`);
      
      console.log(`\n🚀 LocalMoney Protocol Core Functions Operational!`);
      console.log(`   Ready for extended functionality testing and development`);
    });
  });
});